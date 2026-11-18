import { randomUUID } from "node:crypto";
import {
  and,
  count,
  desc,
  eq,
  gt,
  inArray,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  assetUploadIntents,
  auditEvent,
  printerShop,
  productImages,
  products,
  shopMembership,
} from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { err, ok, type AppError, type Result } from "@/lib/domain/result";
import { logger } from "@/lib/log/logger";
import {
  MAX_PRODUCT_PHOTO_BYTES,
  MAX_PRODUCT_PHOTO_PIXELS,
  MAX_PRODUCT_PHOTOS,
  assetUploadFailureCodeSchema,
  type AssetUploadFailureCode,
  type ProductPhotoIntentInput,
} from "@/lib/storage/asset-upload";
import {
  copyPrivateObject,
  createPrivateReadUrl,
  createPrivateUploadUrl,
  deletePrivateObject,
  deletePublicObject,
  inspectPrivateObject,
  putPublicObject,
  readPrivateObject,
} from "@/lib/storage/r2";
import {
  createPublicWebp,
  ImageValidationError,
} from "@/lib/storage/image-processing";
import { enqueueAssetProcessing } from "@/lib/jobs/printer-assets";

const INTENT_LIFETIME_MS = 15 * 60 * 1000;
const RESERVED_INTENT_STATUSES = ["reserved", "uploading", "processing"] as const;

type AssetServiceError = AppError;

export type RequestProductPhotoIntentResult = {
  intentId: string;
  uploadUrl: string;
  requiredHeaders: { "content-type": string };
  expiresAt: string;
};

function isCatalogManager(role: string, status: string): boolean {
  return status === "active" && (role === "owner" || role === "manager");
}

function errorFromUploadCode(code: string): AssetServiceError {
  const messages = {
    INVALID_TYPE: "Choose a PNG, JPEG, or WebP image.",
    INVALID_IMAGE: "This file is not a valid image. Choose another photo.",
    ANIMATED_IMAGE: "Animated images are not supported. Choose a still photo.",
    FILE_TOO_LARGE: "Choose a photo that is 5 MB or smaller.",
    IMAGE_TOO_LARGE: "Choose an image with no more than 40 megapixels.",
    INTENT_EXPIRED: "This upload expired. Start a new upload to try again.",
    STORAGE_UNAVAILABLE:
      "Photo storage is unavailable right now. Try again with a new upload.",
    PROCESSING_FAILED:
      "We could not process this photo. Try again with a new upload.",
  } satisfies Record<AssetUploadFailureCode, string>;
  const parsed = assetUploadFailureCodeSchema.safeParse(code);
  const safeCode = parsed.success ? parsed.data : "PROCESSING_FAILED";
  return { code: safeCode, message: messages[safeCode] };
}

async function setIntentFailure(
  intentId: string,
  code: AssetUploadFailureCode,
  statuses: readonly ("reserved" | "uploading" | "processing")[] = [
    "reserved",
    "uploading",
  ],
): Promise<void> {
  await db
    .update(assetUploadIntents)
    .set({ status: "failed", failureCode: code })
    .where(
      and(
        eq(assetUploadIntents.id, intentId),
        inArray(assetUploadIntents.status, [...statuses]),
      ),
    );
}

export async function requestProductPhotoIntent(input: {
  shopId: string;
  actorUserId: string;
  intent: ProductPhotoIntentInput;
}): Promise<Result<RequestProductPhotoIntentResult, AssetServiceError>> {
  const now = new Date();
  const intentId = randomUUID();
  const temporaryObjectKey = `staging/${randomUUID()}`;
  const expiresAt = new Date(now.getTime() + INTENT_LIFETIME_MS);

  let reservation: Result<{ intentId: string }, AssetServiceError>;
  try {
    reservation = await db.transaction(async (tx) => {
      const [membership] = await tx
        .select({ role: shopMembership.role, status: shopMembership.status })
        .from(shopMembership)
        .where(
          and(
            eq(shopMembership.shopId, input.shopId),
            eq(shopMembership.userId, input.actorUserId),
          ),
        )
        .limit(1);
      if (!membership || !isCatalogManager(membership.role, membership.status)) {
        return err({
          code: "shop.forbidden",
          message: "Only active shop owners and managers can upload product photos.",
        });
      }

      const [product] = await tx
        .select({
          id: products.id,
          shopId: products.shopId,
          status: products.status,
          visibilityTransition: products.visibilityTransition,
        })
        .from(products)
        .where(
          and(
            eq(products.id, input.intent.productId),
            eq(products.shopId, input.shopId),
          ),
        )
        .for("update")
        .limit(1);
      if (!product) {
        return err({ code: "product.not_found", message: "Product not found." });
      }
      if (product.status === "archived" || product.visibilityTransition) {
        return err({
          code: "product.unavailable",
          message: "Photos cannot be added while this product is unavailable.",
        });
      }

      const [shop] = await tx
        .select({
          status: printerShop.status,
          visibilityTransition: printerShop.visibilityTransition,
        })
        .from(printerShop)
        .where(eq(printerShop.id, input.shopId))
        .limit(1);
      if (!shop || shop.status === "suspended" || shop.visibilityTransition) {
        return err({
          code: "shop.unavailable",
          message: "Photos cannot be added while this shop is unavailable.",
        });
      }

      const [photoCount] = await tx
        .select({ value: count() })
        .from(productImages)
        .where(eq(productImages.productId, input.intent.productId));
      const [intentCount] = await tx
        .select({ value: count() })
        .from(assetUploadIntents)
        .where(
          and(
            eq(assetUploadIntents.productId, input.intent.productId),
            inArray(assetUploadIntents.status, [...RESERVED_INTENT_STATUSES]),
            gt(assetUploadIntents.expiresAt, now),
          ),
        );
      if (Number(photoCount?.value ?? 0) + Number(intentCount?.value ?? 0) >= MAX_PRODUCT_PHOTOS) {
        return err({
          code: "upload.photo_limit",
          message: "A product can have no more than five photos, including uploads in progress.",
        });
      }

      await tx.insert(assetUploadIntents).values({
        id: intentId,
        shopId: input.shopId,
        productId: input.intent.productId,
        uploaderId: input.actorUserId,
        assetType: "product_photo",
        temporaryObjectKey,
        expectedContentType: input.intent.contentType,
        expectedSizeBytes: input.intent.sizeBytes,
        altText: input.intent.altText.trim(),
        attestsRealProduct: true,
        expiresAt,
        status: "reserved",
        failureCode: null,
        resultReference: null,
      });
      await tx.insert(auditEvent).values({
        id: randomUUID(),
        actorUserId: input.actorUserId,
        targetType: "product",
        targetId: input.intent.productId,
        action: "product.photo.upload_intent",
        detailsJson: { intentId },
      });
      return ok({ intentId });
    });
  } catch (error) {
    logger.error("printer_asset.intent_create_failed", {
      event: "printer_asset.intent_create_failed",
      intentId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return err({
      code: "upload.intent_create_failed",
      message: "Could not reserve a photo upload. Try again.",
    });
  }

  if (!reservation.ok) return reservation;

  try {
    const uploadUrl = await createPrivateUploadUrl({
      key: temporaryObjectKey,
      contentType: input.intent.contentType,
      contentLength: input.intent.sizeBytes,
    });
    logger.info("printer_asset.intent_created", {
      event: "printer_asset.intent_created",
      intentId,
      productId: input.intent.productId,
    });
    return ok({
      intentId,
      uploadUrl,
      requiredHeaders: { "content-type": input.intent.contentType },
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    try {
      await setIntentFailure(intentId, "STORAGE_UNAVAILABLE", ["reserved"]);
    } catch (databaseError) {
      logger.error("printer_asset.intent_failure_update_failed", {
        event: "printer_asset.intent_failure_update_failed",
        intentId,
        error: databaseError instanceof Error ? databaseError.name : "UnknownError",
      });
    }
    logger.error("printer_asset.sign_upload_failed", {
      event: "printer_asset.sign_upload_failed",
      intentId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return err(errorFromUploadCode("STORAGE_UNAVAILABLE"));
  }
}

export async function finalizeProductPhotoIntent(input: {
  shopId: string;
  actorUserId: string;
  intentId: string;
}): Promise<Result<{ intentId: string; status: string }, AssetServiceError>> {
  const [intent] = await db
    .select()
    .from(assetUploadIntents)
    .where(
      and(
        eq(assetUploadIntents.id, input.intentId),
        eq(assetUploadIntents.shopId, input.shopId),
      ),
    )
    .limit(1);
  if (!intent || intent.assetType !== "product_photo" || !intent.productId) {
    return err({ code: "upload.not_found", message: "Photo upload not found." });
  }

  const [membership] = await db
    .select({ role: shopMembership.role, status: shopMembership.status })
    .from(shopMembership)
    .where(
      and(
        eq(shopMembership.shopId, intent.shopId),
        eq(shopMembership.userId, input.actorUserId),
      ),
    )
    .limit(1);
  if (!membership || !isCatalogManager(membership.role, membership.status)) {
    return err({
      code: "shop.forbidden",
      message: "Only active shop owners and managers can finalize product photos.",
    });
  }

  if (intent.status === "complete") {
    return ok({ intentId: intent.id, status: intent.status });
  }
  if (intent.status === "failed" && intent.failureCode) {
    return err(errorFromUploadCode(intent.failureCode));
  }
  if (intent.status === "expired" || intent.expiresAt <= new Date()) {
    await db
      .update(assetUploadIntents)
      .set({ status: "expired", failureCode: "INTENT_EXPIRED" })
      .where(eq(assetUploadIntents.id, intent.id));
    return err(errorFromUploadCode("INTENT_EXPIRED"));
  }
  if (intent.status === "cancelled") {
    return err({ code: "upload.cancelled", message: "This photo upload was cancelled." });
  }

  let object: Awaited<ReturnType<typeof inspectPrivateObject>>;
  try {
    object = await inspectPrivateObject(intent.temporaryObjectKey);
  } catch (error) {
    logger.error("printer_asset.object_inspection_failed", {
      event: "printer_asset.object_inspection_failed",
      intentId: intent.id,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return err(errorFromUploadCode("STORAGE_UNAVAILABLE"));
  }
  if (!object) {
    return err({
      code: "STORAGE_UNAVAILABLE",
      message: "The uploaded photo is not available yet. Try again.",
    });
  }
  if (object.contentLength > MAX_PRODUCT_PHOTO_BYTES) {
    await setIntentFailure(intent.id, "FILE_TOO_LARGE");
    return err(errorFromUploadCode("FILE_TOO_LARGE"));
  }
  if (object.contentLength !== intent.expectedSizeBytes) {
    await setIntentFailure(intent.id, "INVALID_IMAGE");
    return err(errorFromUploadCode("INVALID_IMAGE"));
  }
  if (object.contentType !== intent.expectedContentType) {
    await setIntentFailure(intent.id, "INVALID_TYPE");
    return err(errorFromUploadCode("INVALID_TYPE"));
  }

  const [claimed] = await db
    .update(assetUploadIntents)
    .set({ status: "processing" })
    .where(
      and(
        eq(assetUploadIntents.id, intent.id),
        inArray(assetUploadIntents.status, ["reserved", "uploading"]),
      ),
    )
    .returning({ id: assetUploadIntents.id });

  if (!claimed && intent.status !== "processing") {
    const [current] = await db
      .select({ status: assetUploadIntents.status })
      .from(assetUploadIntents)
      .where(eq(assetUploadIntents.id, intent.id))
      .limit(1);
    if (current?.status === "complete") {
      return ok({ intentId: intent.id, status: "complete" });
    }
    if (current?.status !== "processing") {
      return err({
        code: "upload.state_conflict",
        message: "This photo upload is no longer available for processing.",
      });
    }
  }

  try {
    await enqueueAssetProcessing(intent.id);
  } catch (error) {
    try {
      await setIntentFailure(intent.id, "STORAGE_UNAVAILABLE", ["processing"]);
    } catch (databaseError) {
      logger.error("printer_asset.queue_failure_update_failed", {
        event: "printer_asset.queue_failure_update_failed",
        intentId: intent.id,
        error: databaseError instanceof Error ? databaseError.name : "UnknownError",
      });
    }
    logger.error("printer_asset.enqueue_failed", {
      event: "printer_asset.enqueue_failed",
      intentId: intent.id,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return err(errorFromUploadCode("STORAGE_UNAVAILABLE"));
  }

  return ok({ intentId: intent.id, status: "processing" });
}

export async function getProductPhotoIntentStatus(input: {
  shopId: string;
  actorUserId: string;
  intentId: string;
}): Promise<Result<{
  intentId: string;
  status: string;
  failureCode: AssetUploadFailureCode | null;
  imageId: string | null;
}, AssetServiceError>> {
  const [intent] = await db
    .select()
    .from(assetUploadIntents)
    .where(
      and(
        eq(assetUploadIntents.id, input.intentId),
        eq(assetUploadIntents.shopId, input.shopId),
      ),
    )
    .limit(1);
  if (!intent || intent.assetType !== "product_photo") {
    return err({ code: "upload.not_found", message: "Photo upload not found." });
  }
  const [membership] = await db
    .select({ role: shopMembership.role, status: shopMembership.status })
    .from(shopMembership)
    .where(
      and(
        eq(shopMembership.shopId, intent.shopId),
        eq(shopMembership.userId, input.actorUserId),
      ),
    )
    .limit(1);
  if (!membership || !isCatalogManager(membership.role, membership.status)) {
    return err({
      code: "shop.forbidden",
      message: "Only active shop owners and managers can view upload status.",
    });
  }

  return ok({
    intentId: intent.id,
    status: intent.status,
    failureCode: intent.failureCode
      ? assetUploadFailureCodeSchema.parse(intent.failureCode)
      : null,
    imageId: intent.status === "complete" ? intent.resultReference : null,
  });
}

export async function createProductPhotoPreviewUrl(input: {
  shopId: string;
  actorUserId: string;
  imageId: string;
}): Promise<Result<{ url: string; expiresInSeconds: number }, AssetServiceError>> {
  const [image] = await db
    .select({
      objectKey: productImages.objectKey,
      shopId: products.shopId,
    })
    .from(productImages)
    .innerJoin(products, eq(productImages.productId, products.id))
    .where(
      and(
        eq(productImages.id, input.imageId),
        eq(products.shopId, input.shopId),
      ),
    )
    .limit(1);
  if (!image) {
    return err({ code: "asset.not_found", message: "Photo not found." });
  }

  const [membership] = await db
    .select({ role: shopMembership.role, status: shopMembership.status })
    .from(shopMembership)
    .where(
      and(
        eq(shopMembership.shopId, image.shopId),
        eq(shopMembership.userId, input.actorUserId),
      ),
    )
    .limit(1);
  if (!membership || !isCatalogManager(membership.role, membership.status)) {
    return err({
      code: "shop.forbidden",
      message: "Only active shop owners and managers can preview product photos.",
    });
  }

  try {
    return ok({ url: await createPrivateReadUrl(image.objectKey), expiresInSeconds: 300 });
  } catch (error) {
    logger.error("printer_asset.preview_sign_failed", {
      event: "printer_asset.preview_sign_failed",
      imageId: input.imageId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return err(errorFromUploadCode("STORAGE_UNAVAILABLE"));
  }
}

export async function getProductPhotoEditorData(input: {
  shopId: string;
  actorUserId: string;
  productId: string;
}): Promise<Result<{
  product: { id: string; name: string; status: string };
  photos: Array<{ id: string; altText: string; sortOrder: number }>;
  reservedCount: number;
}, AssetServiceError>> {
  const [membership] = await db
    .select({ role: shopMembership.role, status: shopMembership.status })
    .from(shopMembership)
    .where(
      and(
        eq(shopMembership.shopId, input.shopId),
        eq(shopMembership.userId, input.actorUserId),
      ),
    )
    .limit(1);
  if (!membership || !isCatalogManager(membership.role, membership.status)) {
    return err({
      code: "shop.forbidden",
      message: "Only active shop owners and managers can manage product photos.",
    });
  }

  const [product] = await db
    .select({ id: products.id, name: products.name, status: products.status })
    .from(products)
    .where(and(eq(products.id, input.productId), eq(products.shopId, input.shopId)))
    .limit(1);
  if (!product) {
    return err({ code: "product.not_found", message: "Product not found." });
  }

  const photos = await db
    .select({
      id: productImages.id,
      altText: productImages.altText,
      sortOrder: productImages.sortOrder,
    })
    .from(productImages)
    .where(eq(productImages.productId, input.productId))
    .orderBy(productImages.sortOrder);
  const [reservedCount] = await db
    .select({ value: count() })
    .from(assetUploadIntents)
    .where(
      and(
        eq(assetUploadIntents.productId, input.productId),
        inArray(assetUploadIntents.status, [...RESERVED_INTENT_STATUSES]),
        gt(assetUploadIntents.expiresAt, new Date()),
      ),
    );

  return ok({
    product,
    photos,
    reservedCount: Number(reservedCount?.value ?? 0),
  });
}

export class PermanentAssetError extends Error {
  constructor(readonly failureCode: AssetUploadFailureCode) {
    super(failureCode);
    this.name = "PermanentAssetError";
  }
}

export async function processProductPhotoIntent(intentId: string): Promise<void> {
  const [intent] = await db
    .select()
    .from(assetUploadIntents)
    .where(eq(assetUploadIntents.id, intentId))
    .limit(1);
  if (!intent || intent.assetType !== "product_photo" || !intent.productId) {
    throw new PermanentAssetError("INVALID_IMAGE");
  }
  if (intent.status === "complete") {
    await deletePrivateObject(intent.temporaryObjectKey);
    return;
  }
  if (intent.status !== "processing") {
    throw new PermanentAssetError("PROCESSING_FAILED");
  }
  const productId = intent.productId;
  const altText = intent.altText;
  if (!altText || !intent.attestsRealProduct) {
    throw new PermanentAssetError("INVALID_IMAGE");
  }

  const bytes = await readPrivateObject(intent.temporaryObjectKey);
  if (bytes.byteLength > MAX_PRODUCT_PHOTO_BYTES) {
    throw new PermanentAssetError("FILE_TOO_LARGE");
  }

  let processed: Awaited<ReturnType<typeof createPublicWebp>>;
  try {
    processed = await createPublicWebp(bytes, intent.expectedContentType);
  } catch (error) {
    if (error instanceof ImageValidationError) {
      throw new PermanentAssetError(error.failureCode);
    }
    throw error;
  }

  const originalKey = `originals/${intent.shopId}/${intent.productId}/${intent.id}`;
  const publicKey = `products/${intent.shopId}/${intent.productId}/${intent.id}.webp`;

  await db.transaction(async (tx) => {
    const [lockedIntent] = await tx
      .select({ status: assetUploadIntents.status })
      .from(assetUploadIntents)
      .where(eq(assetUploadIntents.id, intent.id))
      .for("update")
      .limit(1);
    if (!lockedIntent || lockedIntent.status === "complete") return;
    if (lockedIntent.status !== "processing") {
      throw new PermanentAssetError("PROCESSING_FAILED");
    }

    const [lockedShop] = await tx
      .select({
        status: printerShop.status,
        visibilityTransition: printerShop.visibilityTransition,
      })
      .from(printerShop)
      .where(eq(printerShop.id, intent.shopId))
      .for("update")
      .limit(1);
    const [lockedProduct] = await tx
      .select({
        id: products.id,
        status: products.status,
        visibilityTransition: products.visibilityTransition,
      })
      .from(products)
      .where(eq(products.id, productId))
      .for("update")
      .limit(1);
    if (
      !lockedProduct ||
      !lockedShop ||
      lockedProduct.status === "archived" ||
      lockedShop.status === "suspended" ||
      lockedProduct.visibilityTransition ||
      lockedShop.visibilityTransition
    ) {
      throw new PermanentAssetError("PROCESSING_FAILED");
    }

    const shouldPublish =
      lockedProduct.status === "published" && lockedShop.status === "published";
    const [lastImage] = await tx
      .select({ sortOrder: productImages.sortOrder })
      .from(productImages)
      .where(eq(productImages.productId, productId))
      .orderBy(desc(productImages.sortOrder))
      .limit(1);
    const [currentCount] = await tx
      .select({ value: count() })
      .from(productImages)
      .where(eq(productImages.productId, productId));
    if (Number(currentCount?.value ?? 0) >= MAX_PRODUCT_PHOTOS) {
      throw new PermanentAssetError("PROCESSING_FAILED");
    }

    await copyPrivateObject({
      sourceKey: intent.temporaryObjectKey,
      destinationKey: originalKey,
      contentType: processed.contentType,
    });
    if (shouldPublish) {
      await putPublicObject({
        key: publicKey,
        body: processed.bytes,
        contentType: "image/webp",
      });
    }

    await tx
      .insert(productImages)
      .values({
        id: intent.id,
        productId,
        objectKey: originalKey,
        publicObjectKey: shouldPublish ? publicKey : null,
        altText,
        sortOrder: lastImage ? lastImage.sortOrder + 1 : 0,
        attestedByUserId: intent.uploaderId,
        attestedAt: intent.createdAt,
      })
      .onConflictDoNothing();
    await tx
      .update(assetUploadIntents)
      .set({
        status: "complete",
        failureCode: null,
        resultReference: intent.id,
        completedAt: new Date(),
      })
      .where(eq(assetUploadIntents.id, intent.id));
    await tx
      .update(products)
      .set({ version: sql`${products.version} + 1` })
      .where(eq(products.id, productId));
    await tx.insert(auditEvent).values({
      id: randomUUID(),
      actorUserId: intent.uploaderId,
      targetType: "product",
      targetId: productId,
      action: "product.photo.finalize",
      detailsJson: { imageId: intent.id },
    });
  });

  await deletePrivateObject(intent.temporaryObjectKey);
}

export async function markProductPhotoIntentFailed(
  intentId: string,
  failureCode: AssetUploadFailureCode,
): Promise<void> {
  await db
    .update(assetUploadIntents)
    .set({ status: "failed", failureCode })
    .where(
      and(
        eq(assetUploadIntents.id, intentId),
        eq(assetUploadIntents.status, "processing"),
      ),
    );
}

export async function cleanupExpiredProductPhotoIntents(): Promise<number> {
  const now = new Date();
  const expired = await db
    .select({
      id: assetUploadIntents.id,
      shopId: assetUploadIntents.shopId,
      productId: assetUploadIntents.productId,
      temporaryObjectKey: assetUploadIntents.temporaryObjectKey,
      status: assetUploadIntents.status,
    })
    .from(assetUploadIntents)
    .where(
      or(
        and(
          eq(assetUploadIntents.assetType, "product_photo"),
          inArray(assetUploadIntents.status, ["failed", "expired", "cancelled"]),
          isNull(assetUploadIntents.completedAt),
        ),
        and(
          eq(assetUploadIntents.assetType, "product_photo"),
          inArray(assetUploadIntents.status, ["reserved", "uploading"]),
          lt(assetUploadIntents.expiresAt, now),
        ),
      ),
    )
    .limit(100);

  for (const intent of expired) {
    if (intent.status === "reserved" || intent.status === "uploading") {
      const [claimed] = await db
        .update(assetUploadIntents)
        .set({ status: "expired", failureCode: "INTENT_EXPIRED" })
        .where(
          and(
            eq(assetUploadIntents.id, intent.id),
            inArray(assetUploadIntents.status, ["reserved", "uploading"]),
            lt(assetUploadIntents.expiresAt, now),
          ),
        )
        .returning({ id: assetUploadIntents.id });
      if (!claimed) continue;
    }

    await deletePrivateObject(intent.temporaryObjectKey);
    if (intent.productId) {
      await deletePrivateObject(
        `originals/${intent.shopId}/${intent.productId}/${intent.id}`,
      );
      await deletePublicObject(
        `products/${intent.shopId}/${intent.productId}/${intent.id}.webp`,
      );
    }
    await db
      .update(assetUploadIntents)
      .set({ completedAt: now })
      .where(and(eq(assetUploadIntents.id, intent.id), isNull(assetUploadIntents.completedAt)));
  }
  return expired.length;
}

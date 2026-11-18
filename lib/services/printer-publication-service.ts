import { randomUUID } from "node:crypto";
import {
  and,
  count,
  eq,
  inArray,
  isNotNull,
  sql,
} from "drizzle-orm";
import {
  auditEvent,
  printerShop,
  productImages,
  productVariants,
  products,
  publicationTransitions,
  shopMembership,
} from "@/lib/db/schema";
import { db } from "@/lib/db/client";
import { err, ok, type AppError, type Result } from "@/lib/domain/result";
import { NIGERIAN_STATES } from "@/lib/domain/nigerian-states";
import { logger } from "@/lib/log/logger";
import {
  enqueueProductPublication,
  enqueueShopPublication,
} from "@/lib/jobs/printer-assets";
import { createPublicWebp, ImageValidationError } from "@/lib/storage/image-processing";
import {
  deletePublicObject,
  putPublicObject,
  readPrivateObject,
} from "@/lib/storage/r2";

type TransitionStatus = "queued" | "processing" | "retryable_failed" | "complete";
type PublicationError = AppError;
export type TransitionRequest = {
  transitionId: string | null;
  status: TransitionStatus;
};
type ProductImage = {
  id: string;
  objectKey: string;
  altText: string;
  sortOrder: number;
  attestedByUserId: string | null;
  attestedAt: Date | null;
  publicObjectKey?: string | null;
};

const ACTIVE_TRANSITION_STATUSES = [
  "queued",
  "processing",
  "retryable_failed",
] as const;
const PRODUCT_CATEGORIES = ["caps", "apparel", "bags", "other"] as const;

function isTransitionStatus(value: string): value is TransitionStatus {
  return (
    value === "queued" ||
    value === "processing" ||
    value === "retryable_failed" ||
    value === "complete"
  );
}

function isProductCategory(
  value: string | null,
): value is (typeof PRODUCT_CATEGORIES)[number] {
  return PRODUCT_CATEGORIES.some((category) => category === value);
}

function isValidBulkTiers(value: unknown, minimumQuantity: number): boolean {
  if (value === null) return true;
  if (!Array.isArray(value)) return false;

  let previousMinimum = minimumQuantity - 1;
  for (const tier of value) {
    if (
      typeof tier !== "object" ||
      tier === null ||
      !("minQty" in tier) ||
      !("unitPriceKobo" in tier) ||
      typeof tier.minQty !== "number" ||
      !Number.isInteger(tier.minQty) ||
      tier.minQty < minimumQuantity ||
      tier.minQty <= previousMinimum ||
      typeof tier.unitPriceKobo !== "number" ||
      !Number.isInteger(tier.unitPriceKobo) ||
      tier.unitPriceKobo <= 0
    ) {
      return false;
    }
    previousMinimum = tier.minQty;
  }
  return true;
}

function isCatalogManager(role: string, status: string): boolean {
  return status === "active" && (role === "owner" || role === "manager");
}

function canPublishShop(role: string, status: string): boolean {
  return status === "active" && role === "owner";
}

function readinessError(): PublicationError {
  return {
    code: "product.not_ready",
    message:
      "Add a category, positive prices, a complete variant, and at least one real product photo before publishing.",
  };
}

async function getProductImages(productId: string): Promise<ProductImage[]> {
  return db
    .select({
      id: productImages.id,
      objectKey: productImages.objectKey,
      altText: productImages.altText,
      sortOrder: productImages.sortOrder,
      attestedByUserId: productImages.attestedByUserId,
      attestedAt: productImages.attestedAt,
      publicObjectKey: productImages.publicObjectKey,
    })
    .from(productImages)
    .where(eq(productImages.productId, productId))
    .orderBy(productImages.sortOrder);
}

function validateProduct(
  product: {
    category: string | null;
    basePriceKobo: number | null;
  },
  variants: Array<{
    material: string | null;
    finish: string | null;
    priceAddonKobo: number;
    minimumQuantity: number;
    bulkTiers: unknown;
  }>,
  images: ProductImage[],
): boolean {
  const basePriceKobo = product.basePriceKobo;
  return (
    isProductCategory(product.category) &&
    typeof basePriceKobo === "number" &&
    basePriceKobo > 0 &&
    variants.length > 0 &&
    variants.length <= 50 &&
    variants.every(
      (variant) =>
        !!variant.material?.trim() &&
        !!variant.finish?.trim() &&
        variant.minimumQuantity >= 1 &&
        basePriceKobo + variant.priceAddonKobo > 0 &&
        isValidBulkTiers(variant.bulkTiers, variant.minimumQuantity),
    ) &&
    images.length > 0 &&
    images.every(
      (image) =>
        !!image.altText.trim() &&
        image.attestedByUserId !== null &&
        image.attestedAt !== null,
    )
  );
}

async function enqueueTransition(
  input: { transitionId: string; productId?: string; shopId?: string },
): Promise<Result<TransitionRequest, PublicationError>> {
  try {
    const [transition] = await db
      .select({
        status: publicationTransitions.status,
        retryCount: publicationTransitions.retryCount,
      })
      .from(publicationTransitions)
      .where(eq(publicationTransitions.id, input.transitionId))
      .limit(1);
    if (!transition) {
      return err({
        code: "publication.not_found",
        message: "Publication request not found.",
      });
    }
    if (transition.status !== "queued") {
      if (!isTransitionStatus(transition.status)) {
        return err({
          code: "publication.invalid_state",
          message: "Publication has an unsupported status.",
        });
      }
      return ok({
        transitionId: input.transitionId,
        status: transition.status,
      });
    }
    if (input.productId) {
      await enqueueProductPublication(input.transitionId, transition.retryCount);
    } else {
      await enqueueShopPublication(input.transitionId, transition.retryCount);
    }
    return ok({ transitionId: input.transitionId, status: "queued" });
  } catch (error) {
    try {
      await db
        .update(publicationTransitions)
        .set({ status: "retryable_failed", failureCode: "STORAGE_UNAVAILABLE" })
        .where(
          and(
            eq(publicationTransitions.id, input.transitionId),
            inArray(publicationTransitions.status, ["queued", "processing"]),
          ),
        );
    } catch (databaseError) {
      logger.error("printer_publication.queue_failure_update_failed", {
        event: "printer_publication.queue_failure_update_failed",
        transitionId: input.transitionId,
        error: databaseError instanceof Error ? databaseError.name : "UnknownError",
      });
    }
    logger.error("printer_publication.enqueue_failed", {
      event: "printer_publication.enqueue_failed",
      transitionId: input.transitionId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return err({
      code: "STORAGE_UNAVAILABLE",
      message: "Publication work could not be queued. Try again.",
    });
  }
}

export async function requestProductPublication(input: {
  shopId: string;
  actorUserId: string;
  productId: string;
}): Promise<Result<TransitionRequest, PublicationError>> {
  let transitionId: string | null = null;
  let shouldEnqueue = false;
  let alreadyComplete = false;

  try {
    const result = await db.transaction(async (tx) => {
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
          message: "Only active shop owners and managers can publish products.",
        });
      }

      const [shop] = await tx
        .select({
          status: printerShop.status,
          visibilityTransition: printerShop.visibilityTransition,
        })
        .from(printerShop)
        .where(eq(printerShop.id, input.shopId))
        .for("update")
        .limit(1);
      if (!shop || shop.status === "suspended") {
        return err({ code: "shop.unavailable", message: "This shop cannot publish products." });
      }
      if (shop.visibilityTransition) {
        return err({
          code: "shop.transition_in_progress",
          message: "Wait for the shop publication change to finish.",
        });
      }

      const [product] = await tx
        .select()
        .from(products)
        .where(
          and(
            eq(products.id, input.productId),
            eq(products.shopId, input.shopId),
          ),
        )
        .for("update")
        .limit(1);
      if (!product || product.status === "archived") {
        return err({ code: "product.not_found", message: "Product not found." });
      }
      const [activeTransition] = await tx
        .select()
        .from(publicationTransitions)
        .where(
          and(
            eq(publicationTransitions.productId, product.id),
            inArray(
              publicationTransitions.status,
              [...ACTIVE_TRANSITION_STATUSES],
            ),
          ),
        )
        .limit(1);
      if (product.visibilityTransition && !activeTransition) {
        return err({
          code: "product.transition_in_progress",
          message: "Wait for the product publication change to finish.",
        });
      }
      if (activeTransition && activeTransition.status !== "retryable_failed") {
        if (!isTransitionStatus(activeTransition.status)) {
          return err({
            code: "publication.invalid_state",
            message: "Publication has an unsupported status.",
          });
        }
        transitionId = activeTransition.id;
        shouldEnqueue = activeTransition.status === "queued";
        return ok({ transitionId, status: activeTransition.status });
      }

      const variants = await tx
        .select({
          material: productVariants.material,
          finish: productVariants.finish,
          priceAddonKobo: productVariants.priceAddonKobo,
          minimumQuantity: productVariants.minimumQuantity,
          bulkTiers: productVariants.bulkTiers,
        })
        .from(productVariants)
        .where(eq(productVariants.productId, product.id));
      const images = await tx
        .select({
          id: productImages.id,
          objectKey: productImages.objectKey,
          altText: productImages.altText,
          sortOrder: productImages.sortOrder,
          attestedByUserId: productImages.attestedByUserId,
          attestedAt: productImages.attestedAt,
          publicObjectKey: productImages.publicObjectKey,
        })
        .from(productImages)
        .where(eq(productImages.productId, product.id));
      if (
        !validateProduct(product, variants, images) ||
        !images.some((image) => image.sortOrder === 0)
      ) {
        return err(readinessError());
      }

      if (product.status === "published") {
        if (
          shop.status !== "published" ||
          images.every((image) => image.publicObjectKey !== null)
        ) {
          alreadyComplete = true;
          return ok({ transitionId: null, status: "complete" as const });
        }
      } else {
        const [publishedCount] = await tx
          .select({ value: count() })
          .from(products)
          .where(
            and(
              eq(products.shopId, input.shopId),
              eq(products.status, "published"),
            ),
          );
        if (Number(publishedCount?.value ?? 0) >= 2000) {
          return err({
            code: "shop.product_limit",
            message: "This shop already has 2,000 published products.",
          });
        }
      }

      if (activeTransition) {
        transitionId = activeTransition.id;
        if (activeTransition.status === "retryable_failed") {
          await tx
            .update(publicationTransitions)
            .set({ status: "queued", failureCode: null })
            .where(eq(publicationTransitions.id, activeTransition.id));
          shouldEnqueue = true;
        } else {
          shouldEnqueue = activeTransition.status === "queued";
        }
        return ok({ transitionId, status: "queued" as const });
      }

      transitionId = randomUUID();
      await tx.insert(publicationTransitions).values({
        id: transitionId,
        shopId: null,
        productId: product.id,
        targetState: "published",
        status: "queued",
        idempotencyKey: randomUUID(),
        retryCount: 0,
        failureCode: null,
      });
      await tx
        .update(products)
        .set({ visibilityTransition: true })
        .where(eq(products.id, product.id));
      await tx.insert(auditEvent).values({
        id: randomUUID(),
        actorUserId: input.actorUserId,
        targetType: "product",
        targetId: product.id,
        action: "product.publish_requested",
        detailsJson: { transitionId },
      });
      shouldEnqueue = true;
      return ok({ transitionId, status: "queued" as const });
    });
    if (!result.ok) return result;
  } catch (error) {
    logger.error("printer_publication.product_request_failed", {
      event: "printer_publication.product_request_failed",
      productId: input.productId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return err({
      code: "publication.request_failed",
      message: "Could not start product publication. Try again.",
    });
  }

  if (alreadyComplete || !transitionId || !shouldEnqueue) {
    return ok({ transitionId, status: alreadyComplete ? "complete" : "processing" });
  }
  return enqueueTransition({ transitionId, productId: input.productId });
}

export async function requestShopPublication(input: {
  shopId: string;
  actorUserId: string;
}): Promise<Result<TransitionRequest, PublicationError>> {
  let transitionId: string | null = null;
  let shouldEnqueue = false;
  let alreadyComplete = false;

  try {
    const result = await db.transaction(async (tx) => {
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
      if (!membership || !canPublishShop(membership.role, membership.status)) {
        return err({
          code: "shop.forbidden",
          message: "Only the active shop owner can publish this shop.",
        });
      }

      const [shop] = await tx
        .select()
        .from(printerShop)
        .where(eq(printerShop.id, input.shopId))
        .for("update")
        .limit(1);
      if (!shop || shop.status === "suspended") {
        return err({ code: "shop.unavailable", message: "This shop cannot be published." });
      }
      if (
        !shop.name.trim() ||
        !NIGERIAN_STATES.some((state) => state === shop.state) ||
        !shop.city.trim()
      ) {
        return err({
          code: "shop.not_ready",
          message: "Add the shop name, state, and city before publishing.",
        });
      }
      const [activeTransition] = await tx
        .select()
        .from(publicationTransitions)
        .where(
          and(
            eq(publicationTransitions.shopId, shop.id),
            inArray(
              publicationTransitions.status,
              [...ACTIVE_TRANSITION_STATUSES],
            ),
          ),
        )
        .limit(1);
      if (shop.visibilityTransition && !activeTransition) {
        return err({
          code: "shop.transition_in_progress",
          message: "Wait for the current shop change to finish.",
        });
      }
      if (activeTransition && activeTransition.status !== "retryable_failed") {
        if (!isTransitionStatus(activeTransition.status)) {
          return err({
            code: "publication.invalid_state",
            message: "Publication has an unsupported status.",
          });
        }
        transitionId = activeTransition.id;
        shouldEnqueue = activeTransition.status === "queued";
        return ok({ transitionId, status: activeTransition.status });
      }

      const [transitioningProduct] = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(
            eq(products.shopId, input.shopId),
            eq(products.visibilityTransition, true),
          ),
        )
        .limit(1);
      if (transitioningProduct) {
        return err({
          code: "product.transition_in_progress",
          message: "Wait for product publication work to finish before publishing the shop.",
        });
      }

      const [eligibleProduct] = await tx
        .select({ id: products.id })
        .from(products)
        .innerJoin(
          productVariants,
          and(
            eq(productVariants.productId, products.id),
            isNotNull(productVariants.material),
            isNotNull(productVariants.finish),
          ),
        )
        .innerJoin(
          productImages,
          and(
            eq(productImages.productId, products.id),
            eq(productImages.sortOrder, 0),
            isNotNull(productImages.attestedByUserId),
            isNotNull(productImages.attestedAt),
          ),
        )
        .where(
          and(
            eq(products.shopId, input.shopId),
            eq(products.status, "published"),
            eq(products.visibilityTransition, false),
            isNotNull(products.category),
            sql`${products.basePriceKobo} > 0`,
            sql`exists (
              select 1
              from ${productVariants} variant
              where variant.product_id = ${products.id}
                and nullif(trim(variant.material), '') is not null
                and nullif(trim(variant.finish), '') is not null
                and ${products.basePriceKobo} + variant.price_addon_kobo > 0
            )`,
          ),
        )
        .limit(1);
      if (!eligibleProduct) {
        return err({
          code: "shop.not_ready",
          message:
            "Publish a priced product with a complete variant and real cover photo first.",
        });
      }
      if (
        (shop.logoObjectKey && !shop.logoAltText?.trim()) ||
        (shop.bannerObjectKey &&
          !shop.bannerDecorative &&
          !shop.bannerAltText?.trim())
      ) {
        return err({
          code: "shop.not_ready",
          message: "Add accessible text for the shop logo and banner before publishing.",
        });
      }

      if (shop.status === "published") {
        const [missingPhotoDerivative] = await tx
          .select({ id: productImages.id })
          .from(productImages)
          .innerJoin(products, eq(productImages.productId, products.id))
          .where(
            and(
              eq(products.shopId, shop.id),
              eq(products.status, "published"),
              sql`${productImages.publicObjectKey} is null`,
            ),
          )
          .limit(1);
        const [productWithoutCover] = await tx
          .select({ id: products.id })
          .from(products)
          .leftJoin(
            productImages,
            and(
              eq(productImages.productId, products.id),
              eq(productImages.sortOrder, 0),
            ),
          )
          .where(
            and(
              eq(products.shopId, shop.id),
              eq(products.status, "published"),
              sql`${productImages.id} is null`,
            ),
          )
          .limit(1);
        const missingBrandingDerivative =
          (!!shop.logoObjectKey && !shop.logoPublicObjectKey) ||
          (!!shop.bannerObjectKey && !shop.bannerPublicObjectKey);
        if (
          !missingPhotoDerivative &&
          !productWithoutCover &&
          !missingBrandingDerivative
        ) {
          alreadyComplete = true;
          return ok({ transitionId: null, status: "complete" as const });
        }
      }

      if (activeTransition) {
        transitionId = activeTransition.id;
        if (activeTransition.status === "retryable_failed") {
          await tx
            .update(publicationTransitions)
            .set({ status: "queued", failureCode: null })
            .where(eq(publicationTransitions.id, activeTransition.id));
          shouldEnqueue = true;
        } else {
          shouldEnqueue = activeTransition.status === "queued";
        }
        return ok({ transitionId, status: "queued" as const });
      }

      transitionId = randomUUID();
      await tx.insert(publicationTransitions).values({
        id: transitionId,
        shopId: shop.id,
        productId: null,
        targetState: "published",
        status: "queued",
        idempotencyKey: randomUUID(),
        retryCount: 0,
        failureCode: null,
      });
      await tx
        .update(printerShop)
        .set({ visibilityTransition: true })
        .where(eq(printerShop.id, shop.id));
      await tx.insert(auditEvent).values({
        id: randomUUID(),
        actorUserId: input.actorUserId,
        targetType: "shop",
        targetId: shop.id,
        action: "shop.publish_requested",
        detailsJson: { transitionId },
      });
      shouldEnqueue = true;
      return ok({ transitionId, status: "queued" as const });
    });
    if (!result.ok) return result;
  } catch (error) {
    logger.error("printer_publication.shop_request_failed", {
      event: "printer_publication.shop_request_failed",
      shopId: input.shopId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return err({
      code: "publication.request_failed",
      message: "Could not start shop publication. Try again.",
    });
  }

  if (alreadyComplete || !transitionId || !shouldEnqueue) {
    return ok({ transitionId, status: alreadyComplete ? "complete" : "processing" });
  }
  return enqueueTransition({ transitionId, shopId: input.shopId });
}

function transitionStatusResult(
  transitionId: string,
  status: string,
  failureCode: string | null,
): Result<{
  transitionId: string;
  status: TransitionStatus;
  failureCode: string | null;
}, PublicationError> {
  if (!isTransitionStatus(status)) {
    return err({
      code: "publication.invalid_state",
      message: "Publication has an unsupported status.",
    });
  }
  return ok({ transitionId, status, failureCode });
}

export async function getPublicationTransitionStatus(input: {
  shopId: string;
  actorUserId: string;
  transitionId: string;
}): Promise<Result<{
  transitionId: string;
  status: TransitionStatus;
  failureCode: string | null;
}, PublicationError>> {
  try {
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
        message: "Only active shop owners and managers can view publication status.",
      });
    }

    const [transition] = await db
      .select()
      .from(publicationTransitions)
      .where(
        and(
          eq(publicationTransitions.id, input.transitionId),
          eq(publicationTransitions.shopId, input.shopId),
        ),
      )
      .limit(1);
    if (transition) {
      return transitionStatusResult(
        transition.id,
        transition.status,
        transition.failureCode,
      );
    }

    const [productTransition] = await db
      .select({
        id: publicationTransitions.id,
        status: publicationTransitions.status,
        failureCode: publicationTransitions.failureCode,
      })
      .from(publicationTransitions)
      .innerJoin(products, eq(publicationTransitions.productId, products.id))
      .where(
        and(
          eq(publicationTransitions.id, input.transitionId),
          eq(products.shopId, input.shopId),
        ),
      )
      .limit(1);
    if (!productTransition) {
      return err({
        code: "publication.not_found",
        message: "Publication request not found.",
      });
    }
    return transitionStatusResult(
      productTransition.id,
      productTransition.status,
      productTransition.failureCode,
    );
  } catch (error) {
    logger.error("printer_publication.status_read_failed", {
      event: "printer_publication.status_read_failed",
      transitionId: input.transitionId,
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return err({
      code: "publication.status_unavailable",
      message: "Could not check publication status. Refresh and try again.",
    });
  }
}

export class PermanentPublicationError extends Error {
  constructor(readonly failureCode: string) {
    super(failureCode);
    this.name = "PermanentPublicationError";
  }
}

export class StorageUnavailableError extends Error {
  constructor() {
    super("STORAGE_UNAVAILABLE");
    this.name = "StorageUnavailableError";
  }
}

async function createDerivative(
  privateObjectKey: string,
  publicObjectKey: string,
): Promise<void> {
  let bytes: Uint8Array;
  try {
    bytes = await readPrivateObject(privateObjectKey);
  } catch {
    throw new StorageUnavailableError();
  }

  let processed: Awaited<ReturnType<typeof createPublicWebp>>;
  try {
    processed = await createPublicWebp(bytes);
  } catch (error) {
    if (error instanceof ImageValidationError) {
      throw new PermanentPublicationError(error.failureCode);
    }
    throw error;
  }

  try {
    await putPublicObject({
      key: publicObjectKey,
      body: processed.bytes,
      contentType: "image/webp",
    });
  } catch {
    throw new StorageUnavailableError();
  }
}

async function compensatePublicObjects(
  keys: string[],
  transitionId: string,
): Promise<void> {
  for (const key of keys) {
    try {
      await deletePublicObject(key);
    } catch (error) {
      logger.error("printer_publication.compensation_failed", {
        event: "printer_publication.compensation_failed",
        transitionId,
        error: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
}

async function markTransitionProcessing(
  transitionId: string,
  target: "product" | "shop",
): Promise<void> {
  await db.transaction(async (tx) => {
    const [transition] = await tx
      .select()
      .from(publicationTransitions)
      .where(eq(publicationTransitions.id, transitionId))
      .for("update")
      .limit(1);
    if (!transition || transition.status === "complete") return;
    if (transition.targetState !== "published") {
      throw new PermanentPublicationError("PROCESSING_FAILED");
    }
    if ((target === "product") !== (transition.productId !== null)) {
      throw new PermanentPublicationError("PROCESSING_FAILED");
    }
    await tx
      .update(publicationTransitions)
      .set({
        status: "processing",
        retryCount: sql`${publicationTransitions.retryCount} + 1`,
      })
      .where(eq(publicationTransitions.id, transitionId));
  });
}

export async function processProductPublicationTransition(
  transitionId: string,
): Promise<void> {
  await markTransitionProcessing(transitionId, "product");
  const [transition] = await db
    .select()
    .from(publicationTransitions)
    .where(eq(publicationTransitions.id, transitionId))
    .limit(1);
  if (!transition || transition.status === "complete" || !transition.productId) return;

  const [product] = await db
    .select()
    .from(products)
    .where(eq(products.id, transition.productId))
    .limit(1);
  if (!product || product.status === "archived") {
    throw new PermanentPublicationError("PROCESSING_FAILED");
  }
  const [shop] = await db
    .select()
    .from(printerShop)
    .where(eq(printerShop.id, product.shopId))
    .limit(1);
  if (!shop || shop.status === "suspended" || shop.visibilityTransition) {
    throw new PermanentPublicationError("PROCESSING_FAILED");
  }

  const variants = await db
    .select({
      material: productVariants.material,
      finish: productVariants.finish,
      priceAddonKobo: productVariants.priceAddonKobo,
      minimumQuantity: productVariants.minimumQuantity,
      bulkTiers: productVariants.bulkTiers,
    })
    .from(productVariants)
    .where(eq(productVariants.productId, product.id));
  const images = await getProductImages(product.id);
  if (!validateProduct(product, variants, images) || !images.some((image) => image.sortOrder === 0)) {
    throw new PermanentPublicationError("PROCESSING_FAILED");
  }

  const newPublicKeys: string[] = [];
  const publicKeys = new Map<string, string>();
  try {
    if (shop.status === "published") {
      for (const image of images) {
        const key = image.publicObjectKey ?? `products/${shop.id}/${product.id}/${image.id}.webp`;
        publicKeys.set(image.id, key);
        if (!image.publicObjectKey) {
          newPublicKeys.push(key);
          await createDerivative(image.objectKey, key);
        }
      }
    }

    await db.transaction(async (tx) => {
      const [lockedTransition] = await tx
        .select({ status: publicationTransitions.status })
        .from(publicationTransitions)
        .where(eq(publicationTransitions.id, transitionId))
        .for("update")
        .limit(1);
      if (!lockedTransition || lockedTransition.status === "complete") return;
      const [lockedShop] = await tx
        .select()
        .from(printerShop)
        .where(eq(printerShop.id, shop.id))
        .for("update")
        .limit(1);
      const [lockedProduct] = await tx
        .select()
        .from(products)
        .where(eq(products.id, product.id))
        .for("update")
        .limit(1);
      if (
        !lockedProduct ||
        !lockedShop ||
        lockedProduct.version !== product.version ||
        lockedProduct.status === "archived" ||
        !lockedProduct.visibilityTransition ||
        lockedShop.status !== shop.status ||
        lockedShop.visibilityTransition ||
        lockedShop.status === "suspended"
      ) {
        throw new PermanentPublicationError("PROCESSING_FAILED");
      }

      for (const [imageId, publicObjectKey] of publicKeys) {
        await tx
          .update(productImages)
          .set({ publicObjectKey })
          .where(eq(productImages.id, imageId));
      }
      await tx
        .update(products)
        .set({
          status: "published",
          visibilityTransition: false,
          version: sql`${products.version} + 1`,
        })
        .where(eq(products.id, product.id));
      await tx
        .update(publicationTransitions)
        .set({ status: "complete", failureCode: null })
        .where(eq(publicationTransitions.id, transitionId));
      await tx.insert(auditEvent).values({
        id: randomUUID(),
        actorUserId: null,
        targetType: "product",
        targetId: product.id,
        action: "product.publish",
        detailsJson: { transitionId },
      });
    });
  } catch (error) {
    await compensatePublicObjects(newPublicKeys, transitionId);
    throw error;
  }
}

export async function processShopPublicationTransition(
  transitionId: string,
): Promise<void> {
  await markTransitionProcessing(transitionId, "shop");
  const [transition] = await db
    .select()
    .from(publicationTransitions)
    .where(eq(publicationTransitions.id, transitionId))
    .limit(1);
  if (!transition || transition.status === "complete" || !transition.shopId) return;

  const [shop] = await db
    .select()
    .from(printerShop)
    .where(eq(printerShop.id, transition.shopId))
    .limit(1);
  if (!shop || shop.status === "suspended" || !shop.visibilityTransition) {
    throw new PermanentPublicationError("PROCESSING_FAILED");
  }

  const shopProducts = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.shopId, shop.id),
        eq(products.status, "published"),
        eq(products.visibilityTransition, false),
      ),
    );
  if (shopProducts.length === 0) {
    throw new PermanentPublicationError("PROCESSING_FAILED");
  }

  const publicKeys = new Map<string, string>();
  const newPublicKeys: string[] = [];
  const logoPublicObjectKey = shop.logoObjectKey
    ? shop.logoPublicObjectKey ?? `shops/${shop.id}/logo.webp`
    : null;
  const bannerPublicObjectKey = shop.bannerObjectKey
    ? shop.bannerPublicObjectKey ?? `shops/${shop.id}/banner.webp`
    : null;

  try {
    for (const product of shopProducts) {
      const variants = await db
        .select({
          material: productVariants.material,
          finish: productVariants.finish,
          priceAddonKobo: productVariants.priceAddonKobo,
          minimumQuantity: productVariants.minimumQuantity,
          bulkTiers: productVariants.bulkTiers,
        })
        .from(productVariants)
        .where(eq(productVariants.productId, product.id));
      const images = await getProductImages(product.id);
      if (
        !validateProduct(product, variants, images) ||
        !images.some((image) => image.sortOrder === 0)
      ) {
        throw new PermanentPublicationError("PROCESSING_FAILED");
      }

      for (const image of images) {
        const publicObjectKey =
          image.publicObjectKey ??
          `products/${shop.id}/${product.id}/${image.id}.webp`;
        publicKeys.set(image.id, publicObjectKey);
        if (!image.publicObjectKey) {
          newPublicKeys.push(publicObjectKey);
          await createDerivative(image.objectKey, publicObjectKey);
        }
      }
    }

    if (shop.logoObjectKey && !shop.logoPublicObjectKey && logoPublicObjectKey) {
      newPublicKeys.push(logoPublicObjectKey);
      await createDerivative(shop.logoObjectKey, logoPublicObjectKey);
    }
    if (shop.bannerObjectKey && !shop.bannerPublicObjectKey && bannerPublicObjectKey) {
      newPublicKeys.push(bannerPublicObjectKey);
      await createDerivative(shop.bannerObjectKey, bannerPublicObjectKey);
    }

    await db.transaction(async (tx) => {
      const [lockedTransition] = await tx
        .select({ status: publicationTransitions.status })
        .from(publicationTransitions)
        .where(eq(publicationTransitions.id, transitionId))
        .for("update")
        .limit(1);
      if (!lockedTransition || lockedTransition.status === "complete") return;

      const [lockedShop] = await tx
        .select()
        .from(printerShop)
        .where(eq(printerShop.id, shop.id))
        .for("update")
        .limit(1);
      if (
        !lockedShop ||
        lockedShop.status === "suspended" ||
        !lockedShop.visibilityTransition ||
        lockedShop.status !== shop.status
      ) {
        throw new PermanentPublicationError("PROCESSING_FAILED");
      }

      for (const [imageId, publicObjectKey] of publicKeys) {
        await tx
          .update(productImages)
          .set({ publicObjectKey })
          .where(eq(productImages.id, imageId));
      }
      await tx
        .update(printerShop)
        .set({
          status: "published",
          visibilityTransition: false,
          logoPublicObjectKey,
          bannerPublicObjectKey,
        })
        .where(eq(printerShop.id, shop.id));
      await tx
        .update(publicationTransitions)
        .set({ status: "complete", failureCode: null })
        .where(eq(publicationTransitions.id, transitionId));
      await tx.insert(auditEvent).values({
        id: randomUUID(),
        actorUserId: null,
        targetType: "shop",
        targetId: shop.id,
        action: "shop.publish",
        detailsJson: { transitionId, imageCount: publicKeys.size },
      });
    });
  } catch (error) {
    await compensatePublicObjects(newPublicKeys, transitionId);
    throw error;
  }
}

export async function markPublicationTransitionFailed(
  transitionId: string,
  failureCode: string,
): Promise<void> {
  await db
    .update(publicationTransitions)
    .set({ status: "retryable_failed", failureCode })
    .where(
      and(
        eq(publicationTransitions.id, transitionId),
        inArray(publicationTransitions.status, ["queued", "processing"]),
      ),
    );
}

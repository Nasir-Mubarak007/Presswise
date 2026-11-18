"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import {
  publishProductAction,
  type PublicationActionState,
} from "@/app/printer/catalog/new/action";
import { publishShopAction } from "@/app/printer/actions";
import {
  ASSET_UPLOAD_FAILURE_MESSAGES,
  MAX_PRODUCT_PHOTO_ALT_TEXT_LENGTH,
  MAX_PRODUCT_PHOTO_BYTES,
  MAX_PRODUCT_PHOTOS,
  assetUploadFailureCodeSchema,
  type AssetUploadFailureCode,
} from "@/lib/storage/asset-upload";

type ExistingPhoto = { id: string; altText: string; sortOrder: number };
type UploadState = "ready" | "uploading" | "processing" | "complete" | "failed";
type PhotoDraft = {
  id: string;
  file: File;
  altText: string;
  attestsRealProduct: boolean;
  state: UploadState;
  failureCode?: AssetUploadFailureCode;
  message?: string;
  imageId?: string;
};
type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

const uploadIntentResponseSchema = z.object({
  intentId: z.string().uuid(),
  uploadUrl: z.string().url(),
  requiredHeaders: z.record(z.string(), z.string()),
  expiresAt: z.string(),
});
const finalizeResponseSchema = z.object({
  intentId: z.string().uuid(),
  status: z.string(),
});
const statusResponseSchema = z.object({
  intentId: z.string().uuid(),
  status: z.string(),
  failureCode: assetUploadFailureCodeSchema.nullable(),
  imageId: z.string().uuid().nullable(),
});
const previewResponseSchema = z.object({
  url: z.string().url(),
  expiresInSeconds: z.number().int().positive(),
});
const publicationStatusSchema = z.object({
  transitionId: z.string().uuid(),
  status: z.enum(["queued", "processing", "retryable_failed", "complete"]),
  failureCode: z.string().nullable(),
});

type PublicationTarget = "product" | "shop";
type PublicationUiState = {
  target: PublicationTarget;
  status: "pending" | "complete" | "failed";
  message: string;
};

function publicationFailureMessage(code: string | null): string {
  if (code === "STORAGE_UNAVAILABLE") {
    return "Storage is not available right now. You can try publishing again.";
  }
  if (
    code === "INVALID_TYPE" ||
    code === "INVALID_IMAGE" ||
    code === "ANIMATED_IMAGE" ||
    code === "FILE_TOO_LARGE" ||
    code === "IMAGE_TOO_LARGE"
  ) {
    return "A photo did not pass its image checks. Replace it, then try again.";
  }
  return "Publication could not finish. You can try again.";
}

function isRetryable(code: AssetUploadFailureCode | undefined): boolean {
  return (
    code === "INTENT_EXPIRED" ||
    code === "STORAGE_UNAVAILABLE" ||
    code === "PROCESSING_FAILED"
  );
}

function readFailureMessage(
  code: string,
  fallback: string,
): { code?: AssetUploadFailureCode; message: string } {
  const parsed = assetUploadFailureCodeSchema.safeParse(code);
  if (!parsed.success) return { message: fallback };
  return {
    code: parsed.data,
    message: ASSET_UPLOAD_FAILURE_MESSAGES[parsed.data],
  };
}

async function readResult<T>(
  response: Response,
  dataSchema: z.ZodType<T>,
): Promise<ApiResult<T>> {
  const schema = z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data: dataSchema }),
    z.object({
      ok: z.literal(false),
      error: z.object({ code: z.string(), message: z.string() }),
    }),
  ]);
  return schema.parse(await response.json());
}

export default function ProductPhotoUploader({
  productId,
  photos,
  reservedCount,
  productStatus,
  isShopOwner,
}: {
  productId: string;
  photos: ExistingPhoto[];
  reservedCount: number;
  productStatus: string;
  isShopOwner: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<PhotoDraft[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [queueError, setQueueError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publicationState, setPublicationState] =
    useState<PublicationUiState | null>(null);

  useEffect(() => {
    for (const photo of photos) {
      if (previews[photo.id]) continue;
      void fetch(`/api/printer/assets/${photo.id}/preview`, {
        cache: "no-store",
      })
        .then((response) => readResult(response, previewResponseSchema))
        .then((result) => {
          if (result.ok) {
            setPreviews((current) => ({ ...current, [photo.id]: result.data.url }));
          }
        })
        .catch(() => {
          setQueueError("A saved photo preview could not be loaded. Refresh and try again.");
        });
    }
  }, [photos, previews]);

  const savedPhotoIds = new Set(photos.map((photo) => photo.id));
  const visibleItems = items.filter(
    (item) => !item.imageId || !savedPhotoIds.has(item.imageId),
  );
  const countedItems = visibleItems.filter((item) => item.state !== "failed").length;
  const remainingSlots = Math.max(
    0,
    MAX_PRODUCT_PHOTOS - photos.length - reservedCount - countedItems,
  );

  function updateItem(id: string, patch: Partial<PhotoDraft>) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const selected = Array.from(fileList);
    if (selected.length > remainingSlots) {
      setQueueError(`You can add ${remainingSlots} more photo${remainingSlots === 1 ? "" : "s"}.`);
    } else {
      setQueueError(null);
    }
    const accepted = selected.slice(0, remainingSlots).map((file) => {
      const tooLarge = file.size > MAX_PRODUCT_PHOTO_BYTES;
      const unsupported =
        file.type !== "image/png" &&
        file.type !== "image/jpeg" &&
        file.type !== "image/webp";
      const failureCode: AssetUploadFailureCode | undefined = tooLarge
        ? "FILE_TOO_LARGE"
        : unsupported
          ? "INVALID_TYPE"
          : undefined;
      return {
        id: crypto.randomUUID(),
        file,
        altText: "",
        attestsRealProduct: false,
        state: failureCode ? "failed" as const : "ready" as const,
        failureCode,
        message: failureCode ? ASSET_UPLOAD_FAILURE_MESSAGES[failureCode] : undefined,
      };
    });
    setItems((current) => [...current, ...accepted]);
  }

  async function uploadOne(item: PhotoDraft): Promise<void> {
    updateItem(item.id, { state: "uploading", failureCode: undefined, message: undefined });
    try {
      const intentResponse = await fetch("/api/printer/assets/intents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          assetType: "product_photo",
          productId,
          contentType: item.file.type,
          sizeBytes: item.file.size,
          altText: item.altText.trim(),
          attestsRealProduct: item.attestsRealProduct,
        }),
      });
      const intent = await readResult(intentResponse, uploadIntentResponseSchema);
      if (!intent.ok) {
        const failure = readFailureMessage(intent.error.code, intent.error.message);
        updateItem(item.id, {
          state: "failed",
          failureCode: failure.code,
          message: failure.message,
        });
        return;
      }

      const uploadResponse = await fetch(intent.data.uploadUrl, {
        method: "PUT",
        headers: intent.data.requiredHeaders,
        body: item.file,
      });
      if (!uploadResponse.ok) {
        updateItem(item.id, {
          state: "failed",
          failureCode: "STORAGE_UNAVAILABLE",
          message: ASSET_UPLOAD_FAILURE_MESSAGES.STORAGE_UNAVAILABLE,
        });
        return;
      }

      const finalizeResponse = await fetch(
        `/api/printer/assets/intents/${intent.data.intentId}`,
        { method: "POST" },
      );
      const finalized = await readResult(finalizeResponse, finalizeResponseSchema);
      if (!finalized.ok) {
        const failure = readFailureMessage(
          finalized.error.code,
          finalized.error.message,
        );
        updateItem(item.id, {
          state: "failed",
          failureCode: failure.code,
          message: failure.message,
        });
        return;
      }

      updateItem(item.id, { state: "processing" });
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusResponse = await fetch(
          `/api/printer/assets/intents/${intent.data.intentId}`,
          { cache: "no-store" },
        );
        const status = await readResult(statusResponse, statusResponseSchema);
        if (!status.ok) {
          const failure = readFailureMessage(
            status.error.code,
            status.error.message,
          );
          updateItem(item.id, {
            state: "failed",
            failureCode: failure.code,
            message: failure.message,
          });
          return;
        }
        if (status.data.status === "complete" && status.data.imageId) {
          updateItem(item.id, {
            state: "complete",
            imageId: status.data.imageId,
          });
          router.refresh();
          return;
        }
        if (status.data.status === "failed") {
          const failure = readFailureMessage(
            status.data.failureCode ?? "PROCESSING_FAILED",
            ASSET_UPLOAD_FAILURE_MESSAGES.PROCESSING_FAILED,
          );
          updateItem(item.id, {
            state: "failed",
            failureCode: failure.code,
            message: failure.message,
          });
          return;
        }
      }
    } catch {
      updateItem(item.id, {
        state: "failed",
        failureCode: "STORAGE_UNAVAILABLE",
        message: ASSET_UPLOAD_FAILURE_MESSAGES.STORAGE_UNAVAILABLE,
      });
    }
  }

  async function uploadReadyItems() {
    const pending = visibleItems.filter(
      (item) =>
        (item.state === "ready" || (item.state === "failed" && isRetryable(item.failureCode))) &&
        item.altText.trim().length > 0 &&
        item.altText.length <= MAX_PRODUCT_PHOTO_ALT_TEXT_LENGTH &&
        item.attestsRealProduct,
    );
    if (pending.length === 0) {
      setQueueError("Add alt text and confirm each photo shows the real product.");
      return;
    }
    setQueueError(null);
    setUploading(true);
    let cursor = 0;
    const uploaders = Array.from(
      { length: Math.min(2, pending.length) },
      async () => {
        while (cursor < pending.length) {
          const item = pending[cursor];
          cursor += 1;
          await uploadOne(item);
        }
      },
    );
    await Promise.all(uploaders);
    setUploading(false);
  }

  async function requestPublication(target: PublicationTarget) {
    if (publishing) return;
    setPublishing(true);
    setPublicationState({
      target,
      status: "pending",
      message: target === "product"
        ? "Checking product readiness."
        : "Checking shop readiness.",
    });

    try {
      const result: PublicationActionState =
        target === "product"
          ? await publishProductAction(productId)
          : await publishShopAction();
      if (!result.ok) {
        setPublicationState({
          target,
          status: "failed",
          message: result.message,
        });
        return;
      }

      if (result.status === "complete") {
        setPublicationState({
          target,
          status: "complete",
          message: target === "product"
            ? "Your product is published."
            : "Your shop is published.",
        });
        router.refresh();
        return;
      }
      if (!result.transitionId) {
        setPublicationState({
          target,
          status: "failed",
          message: "Publication could not be started. Try again.",
        });
        return;
      }

      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const response = await fetch(
          `/api/printer/publication-transitions/${result.transitionId}`,
          { cache: "no-store" },
        );
        const status = await readResult(response, publicationStatusSchema);
        if (!status.ok) {
          setPublicationState({
            target,
            status: "failed",
            message: status.error.message,
          });
          return;
        }
        if (status.data.status === "complete") {
          setPublicationState({
            target,
            status: "complete",
            message: target === "product"
              ? "Your product is published."
              : "Your shop is published.",
          });
          router.refresh();
          return;
        }
        if (status.data.status === "retryable_failed") {
          setPublicationState({
            target,
            status: "failed",
            message: publicationFailureMessage(status.data.failureCode),
          });
          return;
        }
        setPublicationState({
          target,
          status: "pending",
          message: target === "product"
            ? "Creating and checking the product photos."
            : "Creating and checking the shop photos.",
        });
      }
    } catch {
      setPublicationState({
        target,
        status: "failed",
        message: "Could not check publication status. Refresh and try again.",
      });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <section
      aria-labelledby="product-photos-heading"
      className="rounded-xl border border-ink/10 bg-surface p-5 sm:p-7"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-wide text-brand uppercase">
            Product photos
          </p>
          <h2 id="product-photos-heading" className="mt-1 text-xl font-semibold">
            Add real photos customers can trust
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-ink/60">
            Upload up to five PNG, JPEG, or still WebP photos. Each file can be up to 5 MB.
            Photos stay private until your product and shop are published.
          </p>
        </div>
        <p className="text-sm font-medium text-ink/70">
          {photos.length + reservedCount} of {MAX_PRODUCT_PHOTOS} slots used
        </p>
      </div>

      {photos.length > 0 && (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {photos.map((photo) => (
            <li
              key={photo.id}
              className="overflow-hidden rounded-xl border border-ink/10 bg-surface"
            >
              {previews[photo.id] ? (
                <img
                  src={previews[photo.id]}
                  alt={photo.altText}
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center bg-ink/5 text-sm text-ink/60">
                  Loading photo preview
                </div>
              )}
              <p className="p-3 text-sm text-ink/70">{photo.altText}</p>
            </li>
          ))}
        </ul>
      )}

      <label className="mt-5 flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-brand/40 bg-brand/5 px-4 py-6 text-center hover:bg-brand/10 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
        <span className="text-sm font-semibold text-ink">Choose product photos</span>
        <span className="mt-1 text-sm text-ink/60">
          {remainingSlots > 0
            ? `${remainingSlots} photo slot${remainingSlots === 1 ? "" : "s"} available`
            : "All photo slots are in use"}
        </span>
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          disabled={remainingSlots === 0 || uploading}
          onChange={(event) => {
            addFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
          className="sr-only"
        />
      </label>

      {visibleItems.length > 0 && (
        <ul className="mt-5 space-y-4">
          {visibleItems.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-ink/10 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="break-all text-sm font-semibold text-ink">
                    {item.file.name}
                  </p>
                  <p className="mt-1 text-xs text-ink/60">
                    {(item.file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
                <p className="text-sm font-medium text-ink/70" aria-live="polite">
                  {item.state === "ready" && "Ready"}
                  {item.state === "uploading" && "Uploading"}
                  {item.state === "processing" && "Checking photo"}
                  {item.state === "complete" && "Photo ready"}
                  {item.state === "failed" && "Upload needs attention"}
                </p>
              </div>
              <div className="mt-3">
                <label
                  htmlFor={`alt-${item.id}`}
                  className="block text-sm font-medium text-ink"
                >
                  Describe this photo
                </label>
                <input
                  id={`alt-${item.id}`}
                  type="text"
                  maxLength={MAX_PRODUCT_PHOTO_ALT_TEXT_LENGTH}
                  value={item.altText}
                  onChange={(event) =>
                    updateItem(item.id, { altText: event.currentTarget.value })
                  }
                  disabled={item.state === "uploading" || item.state === "processing"}
                  className="mt-1 min-h-11 w-full rounded-lg border border-ink/20 bg-surface px-3 py-2 text-base text-ink outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  aria-describedby={`attest-${item.id} ${item.message ? `error-${item.id}` : ""}`}
                />
                <label
                  htmlFor={`attest-${item.id}`}
                  className="mt-3 flex min-h-11 items-center gap-3 text-sm text-ink/80"
                >
                  <input
                    id={`attest-${item.id}`}
                    type="checkbox"
                    checked={item.attestsRealProduct}
                    onChange={(event) =>
                      updateItem(item.id, {
                        attestsRealProduct: event.currentTarget.checked,
                      })
                    }
                    disabled={item.state === "uploading" || item.state === "processing"}
                    className="size-5 accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                  />
                  I confirm this photo shows the real product, not a mockup.
                </label>
                {item.message && (
                  <p id={`error-${item.id}`} role="alert" className="mt-2 text-sm text-amber">
                    {item.message}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {queueError && (
        <p role="alert" className="mt-4 rounded-lg bg-amber/10 p-3 text-sm text-ink">
          {queueError}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={uploadReadyItems}
          disabled={uploading || !visibleItems.some((item) => item.state === "ready" || (item.state === "failed" && isRetryable(item.failureCode)))}
          className="min-h-11 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-surface hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? "Uploading photos…" : "Upload selected photos"}
        </button>
        <p className="text-sm text-ink/60">
          No more than two photos upload at once.
        </p>
      </div>

      <section
        aria-labelledby="publication-heading"
        className="mt-8 rounded-xl border border-brand/20 bg-brand/5 p-4 sm:p-5"
      >
        <h2 id="publication-heading" className="text-lg font-semibold text-ink">
          Review and publish
        </h2>
        <p className="mt-1 text-sm text-ink/65">
          Photos stay private until publication checks pass. Your product and shop
          become visible only after their public photos are ready.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void requestPublication("product")}
            disabled={publishing || uploading}
            className="min-h-11 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-surface hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishing && publicationState?.target === "product"
              ? "Publishing product…"
              : productStatus === "published"
                ? "Check product photos"
                : "Publish product"}
          </button>
          {isShopOwner && (
            <button
              type="button"
              onClick={() => void requestPublication("shop")}
              disabled={publishing || uploading}
              className="min-h-11 rounded-lg border border-brand/30 bg-surface px-5 py-2.5 text-sm font-semibold text-brand hover:bg-brand/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50"
            >
              {publishing && publicationState?.target === "shop"
                ? "Publishing shop…"
                : "Publish shop"}
            </button>
          )}
        </div>
        {publicationState && (
          <p
            role={publicationState.status === "failed" ? "alert" : "status"}
            aria-live="polite"
            className={`mt-3 text-sm ${
              publicationState.status === "failed"
                ? "text-amber"
                : "text-ink/70"
            }`}
          >
            {publicationState.message}
          </p>
        )}
      </section>
    </section>
  );
}

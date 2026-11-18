import { z } from "zod";

export const MAX_PRODUCT_PHOTO_BYTES = 5 * 1024 * 1024;
export const MAX_PRODUCT_PHOTO_PIXELS = 40_000_000;
export const MAX_PRODUCT_PHOTOS = 5;
export const MAX_PRODUCT_PHOTO_ALT_TEXT_LENGTH = 250;

export const productPhotoIntentSchema = z.object({
  assetType: z.literal("product_photo"),
  productId: z.string().uuid(),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  sizeBytes: z.number().int().positive().max(MAX_PRODUCT_PHOTO_BYTES),
  altText: z.string().trim().min(1).max(MAX_PRODUCT_PHOTO_ALT_TEXT_LENGTH),
  attestsRealProduct: z.literal(true),
});

export type ProductPhotoIntentInput = z.infer<typeof productPhotoIntentSchema>;

export const assetUploadFailureCodeSchema = z.enum([
  "INVALID_TYPE",
  "INVALID_IMAGE",
  "ANIMATED_IMAGE",
  "FILE_TOO_LARGE",
  "IMAGE_TOO_LARGE",
  "INTENT_EXPIRED",
  "STORAGE_UNAVAILABLE",
  "PROCESSING_FAILED",
]);
export type AssetUploadFailureCode = z.infer<
  typeof assetUploadFailureCodeSchema
>;

export const ASSET_UPLOAD_FAILURE_MESSAGES: Record<
  AssetUploadFailureCode,
  string
> = {
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
};

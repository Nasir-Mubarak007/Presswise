import sharp from "sharp";
import {
  MAX_PRODUCT_PHOTO_BYTES,
  MAX_PRODUCT_PHOTO_PIXELS,
  type AssetUploadFailureCode,
} from "@/lib/storage/asset-upload";

export class ImageValidationError extends Error {
  constructor(readonly failureCode: AssetUploadFailureCode) {
    super(failureCode);
    this.name = "ImageValidationError";
  }
}

function getContentType(format: string | undefined): string | null {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return null;
}

export async function createPublicWebp(
  bytes: Uint8Array,
  expectedContentType?: string,
): Promise<{ contentType: string; bytes: Buffer }> {
  if (bytes.byteLength > MAX_PRODUCT_PHOTO_BYTES) {
    throw new ImageValidationError("FILE_TOO_LARGE");
  }

  let metadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    metadata = await sharp(bytes, {
      animated: true,
      limitInputPixels: false,
    }).metadata();
  } catch {
    throw new ImageValidationError("INVALID_IMAGE");
  }

  const contentType = getContentType(metadata.format);
  if (!contentType || (expectedContentType && expectedContentType !== contentType)) {
    throw new ImageValidationError("INVALID_TYPE");
  }
  if ((metadata.pages ?? 1) > 1) {
    throw new ImageValidationError("ANIMATED_IMAGE");
  }
  if (!metadata.width || !metadata.height) {
    throw new ImageValidationError("INVALID_IMAGE");
  }
  if (metadata.width * metadata.height > MAX_PRODUCT_PHOTO_PIXELS) {
    throw new ImageValidationError("IMAGE_TOO_LARGE");
  }

  try {
    const derivative = await sharp(bytes, {
      limitInputPixels: MAX_PRODUCT_PHOTO_PIXELS,
    })
      .rotate()
      .resize(2400, 2400, { fit: "inside", withoutEnlargement: true })
      .webp()
      .toBuffer();
    return { contentType, bytes: derivative };
  } catch {
    throw new ImageValidationError("INVALID_IMAGE");
  }
}

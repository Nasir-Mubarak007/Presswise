const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_FILE_SIZE = 2.5 * 1024 * 1024;
const MIN_DIMENSION = 200;
const LOW_RESOLUTION_DIMENSION = 600;

export type ImageValidation =
  | { ok: true; warning: string | null }
  | { ok: false; message: string };

export function validateImageFile(
  file: Pick<File, "type" | "size">,
  width: number,
  height: number,
): ImageValidation {
  if (!ACCEPTED_TYPES.has(file.type)) {
    return { ok: false, message: "Choose a PNG, JPEG, or WebP image." };
  }
  if (file.size > MAX_FILE_SIZE) {
    return { ok: false, message: "Choose an image smaller than 2.5 MB." };
  }
  if (width < MIN_DIMENSION || height < MIN_DIMENSION) {
    return { ok: false, message: "Your image must be at least 200 pixels wide and tall." };
  }
  if (width < LOW_RESOLUTION_DIMENSION || height < LOW_RESOLUTION_DIMENSION) {
    return {
      ok: true,
      warning: "This image is under 600 pixels wide or tall and may look soft when printed.",
    };
  }
  return { ok: true, warning: null };
}

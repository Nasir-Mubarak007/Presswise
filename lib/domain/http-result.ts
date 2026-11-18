import type { Result } from "@/lib/domain/result";

function errorStatus(code: string): number {
  if (code === "auth.required") return 401;
  if (code === "printer.disabled") return 404;
  if (code === "request.invalid_json") return 400;
  if (code.includes("forbidden")) return 403;
  if (code.includes("not_found")) return 404;
  if (code === "upload.photo_limit" || code.endsWith("state_conflict")) return 409;
  if (code === "FILE_TOO_LARGE" || code === "IMAGE_TOO_LARGE") return 413;
  if (code === "INVALID_TYPE" || code === "ANIMATED_IMAGE") return 415;
  if (code === "upload.rate_limited") return 429;
  if (
    code === "STORAGE_UNAVAILABLE" ||
    code === "upload.rate_limiter_unavailable" ||
    code === "upload.intent_create_failed"
  ) {
    return 503;
  }
  if (code.includes("unavailable")) return 409;
  return 422;
}

export function resultResponse<T, E extends { code: string }>(
  result: Result<T, E>,
  successStatus = 200,
): Response {
  return Response.json(result, {
    status: result.ok ? successStatus : errorStatus(result.error.code),
  });
}

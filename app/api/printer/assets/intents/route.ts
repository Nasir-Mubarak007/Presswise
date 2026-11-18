import { getAuthenticatedUser, resolveRoleContext } from "@/lib/auth/role-resolver";
import { err } from "@/lib/domain/result";
import { resultResponse } from "@/lib/domain/http-result";
import { logger } from "@/lib/log/logger";
import { gatePrinterExperience } from "@/lib/printer-gate";
import { checkPrinterAssetIntentLimit } from "@/lib/rate-limit/printer-assets";
import { requestProductPhotoIntent } from "@/lib/services/printer-asset-service";
import { productPhotoIntentSchema } from "@/lib/storage/asset-upload";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const gate = gatePrinterExperience();
  if (!gate.ok) {
    return resultResponse(err({ code: gate.code, message: gate.message }), 404);
  }

  const user = await getAuthenticatedUser(request.headers);
  if (!user) {
    return resultResponse(
      err({ code: "auth.required", message: "Sign in to upload a product photo." }),
    );
  }
  const roleContext = await resolveRoleContext(user.id);
  if (!roleContext.activeShopId) {
    return resultResponse(
      err({ code: "shop.forbidden", message: "Join a shop before uploading photos." }),
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return resultResponse(
      err({ code: "request.invalid_json", message: "Send valid JSON to request an upload." }),
    );
  }
  const parsed = productPhotoIntentSchema.safeParse(body);
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (key) fields[key] = issue.message;
    }
    return resultResponse(
      err({
        code: "request.invalid_input",
        message: "Check the photo details and try again.",
        fields,
      }),
    );
  }

  const rateLimit = await checkPrinterAssetIntentLimit(user.id);
  if (!rateLimit.ok) return resultResponse(rateLimit);

  const result = await requestProductPhotoIntent({
    shopId: roleContext.activeShopId,
    actorUserId: user.id,
    intent: parsed.data,
  });
  if (!result.ok && result.error.code === "upload.intent_create_failed") {
    logger.warn("printer_asset.intent_request_rejected", {
      event: "printer_asset.intent_request_rejected",
      code: result.error.code,
    });
  }
  return resultResponse(result, 201);
}

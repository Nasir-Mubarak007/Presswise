import { getAuthenticatedUser, resolveRoleContext } from "@/lib/auth/role-resolver";
import { err } from "@/lib/domain/result";
import { resultResponse } from "@/lib/domain/http-result";
import { gatePrinterExperience } from "@/lib/printer-gate";
import { createProductPhotoPreviewUrl } from "@/lib/services/printer-asset-service";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  const gate = gatePrinterExperience();
  if (!gate.ok) {
    return Response.json(
      { ok: false, error: { code: gate.code, message: gate.message } },
      { status: 404 },
    );
  }
  const user = await getAuthenticatedUser(request.headers);
  if (!user) {
    return resultResponse(
      err({ code: "auth.required", message: "Sign in to preview this photo." }),
    );
  }
  const roleContext = await resolveRoleContext(user.id);
  if (!roleContext.activeShopId) {
    return resultResponse(
      err({ code: "shop.forbidden", message: "Join a shop to preview this photo." }),
    );
  }
  const { id } = await params;
  return resultResponse(
    await createProductPhotoPreviewUrl({
      shopId: roleContext.activeShopId,
      actorUserId: user.id,
      imageId: id,
    }),
  );
}

import { z } from "zod";
import {
  getAuthenticatedUser,
  resolveRoleContext,
} from "@/lib/auth/role-resolver";
import { err } from "@/lib/domain/result";
import { resultResponse } from "@/lib/domain/http-result";
import { gatePrinterExperience } from "@/lib/printer-gate";
import { getPublicationTransitionStatus } from "@/lib/services/printer-publication-service";

type RouteContext = { params: Promise<{ id: string }> };

export const runtime = "nodejs";

export async function GET(
  request: Request,
  { params }: RouteContext,
): Promise<Response> {
  const gate = gatePrinterExperience();
  if (!gate.ok) {
    return resultResponse(err({ code: gate.code, message: gate.message }), 404);
  }

  const user = await getAuthenticatedUser(request.headers);
  if (!user) {
    return resultResponse(
      err({
        code: "auth.required",
        message: "Sign in to check publication status.",
      }),
    );
  }

  const roleContext = await resolveRoleContext(user.id);
  if (!roleContext.activeShopId) {
    return resultResponse(
      err({
        code: "shop.forbidden",
        message: "Join a shop to check publication status.",
      }),
    );
  }

  const { id } = await params;
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) {
    return resultResponse(
      err({
        code: "request.invalid_input",
        message: "Invalid publication request.",
      }),
    );
  }

  return resultResponse(
    await getPublicationTransitionStatus({
      shopId: roleContext.activeShopId,
      actorUserId: user.id,
      transitionId: parsed.data,
    }),
  );
}

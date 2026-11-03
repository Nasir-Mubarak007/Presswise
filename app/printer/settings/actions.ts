"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { gatePrinterExperience } from "@/lib/printer-gate";
import { getAuthenticatedUser } from "@/lib/auth/role-resolver";
import { resolveRoleContext } from "@/lib/auth/role-resolver";
import { updateShopSettings } from "@/lib/services/printer-service";

const settingsSchema = z.object({
  tagline: z.string().max(200, "Tagline too long.").optional().nullable(),
  area: z.string().max(100, "Area too long.").optional().nullable(),
  vatEnabled: z.union([z.literal("true"), z.literal("false"), z.undefined()]).optional(),
});

export type SettingsActionResult =
  | { ok: true }
  | { ok: false; code: string; message: string; fields?: Record<string, string> };

export async function updateSettingsAction(
  formData: FormData,
): Promise<SettingsActionResult> {
  const gate = gatePrinterExperience();
  if (!gate.ok) {
    return { ok: false, code: gate.code, message: gate.message };
  }

  const user = await getAuthenticatedUser(await headers());
  if (!user) {
    return { ok: false, code: "auth.not_authenticated", message: "Sign in to update settings." };
  }

  const roleContext = await resolveRoleContext(user.id);
  const isOwner =
    roleContext.roles.includes("printer_owner") ||
    roleContext.roles.includes("platform_admin");
  if (!isOwner || !roleContext.activeShopId) {
    return { ok: false, code: "shop.forbidden", message: "Only the shop owner can update settings." };
  }

  const parsed = settingsSchema.safeParse({
    tagline: formData.get("tagline") ?? undefined,
    area: formData.get("area") ?? undefined,
    vatEnabled: formData.get("vatEnabled") ?? undefined,
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0]) {
        fields[String(issue.path[0])] = issue.message;
      }
    }
    return {
      ok: false,
      code: "shop.invalid_input",
      message: "Check the form and try again.",
      fields,
    };
  }

  const result = await updateShopSettings({
    shopId: roleContext.activeShopId,
    actorUserId: user.id,
    tagline: parsed.data.tagline ?? null,
    area: parsed.data.area ?? null,
    vatEnabled: parsed.data.vatEnabled === "true" ? true : parsed.data.vatEnabled === "false" ? false : undefined,
  });
  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message };
  }
  return { ok: true };
}

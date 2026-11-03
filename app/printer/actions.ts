"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { gatePrinterExperience } from "@/lib/printer-gate";
import { getAuthenticatedUser } from "@/lib/auth/role-resolver";
import { createDraftShop, publishShop } from "@/lib/services/printer-service";
import { err, ok } from "@/lib/domain/result";

type ActionFailure = { ok: false; code: string; message: string; fields?: Record<string, string> };

const createShopSchema = z.object({
  name: z.string().min(1, "Shop name is required."),
  slug: z.string().min(1, "Slug is required."),
  state: z.string().min(1, "State is required."),
  city: z.string().min(1, "City is required."),
  area: z.string().optional().nullable(),
});

export async function createShopAction(
  formData: FormData,
): Promise<{ ok: true; shopId: string } | ActionFailure> {
  const gate = gatePrinterExperience();
  if (!gate.ok) {
    return { ok: false, code: gate.code, message: gate.message };
  }

  const user = await getAuthenticatedUser(await headers());
  if (!user) {
    return { ok: false, code: "auth.not_authenticated", message: "Sign in to create a shop." };
  }

  const parsed = createShopSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    state: formData.get("state"),
    city: formData.get("city"),
    area: formData.get("area") ?? undefined,
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

  const result = await createDraftShop({
    name: parsed.data.name,
    slug: parsed.data.slug,
    state: parsed.data.state,
    city: parsed.data.city,
    area: parsed.data.area ?? null,
    ownerUserId: user.id,
  });
  if (!result.ok) {
    return { ok: false, code: result.error.code, message: result.error.message, fields: result.error.fields };
  }
  return { ok: true, shopId: result.data.shopId };
}

const publishShopSchema = z.object({ shopId: z.string().uuid("Invalid shop.") });

export async function publishShopAction(
  formData: FormData,
): Promise<{ ok: true } | ActionFailure> {
  const gate = gatePrinterExperience();
  if (!gate.ok) {
    return { ok: false, code: gate.code, message: gate.message };
  }

  const user = await getAuthenticatedUser(await headers());
  if (!user) {
    return { ok: false, code: "auth.not_authenticated", message: "Sign in to publish a shop." };
  }

  const parsed = publishShopSchema.safeParse({ shopId: formData.get("shopId") });
  if (!parsed.success) {
    return { ok: false, code: "shop.invalid_input", message: "Invalid shop." };
  }

  const result = await publishShop({ shopId: parsed.data.shopId, actorUserId: user.id });
  if (!result.ok) {
    return { ok: false, code: result.error.code, message: result.error.message, fields: result.error.fields };
  }
  return { ok: true };
}

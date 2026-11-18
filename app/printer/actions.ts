"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { gatePrinterExperience } from "@/lib/printer-gate";
import {
  getAuthenticatedUser,
  resolveRoleContext,
} from "@/lib/auth/role-resolver";
import { createDraftShop, publishShop } from "@/lib/services/printer-service";

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

export async function publishShopAction(
): Promise<
  | {
      ok: true;
      transitionId: string | null;
      status: "queued" | "processing" | "retryable_failed" | "complete";
    }
  | ActionFailure
> {
  const gate = gatePrinterExperience();
  if (!gate.ok) {
    return { ok: false, code: gate.code, message: gate.message };
  }

  const user = await getAuthenticatedUser(await headers());
  if (!user) {
    return { ok: false, code: "auth.not_authenticated", message: "Sign in to publish a shop." };
  }

  const roleContext = await resolveRoleContext(user.id);
  if (!roleContext.activeShopId) {
    return { ok: false, code: "shop.forbidden", message: "Join a shop before publishing it." };
  }

  const result = await publishShop({
    shopId: roleContext.activeShopId,
    actorUserId: user.id,
  });
  if (!result.ok) {
    return { ok: false, code: result.error.code, message: result.error.message, fields: result.error.fields };
  }
  return { ok: true, ...result.data };
}

"use server";

import { z } from "zod";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { gatePrinterExperience } from "@/lib/printer-gate";
import { getAuthenticatedUser, resolveRoleContext } from "@/lib/auth/role-resolver";
import { createProduct } from "@/lib/services/printer-service";
import { requestProductPublication } from "@/lib/services/printer-publication-service";


const VALID_PRODUCT_CATEGORIES = new Set(["caps", "apparel", "bags", "other"]);

export type ProductActionState =
  | { ok: true; productId: string }
  | { ok: false; message: string; fields?: Record<string, string> };

export type PublicationActionState =
  | {
      ok: true;
      transitionId: string | null;
      status: "queued" | "processing" | "retryable_failed" | "complete";
    }
  | { ok: false; message: string; code: string };

const productSchema = z.object({
  name: z.string().min(1, "Product name is required."),
  slug: z.string().min(1, "Slug is required."),
  category: z.string().refine((val) => VALID_PRODUCT_CATEGORIES.has(val), "Invalid category."),
  description: z.string().optional().nullable(),
  basePriceKobo: z
    .string()
    .min(1, "Base price is required.")
    .refine((val) => /^\d+$/.test(val), "Base price must be a whole number of kobo.")
    .transform((val) => Number(val)),
  sizes: z.string().optional().nullable(),
  colors: z.string().optional().nullable(),
});

const variantSchema = z.object({
  material: z.string().min(1, "Material is required."),
  finish: z.string().min(1, "Finish is required."),
  priceAddonKobo: z
    .string()
    .min(1, "Price add-on is required.")
    .refine((val) => /^\d+$/.test(val), "Price add-on must be a whole number of kobo.")
    .transform((val) => Number(val)),
  minimumQuantity: z
    .string()
    .min(1, "Minimum quantity is required.")
    .refine((val) => /^\d+$/.test(val), "Minimum quantity must be a whole number.")
    .transform((val) => Number(val)),
});

export async function createProductAction(
  _prevState: ProductActionState | null,
  formData: FormData,
): Promise<ProductActionState> {
  const gate = gatePrinterExperience();
  if (!gate.ok) {
    return { ok: false, message: gate.message };
  }

  const user = await getAuthenticatedUser(await headers());
  if (!user) {
    return { ok: false, message: "Sign in to create a product." };
  }

  const roleContext = await resolveRoleContext(user.id);
  if (!roleContext.activeShopId) {
    return { ok: false, message: "Join a shop before creating a product." };
  }

  const name = String(formData.get("name") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const category = String(formData.get("category") ?? "");
  const description = String(formData.get("description") ?? "") || null;
  const basePriceRaw = String(formData.get("basePriceKobo") ?? "");
  const sizesRaw = String(formData.get("sizes") ?? "");
  const colorsRaw = String(formData.get("colors") ?? "");

  const parsed = productSchema.safeParse({
    name,
    slug,
    category,
    description,
    basePriceKobo: basePriceRaw,
    sizes: sizesRaw,
    colors: colorsRaw,
  });
  if (!parsed.success) {
    const fields: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0]) {
        fields[String(issue.path[0])] = issue.message;
      }
    }
    return { ok: false, message: "Check the form and try again.", fields };
  }

  const variantIndices = new Set<number>();
  for (const key of formData.keys()) {
    const match = key.match(/^variants\[(\d+)\]\.(material|finish|priceAddonKobo|minimumQuantity)$/);
    if (match) {
      variantIndices.add(Number(match[1]));
    }
  }

  const variantList = Array.from(variantIndices)
    .sort((a, b) => a - b)
    .map((i) => ({
      material: String(formData.get(`variants[${i}].material`) ?? ""),
      finish: String(formData.get(`variants[${i}].finish`) ?? ""),
      priceAddonKobo: String(formData.get(`variants[${i}].priceAddonKobo`) ?? ""),
      minimumQuantity: String(formData.get(`variants[${i}].minimumQuantity`) ?? ""),
    }));

  const parsedVariants: Array<{ ok: true; data: z.infer<typeof variantSchema> } | { ok: false; message: string; fields: Record<string, string> }> =
    variantList.map((v, index) => {
      const result = variantSchema.safeParse(v);
      if (!result.success) {
        const fields: Record<string, string> = {};
        for (const issue of result.error.issues) {
          if (issue.path[0]) {
            fields[`variants[${index}].${String(issue.path[0])}`] = issue.message;
          }
        }
        return { ok: false, message: "Check the variant fields and try again.", fields };
      }
      return { ok: true, data: result.data };
    });

  const failedVariant = parsedVariants.find((v) => !v.ok);
  if (failedVariant) {
    return { ok: false, message: failedVariant.message, fields: failedVariant.fields };
  }

  const result = await createProduct({
    shopId: roleContext.activeShopId,
    actorUserId: user.id,
    name: parsed.data.name,
    slug: parsed.data.slug,
    category: parsed.data.category,
    artworkKind: null,
    description: parsed.data.description ?? null,
    basePriceKobo: parsed.data.basePriceKobo,
    sizes: sizesRaw.trim() ? sizesRaw.split(",").map((s) => s.trim()).filter(Boolean) : null,
    colors: colorsRaw.trim() ? colorsRaw.split(",").map((s) => s.trim()).filter(Boolean) : null,
    status: "draft",
    variants: parsedVariants.map((v) => (v as { ok: true; data: z.infer<typeof variantSchema> }).data),
  });

  if (!result.ok) {
    const fields: Record<string, string> = {};
    if (result.error.code === "product.slug_taken") {
      fields.slug = result.error.message;
    } else if (result.error.code === "shop.forbidden") {
      return { ok: false, message: result.error.message };
    } else if (result.error.fields) {
      Object.assign(fields, result.error.fields);
    }
    return { ok: false, message: result.error.message, fields };
  }

  redirect(`/printer/catalog/new?productId=${result.data.productId}`);
}

export async function publishProductAction(
  productId: string,
): Promise<PublicationActionState> {
  const gate = gatePrinterExperience();
  if (!gate.ok) {
    return { ok: false, code: gate.code, message: gate.message };
  }

  const user = await getAuthenticatedUser(await headers());
  if (!user) {
    return {
      ok: false,
      code: "auth.not_authenticated",
      message: "Sign in to publish this product.",
    };
  }

  const parsed = z.string().uuid().safeParse(productId);
  if (!parsed.success) {
    return {
      ok: false,
      code: "product.invalid_input",
      message: "Invalid product.",
    };
  }

  const roleContext = await resolveRoleContext(user.id);
  if (!roleContext.activeShopId) {
    return {
      ok: false,
      code: "shop.forbidden",
      message: "Join a shop before publishing a product.",
    };
  }

  const result = await requestProductPublication({
    shopId: roleContext.activeShopId,
    actorUserId: user.id,
    productId: parsed.data,
  });
  if (!result.ok) {
    return {
      ok: false,
      code: result.error.code,
      message: result.error.message,
    };
  }
  return { ok: true, ...result.data };
}

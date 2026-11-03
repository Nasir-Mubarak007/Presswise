"use client";

import { useActionState, useCallback, useState } from "react";
import { createProductAction } from "./action";

type Variant = {
  material: string;
  finish: string;
  priceAddonKobo: string;
  minimumQuantity: string;
};

const PRODUCT_CATEGORIES = ["caps", "apparel", "bags", "other"];

function initialVariant(): Variant {
  return { material: "", finish: "", priceAddonKobo: "0", minimumQuantity: "1" };
}

export default function NewProductForm() {
  const [variants, setVariants] = useState<Variant[]>([initialVariant()]);
  const [status, setStatus] = useState<"draft" | "published" | "archived">("draft");

  const [state, formAction, isPending] = useActionState(createProductAction, null);
  const errorFields = state && !state.ok ? state.fields : undefined;

  const addVariant = useCallback(() => {
    setVariants((prev) => [...prev, initialVariant()]);
  }, []);

  const removeVariant = useCallback((index: number) => {
    setVariants((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateVariant = useCallback((index: number, field: keyof Variant, value: string) => {
    setVariants((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }, []);

  const fieldError = (path: string) => errorFields?.[path];

  return (
    <form action={formAction} className="space-y-6">
      {state && !state.ok && (
        <div className="rounded-lg border border-amber/40 bg-amber/10 p-4 text-sm text-ink" role="alert">
          {state.message}
        </div>
      )}

      <section className="rounded-xl border border-ink/10 bg-surface p-5 sm:p-7">
        <h2 className="text-sm font-semibold tracking-wide text-ink/60 uppercase mb-4">
          Product details
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-ink mb-1">
              Product name
            </label>
            <input
              name="name"
              type="text"
              required
              defaultValue=""
              className={`w-full rounded-lg border px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 ${
                fieldError( "name") ? "border-amber/50" : "border-ink/15 bg-surface"
              }`}
            />
            {fieldError( "name") && (
              <p className="mt-1 text-xs text-amber/90">{fieldError("name")}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Product web address (slug)
            </label>
            <input
              name="slug"
              type="text"
              required
              defaultValue=""
              pattern="[A-Za-z0-9]+(?:[- ][A-Za-z0-9]+)*"
              title="Use letters and numbers, with single spaces or hyphens between words."
              className={`w-full rounded-lg border px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 ${
                fieldError( "slug") ? "border-amber/50" : "border-ink/15 bg-surface"
              }`}
            />
            {fieldError( "slug") && (
              <p className="mt-1 text-xs text-amber/90">{fieldError("slug")}</p>
            )}
            <p className="mt-1 text-xs text-ink/50">
              Spaces are converted to hyphens. Must be unique within your shop.
            </p>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-ink mb-1">
              Description
            </label>
            <textarea
              name="description"
              rows={3}
              defaultValue=""
              className={`w-full rounded-lg border px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 ${
                fieldError( "description") ? "border-amber/50" : "border-ink/15 bg-surface"
              }`}
            />
            {fieldError( "description") && (
              <p className="mt-1 text-xs text-amber/90">{fieldError("description")}</p>
            )}
            <p className="mt-1 text-xs text-ink/50">
              Optional. Shown on your public shop page.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-ink mb-1">
              Category
            </label>
            <select
              name="category"
              required
              defaultValue=""
              className={`w-full rounded-lg border px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 ${
                fieldError( "category") ? "border-amber/50" : "border-ink/15 bg-surface"
              }`}
            >
              <option value="" disabled>
                Select a category
              </option>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.charAt(0).toUpperCase() + c.slice(1)}
                </option>
              ))}
            </select>
            {fieldError( "category") && (
              <p className="mt-1 text-xs text-amber/90">{fieldError("category")}</p>
            )}
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-ink mb-1">
              Base price (₦)
            </label>
            <input
              name="basePriceKobo"
              type="text"
              inputMode="numeric"
              required
              defaultValue=""
              className={`w-full rounded-lg border px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 ${
                fieldError( "basePriceKobo") ? "border-amber/50" : "border-ink/15 bg-surface"
              }`}
            />
            {fieldError( "basePriceKobo") && (
              <p className="mt-1 text-xs text-amber/90">{fieldError("basePriceKobo")}</p>
            )}
            <p className="mt-1 text-xs text-ink/50">
              Required to publish. Enter whole kobo (e.g. 5000 for ₦50.00).
            </p>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-ink mb-1">
              Sizes
            </label>
            <input
              name="sizes"
              type="text"
              defaultValue=""
              placeholder="e.g. S, M, L, XL"
              className="w-full rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <p className="mt-1 text-xs text-ink/50">Optional. Comma separated.</p>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-ink mb-1">
              Colors
            </label>
            <input
              name="colors"
              type="text"
              defaultValue=""
              placeholder="e.g. Black, White, Navy"
              className="w-full rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
            <p className="mt-1 text-xs text-ink/50">Optional. Comma separated.</p>
          </div>
          <div className="col-span-2">
            <label className="block text-sm font-medium text-ink mb-1">
              Status
            </label>
            <select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "draft" | "published" | "archived")}
              className={`w-full rounded-lg border px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20 border-ink/15 bg-surface`}
            >
              <option value="draft">Draft (private)</option>
              <option value="published">Published (public)</option>
            </select>
            <p className="mt-1 text-xs text-ink/50">
              Published products need a base price, category, at least one priced variant, and a
              cover photo before the shop can go public.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-ink/10 bg-surface p-5 sm:p-7">
        <h2 className="text-sm font-semibold tracking-wide text-ink/60 uppercase mb-4">
          Variants
        </h2>
        <p className="text-sm text-ink/60 mb-4">
          Each variant is a material + finish combination with its own price add-on and minimum
          quantity.
        </p>
        <div id="variant-list">
          {variants.map((variant, index) => (
            <div
              key={index}
              className="mt-4 grid gap-3 sm:grid-cols-5 border-t border-ink/10 pt-4"
            >
              <div>
                <label className="block text-xs font-medium text-ink/50 mb-1">
                  Material
                </label>
                <input
                  name={`variants[${index}].material`}
                  type="text"
                  required
                  defaultValue={variant.material}
                  onChange={(e) => updateVariant(index, "material", e.target.value)}
                  className="w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                />
                {fieldError( `variants[${index}].material`) && (
                  <p className="mt-1 text-xs text-amber/90">
                    {fieldError(`variants[${index}].material`)}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/50 mb-1">
                  Finish
                </label>
                <input
                  name={`variants[${index}].finish`}
                  type="text"
                  required
                  defaultValue={variant.finish}
                  onChange={(e) => updateVariant(index, "finish", e.target.value)}
                  className="w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                />
                {fieldError( `variants[${index}].finish`) && (
                  <p className="mt-1 text-xs text-amber/90">
                    {fieldError(`variants[${index}].finish`)}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/50 mb-1">
                  Price add-on (₦)
                </label>
                <input
                  name={`variants[${index}].priceAddonKobo`}
                  type="text"
                  inputMode="numeric"
                  required
                  defaultValue={variant.priceAddonKobo}
                  onChange={(e) => updateVariant(index, "priceAddonKobo", e.target.value)}
                  className="w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                />
                {fieldError( `variants[${index}].priceAddonKobo`) && (
                  <p className="mt-1 text-xs text-amber/90">
                    {fieldError(`variants[${index}].priceAddonKobo`)}
                  </p>
                )}
                <p className="text-[10px] text-ink/40 mt-1">Added to base price</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-ink/50 mb-1">
                  Min quantity
                </label>
                <input
                  name={`variants[${index}].minimumQuantity`}
                  type="text"
                  inputMode="numeric"
                  required
                  defaultValue={variant.minimumQuantity}
                  onChange={(e) => updateVariant(index, "minimumQuantity", e.target.value)}
                  className="w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-xs text-ink outline-none focus:border-brand"
                />
                {fieldError( `variants[${index}].minimumQuantity`) && (
                  <p className="mt-1 text-xs text-amber/90">
                    {fieldError(`variants[${index}].minimumQuantity`)}
                  </p>
                )}
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => removeVariant(index)}
                  disabled={variants.length === 1}
                  className="rounded-lg border border-ink/15 bg-surface px-3 py-2 text-xs text-ink/60 hover:bg-ink/5 disabled:opacity-50 disabled:pointer-events-none"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addVariant}
          className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-brand hover:text-brand/90"
        >
          <span aria-hidden="true">+</span> Add variant
        </button>
      </section>

      <div className="mt-8">
        <button
          type="submit"
          disabled={isPending}
          className={`rounded-lg px-4 py-2.5 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
            isPending
              ? "bg-ink/10 text-ink/40 cursor-not-allowed"
              : "bg-brand text-surface hover:bg-brand/90"
          }`}
        >
          {isPending ? "Creating…" : "Create product"}
        </button>
      </div>
    </form>
  );
}

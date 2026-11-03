import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { isPrinterExperienceEnabled } from "@/lib/printer-gate";
import { listDirectoryShops } from "@/lib/services/printer-service";

const CATEGORIES = ["caps", "apparel", "bags", "other"];

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const params = await searchParams;
  const query = params.query;
  return {
    title: query ? `"${query}" · Printer directory · Presswise` : "Printer directory · Presswise",
    description: "Find Nigerian print shops by location, product category, material, and finish.",
  };
}

export default async function PrintersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (!isPrinterExperienceEnabled()) {
    notFound();
  }

  const params = await searchParams;
  const query = typeof params.query === "string" ? params.query : undefined;
  const location = typeof params.location === "string" ? params.location : undefined;
  const category = typeof params.category === "string" ? params.category : undefined;
  const material = typeof params.material === "string" ? params.material : undefined;
  const finish = typeof params.finish === "string" ? params.finish : undefined;
  const pageRaw = typeof params.page === "string" ? params.page : undefined;
  const page = pageRaw ? Math.max(1, Number(pageRaw)) : 1;

  const result = await listDirectoryShops({ query, location, category, material, finish, page });

  const imageUrl = (key: string | null): string | undefined =>
    key ? `${process.env.R2_PUBLIC_URL ?? ""}/${key}` : undefined;

  return (
    <main className="min-h-dvh bg-surface text-ink">
      <div className="mx-auto flex max-w-6xl flex-col gap-7 px-4 py-10 sm:px-6 sm:py-12 lg:px-8 lg:py-16">
        <header className="max-w-3xl">
          <p className="text-sm font-medium tracking-widest text-brand uppercase">
            Printer directory
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Find a printer shop
          </h1>
          <p className="mt-3 text-sm leading-6 text-ink/70 sm:text-base">
            Published shops only, with real product photos and pricing.
          </p>
        </header>

        <section aria-labelledby="filters-heading">
          <h2 id="filters-heading" className="sr-only">Filters</h2>
          <form className="mt-4 grid grid-cols-1 items-end gap-4 rounded-xl border border-ink/10 bg-surface/30 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-6">
            <label className="flex min-w-0 flex-col gap-1 lg:col-span-2">
              <span className="text-xs font-medium text-ink/60 uppercase">Keyword</span>
              <input
                name="query"
                defaultValue={query ?? ""}
                placeholder="Shop name, city, material…"
                className="w-full min-w-0 rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-ink/60 uppercase">Location</span>
              <input
                name="location"
                defaultValue={location ?? ""}
                placeholder="State or city"
                className="w-full min-w-0 rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-ink/60 uppercase">Category</span>
              <select
                name="category"
                defaultValue={category ?? ""}
                className="w-full min-w-0 rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              >
                <option value="">Any</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-ink/60 uppercase">Material</span>
              <input
                name="material"
                defaultValue={material ?? ""}
                placeholder="e.g. cotton"
                className="w-full min-w-0 rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1">
              <span className="text-xs font-medium text-ink/60 uppercase">Finish</span>
              <input
                name="finish"
                defaultValue={finish ?? ""}
                placeholder="e.g. stitched"
                className="w-full min-w-0 rounded-lg border border-ink/15 bg-surface px-3 py-2.5 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-6">
              <button
                type="submit"
                className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-surface hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:w-auto"
              >
                Apply filters
              </button>
              {Boolean(query || location || category || material || finish) && (
                <a
                  href="/printers"
                  className="text-sm font-medium text-brand underline underline-offset-4 hover:text-brand/90"
                >
                  Clear filters
                </a>
              )}
            </div>
          </form>
        </section>

        <section aria-labelledby="results-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
            <div>
              <h2 id="results-heading" className="text-sm font-semibold tracking-wide text-ink/60 uppercase">
                Shops
              </h2>
              <p className="mt-1 text-sm text-ink/60">
                {result.shops.length} of approximately {result.pageCount *
                  12} result{result.pageCount === 1 ? "" : "s"}
              </p>
            </div>
            <div className="text-sm text-ink/60 sm:text-right">
              Page {result.page} of {result.pageCount}
            </div>
          </div>

          {result.shops.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-ink/20 bg-surface/50 px-5 py-10 text-center">
              <h3 className="text-base font-semibold">No shops found</h3>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                No published shops match your filters. Try clearing a filter or searching another location.
              </p>
            </div>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {result.shops.map((shop) => (
                <li
                  key={shop.id}
                  className="flex min-w-0 flex-col rounded-xl border border-ink/10 bg-surface p-3 transition-shadow hover:shadow-md sm:p-4"
                >
                  {shop.product?.coverObjectKey ? (
                    <a
                      href={`/shops/${shop.slug}`}
                      className="mb-3 block aspect-[4/3] w-full overflow-hidden rounded-lg bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                    >
                      <img
                        src={imageUrl(shop.product.coverObjectKey)}
                        alt={shop.product.coverAltText ?? shop.product.name}
                        className="h-full w-full object-cover transition-transform duration-300 hover:scale-[1.02]"
                        loading="lazy"
                      />
                    </a>
                  ) : (
                    <div className="mb-3 flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-ink/10 bg-surface/50 text-sm text-ink/40">
                      No photo yet
                    </div>
                  )}
                  <a href={`/shops/${shop.slug}`} className="text-ink hover:text-brand">
                    <p className="font-semibold">{shop.name}</p>
                  </a>
                  <p className="mt-1 text-sm text-ink/60">
                    {shop.city}, {shop.state}
                    {shop.area ? ` · ${shop.area}` : ""}
                  </p>
                  {shop.product && (
                    <>
                      <p className="mt-3 text-xs text-ink/50">
                        {shop.product.material}, {shop.product.finish}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-ink">
                        ₦{(shop.product.unitPriceKobo / 100).toFixed(2)}
                        {shop.product.minimumQuantity > 1 ? ` · min ${shop.product.minimumQuantity}` : ""}
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 flex items-center gap-2">
            {result.page > 1 && (
              <a
                href={buildUrl({ ...params, page: String(result.page - 1) })}
                className="rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink hover:bg-ink/5"
              >
                Previous
              </a>
            )}
            {result.hasNext && (
              <a
                href={buildUrl({ ...params, page: String(result.page + 1) })}
                className="rounded-lg border border-ink/15 bg-surface px-3 py-2 text-sm text-ink hover:bg-ink/5"
              >
                Next
              </a>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

function buildUrl(params: {
  [key: string]: string | string[] | undefined;
}): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, Array.isArray(value) ? value.join(",") : value);
  }
  return `/printers?${search.toString()}`;
}

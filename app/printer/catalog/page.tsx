import PrinterDashboardShell from "@/components/printer-dashboard-shell";
import { requireDashboardAccess } from "@/lib/printer-dashboard";
import { listShopProducts } from "@/lib/services/printer-service";
import { formatMoney } from "@/lib/format-money";

const STATUS_TABS: { key: string | null; label: string }[] = [
  { key: null, label: "All" },
  { key: "draft", label: "Draft" },
  { key: "published", label: "Published" },
  { key: "archived", label: "Archived" },
];

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const ctx = await requireDashboardAccess();
  const params = await searchParams;
  const status = typeof params.status === "string" ? params.status : undefined;
  const pageRaw = typeof params.page === "string" ? params.page : undefined;
  const page = pageRaw ? Math.max(1, Number(pageRaw)) : 1;

  const isOwner =
    ctx.roleContext.roles.includes("printer_owner") ||
    ctx.roleContext.roles.includes("platform_admin");
  const isWriter = isOwner || ctx.membership.role === "manager";

  const result = await listShopProducts({
    shopId: ctx.membership.shopId,
    status,
    page,
  });

  const imageUrl = (key: string | null): string | undefined =>
    key ? `${process.env.R2_PUBLIC_URL ?? ""}/${key}` : undefined;

  return (
    <PrinterDashboardShell
      activePage="catalog"
      isOwner={isOwner}
      isPlatformAdmin={ctx.roleContext.roles.includes("platform_admin")}
    >
      <div className="max-w-5xl">
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Catalog</h1>
            <p className="mt-1 text-ink/60">
              Manage your shop's products. {isWriter ? "Owners and managers can add or edit products." : "Staff can view the catalog."}
            </p>
          </div>
        </header>

        <section aria-labelledby="status-tabs">
          <h2 id="status-tabs" className="sr-only">Product status</h2>
          <div className="flex flex-wrap gap-1 mb-4">
            {STATUS_TABS.map((tab) => {
              const active = tab.key === status || (tab.key === null && !status);
              return (
                <a
                  key={tab.label}
                  href={buildUrl({ ...params, status: tab.key ?? undefined, page: "1" })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${
                    active
                      ? "border-brand bg-brand text-surface"
                      : "border-ink/15 text-ink/60 hover:bg-ink/5"
                  }`}
                >
                  {tab.label}
                </a>
              );
            })}
            {isWriter && (
              <a
                href="/printer/catalog/new"
                className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-surface hover:bg-brand/90"
              >
                Add product
              </a>
            )}
          </div>
        </section>

        <section>
          {result.products.length === 0 ? (
            <p className="text-ink/60">
              No products {status ? `with status "${status}"` : ""} yet.
            </p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-ink/10 text-xs font-semibold text-ink/50 uppercase">
                  <th className="pb-3 text-ink">Product</th>
                  <th className="pb-3 text-ink">Category</th>
                  <th className="pb-3 text-ink">Status</th>
                  <th className="pb-3 text-ink">Price</th>
                  <th className="pb-3 text-ink">Variants</th>
                  <th className="pb-3 text-ink">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {result.products.map((product) => (
                  <tr key={product.id} className="text-sm">
                    <td className="py-3 flex items-center gap-3">
                      {product.coverObjectKey ? (
                        <img
                          src={imageUrl(product.coverObjectKey)}
                          alt={product.coverAltText ?? product.name}
                          className="w-10 h-10 object-cover rounded-lg"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg border border-ink/10 bg-surface/50 flex items-center justify-center text-ink/30 text-xs">
                          –
                        </div>
                      )}
                      <div>
                        <p className="text-ink font-medium">{product.name}</p>
                        <p className="text-xs text-ink/50">{product.slug}</p>
                      </div>
                    </td>
                    <td className="py-3 text-ink/70">
                      {product.category ? product.category.charAt(0).toUpperCase() + product.category.slice(1) : "—"}
                    </td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        product.status === "published"
                          ? "bg-brand/10 text-brand"
                          : product.status === "draft"
                          ? "bg-ink/5 text-ink/60"
                          : "bg-amber/10 text-amber/90"
                      }`}>
                        {product.status}
                      </span>
                    </td>
                    <td className="py-3 font-medium">
                      {product.basePriceKobo != null ? formatMoney(product.basePriceKobo) : "—"}
                    </td>
                    <td className="py-3 text-ink/60">{product.variantCount}</td>
                    <td className="py-3 text-ink/50">
                      {product.createdAt.toLocaleDateString("en-NG", {
                        timeZone: "Africa/Lagos",
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="mt-6 flex items-center justify-between gap-2">
            <p className="text-sm text-ink/60">
              Page {result.page} of {result.pageCount}
            </p>
            <div className="flex gap-2">
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
          </div>
        </section>
      </div>
    </PrinterDashboardShell>
  );
}

function buildUrl(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    search.set(key, value);
  }
  return `/printer/catalog?${search.toString()}`;
}

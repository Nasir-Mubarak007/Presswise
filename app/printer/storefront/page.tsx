import PrinterDashboardShell from "@/components/printer-dashboard-shell";
import { requireDashboardAccess, requireOwnerOrPlatformAdmin } from "@/lib/printer-dashboard";
import { db } from "@/lib/db/client";
import { printerShop } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export default async function StorefrontPage() {
  const ctx = await requireDashboardAccess();
  requireOwnerOrPlatformAdmin(ctx.roleContext);

  const isOwner =
    ctx.roleContext.roles.includes("printer_owner") ||
    ctx.roleContext.roles.includes("platform_admin");

  const [shopRow] = await db
    .select()
    .from(printerShop)
    .where(eq(printerShop.id, ctx.membership.shopId))
    .limit(1);

  return (
    <PrinterDashboardShell
      activePage="storefront"
      isOwner={isOwner}
      isPlatformAdmin={ctx.roleContext.roles.includes("platform_admin")}
    >
      <div className="max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Storefront</h1>
          <p className="mt-1 text-ink/60">
            Manage your public shop details and publication status.
          </p>
        </header>

        {!shopRow ? (
          <p className="text-ink/60">Shop not found.</p>
        ) : (
          <>
            <section className="mb-8 rounded-lg border border-ink/10 bg-surface p-4">
              <h2 className="text-sm font-semibold tracking-wide text-ink/60 uppercase mb-3">
                Shop details
              </h2>
              <dl className="grid gap-2 sm:grid-cols-2 text-sm">
                <div className="col-span-2">
                  <dt className="text-ink/50">Name</dt>
                  <dd className="text-ink font-medium">{shopRow.name}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-ink/50">Slug</dt>
                  <dd className="text-ink font-medium monospace">{shopRow.slug}</dd>
                </div>
                <div>
                  <dt className="text-ink/50">Location</dt>
                  <dd className="text-ink/70">
                    {shopRow.city}, {shopRow.state}
                    {shopRow.area ? ` · ${shopRow.area}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/50">VAT</dt>
                  <dd className={`text-ink/70 ${shopRow.vatEnabled ? "font-medium" : ""}`}>
                    {shopRow.vatEnabled ? "Enabled" : "Disabled"}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink/50">Status</dt>
                  <dd className={`text-ink/70 font-medium ${shopRow.status === "published" ? "text-brand" : "text-ink/60"}`}>
                    {shopRow.status}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border border-ink/10 bg-surface p-4">
              <h2 className="text-sm font-semibold tracking-wide text-ink/60 uppercase mb-3">
                Publication
              </h2>
              <p className="mb-3 text-sm text-ink/70">
                Only published shops are visible to customers on the public directory and shop page.
              </p>
              <p className="text-sm text-ink/50">
                Current status:{shopRow.status === "published" ? " Published" : shopRow.status === "draft" ? " Draft (private)" : " Suspended"}
              </p>
            </section>
          </>
        )}
      </div>
    </PrinterDashboardShell>
  );
}

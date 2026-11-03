import PrinterDashboardShell from "@/components/printer-dashboard-shell";
import { requireDashboardAccess, requireOwnerOrPlatformAdmin } from "@/lib/printer-dashboard";
import { updateSettingsAction } from "@/app/printer/settings/actions";

export default async function SettingsPage() {
  const ctx = await requireDashboardAccess();
  requireOwnerOrPlatformAdmin(ctx.roleContext);

  const isOwner =
    ctx.roleContext.roles.includes("printer_owner") ||
    ctx.roleContext.roles.includes("platform_admin");

  return (
    <PrinterDashboardShell
      activePage="settings"
      isOwner={isOwner}
      isPlatformAdmin={ctx.roleContext.roles.includes("platform_admin")}
    >
      <div className="max-w-2xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-ink/60">
            Shop details, delivery choices, and VAT. Owner only.
          </p>
        </header>

        <section className="rounded-lg border border-ink/10 bg-surface p-4">
          <h2 className="text-sm font-semibold tracking-wide text-ink/60 uppercase mb-4">
            Shop settings
          </h2>
          <form action={async (formData: FormData) => {
            await updateSettingsAction(formData);
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Tagline
              </label>
              <input
                name="tagline"
                type="text"
                placeholder="Short shop description"
                className="w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
              <p className="mt-1 text-xs text-ink/50">Shown on your public shop page (max 200 characters).</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Area
              </label>
              <input
                name="area"
                type="text"
                placeholder="Neighbourhood or district"
                className="w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              />
              <p className="mt-1 text-xs text-ink/50">Optional area within your city. Not shown publicly.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-ink mb-1">
                Charge VAT
              </label>
              <select
                name="vatEnabled"
                className="w-full rounded-lg border border-ink/15 bg-surface px-3 py-2 text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/30"
              >
                <option value="false">Disabled</option>
                <option value="true">Enabled (7.5% of item subtotal)</option>
              </select>
              <p className="mt-1 text-xs text-ink/50">When enabled, VAT is added at 7.5% of the item subtotal.</p>
            </div>
            <button
              type="submit"
              className="w-full rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-surface hover:bg-brand/90"
            >
              Save settings
            </button>
          </form>
        </section>
      </div>
    </PrinterDashboardShell>
  );
}

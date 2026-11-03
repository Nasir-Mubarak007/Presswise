import PrinterDashboardShell from "@/components/printer-dashboard-shell";
import { requireDashboardAccess, requireOwnerOrPlatformAdmin } from "@/lib/printer-dashboard";
import { getOverviewMetrics } from "@/lib/services/printer-service";
import { formatMoney } from "@/lib/format-money";

export default async function OverviewPage() {
  const ctx = await requireDashboardAccess();
  const metrics = await getOverviewMetrics(
    ctx.membership.shopId,
    ctx.user.id,
    ctx.membership.role,
  );
  const isOwner =
    ctx.roleContext.roles.includes("printer_owner") ||
    ctx.roleContext.roles.includes("platform_admin");

  return (
    <PrinterDashboardShell
      activePage="overview"
      isOwner={isOwner}
      isPlatformAdmin={ctx.roleContext.roles.includes("platform_admin")}
    >
      <div className="max-w-4xl">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-ink/60">
            Shop activity for {new Date().toLocaleDateString("en-NG", {
              timeZone: "Africa/Lagos",
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}.
          </p>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <MetricCard
            title="Paid orders today"
            value={metrics.paidToday}
            subtitle={metrics.isStaff ? "Your assigned orders" : "All shop orders"}
          />
          <MetricCard
            title="Ready to start"
            value={metrics.ready}
            subtitle="Orders with paid status"
          />
          <MetricCard
            title="In production or shipped"
            value={metrics.active}
            subtitle="Active fulfillment orders"
          />
          {!metrics.isStaff && (
            <MetricCard
              title="Settled net payout (30d)"
              value={formatMoney(metrics.settledNetPayout30d)}
              subtitle="Net payout, not profit"
            />
          )}
        </section>

        {metrics.isStaff && (
          <section className="mt-8 rounded-lg border border-ink/10 bg-surface/30 p-4">
            <h2 className="text-sm font-semibold tracking-wide text-ink/60 uppercase mb-3">
              Your scope
            </h2>
            <p className="text-sm text-ink/70">
              As a staff member you see counts for your assigned orders only. Payout metrics are
              owner and manager only.
            </p>
          </section>
        )}
      </div>
    </PrinterDashboardShell>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
}: {
  title: string;
  value: React.ReactNode;
  subtitle: string;
}) {
  return (
    <div className="rounded-lg border border-ink/10 bg-surface p-4">
      <p className="text-xs font-medium tracking-wide text-ink/50 uppercase">{title}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-sm text-ink/50">{subtitle}</p>
    </div>
  );
}

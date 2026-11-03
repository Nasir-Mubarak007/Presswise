import PrinterDashboardShell from "@/components/printer-dashboard-shell";
import { requireDashboardAccess, requireOwnerOrPlatformAdmin } from "@/lib/printer-dashboard";
import { listDashboardPayouts } from "@/lib/services/printer-service";
import { formatMoney } from "@/lib/format-money";

export default async function PayoutsPage() {
  const ctx = await requireDashboardAccess();
  requireOwnerOrPlatformAdmin(ctx.roleContext);

  const isOwner =
    ctx.roleContext.roles.includes("printer_owner") ||
    ctx.roleContext.roles.includes("platform_admin");

  const payouts = await listDashboardPayouts(ctx.membership.shopId);

  const totalNet = payouts.reduce((sum, p) => (p.status === "settled" ? sum + p.netKobo : sum), 0);

  return (
    <PrinterDashboardShell
      activePage="payouts"
      isOwner={isOwner}
      isPlatformAdmin={ctx.roleContext.roles.includes("platform_admin")}
    >
      <div className="max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Payouts</h1>
          <p className="mt-1 text-ink/60">
            Payout records for your shop. Read only. Owner only.
          </p>
        </header>

        <section className="mb-6 rounded-lg border border-ink/10 bg-surface p-4">
          <h2 className="text-sm font-semibold tracking-wide text-ink/60 uppercase mb-3">
            Summary
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium tracking-wide text-ink/50 uppercase">Total settled</p>
              <p className="text-2xl font-semibold text-ink">{formatMoney(totalNet)}</p>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-ink/50 uppercase">Payouts</p>
              <p className="text-2xl font-semibold text-ink">{payouts.length}</p>
            </div>
            <div>
              <p className="text-xs font-medium tracking-wide text-ink/50 uppercase">Settled</p>
              <p className="text-2xl font-semibold text-ink">
                {payouts.filter((p) => p.status === "settled").length}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-ink/10 bg-surface p-4">
          <h2 className="text-sm font-semibold tracking-wide text-ink/60 uppercase mb-3">
            Payout records
          </h2>
          {payouts.length === 0 ? (
            <p className="text-ink/60">No payouts yet.</p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-ink/10 text-xs font-semibold text-ink/50 uppercase">
                  <th className="pb-3 text-ink">Order</th>
                  <th className="pb-3 text-ink">Gross</th>
                  <th className="pb-3 text-ink">Platform fee</th>
                  <th className="pb-3 text-ink">Net payout</th>
                  <th className="pb-3 text-ink">Status</th>
                  <th className="pb-3 text-ink">Paid at</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {payouts.map((p) => (
                  <tr key={p.id} className="text-sm">
                    <td className="py-3 text-ink/60 monospace">{p.orderId.slice(0, 8)}…</td>
                    <td className="py-3 font-medium">{formatMoney(p.grossKobo)}</td>
                    <td className="py-3 text-ink/60">{formatMoney(p.platformFeeKobo)}</td>
                    <td className="py-3 font-medium">{formatMoney(p.netKobo)}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.status === "settled"
                          ? "bg-brand/10 text-brand"
                          : p.status === "pending"
                          ? "bg-ink/5 text-ink/60"
                          : "bg-amber/10 text-amber/90"
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 text-ink/50">
                      {p.paidAt ? p.paidAt.toLocaleDateString("en-NG", { timeZone: "Africa/Lagos" }) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </PrinterDashboardShell>
  );
}

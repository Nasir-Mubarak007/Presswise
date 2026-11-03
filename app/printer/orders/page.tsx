import PrinterDashboardShell from "@/components/printer-dashboard-shell";
import { requireDashboardAccess } from "@/lib/printer-dashboard";
import { listDashboardOrders, listShopMemberships } from "@/lib/services/printer-service";
import {
  assignOrderAction,
  fulfillOrderAction,
  requestRefundAction,
} from "@/app/printer/orders/actions";
import { formatMoney, formatOrderNumber } from "@/lib/format-money";

const STATUS_TABS: { key: string | null; label: string }[] = [
  { key: null, label: "All" },
  { key: "paid", label: "Ready" },
  { key: "in_production", label: "In production" },
  { key: "shipped", label: "Shipped" },
  { key: "completed", label: "Completed" },
];

export default async function OrdersPage({
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
  const isStaff = ctx.membership.role === "staff";

  const result = await listDashboardOrders({
    shopId: ctx.membership.shopId,
    status,
    page,
    userId: ctx.user.id,
    role: ctx.membership.role,
  });

  const memberships = await listShopMemberships(ctx.membership.shopId);
  const staffMembers = memberships.filter((m) => m.role === "staff" && m.status === "active");

  return (
    <PrinterDashboardShell
      activePage="orders"
      isOwner={isOwner}
      isPlatformAdmin={ctx.roleContext.roles.includes("platform_admin")}
    >
      <div className="max-w-5xl">
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Orders</h1>
            <p className="mt-1 text-ink/60">
              Newest first. {isStaff ? "You see your assigned orders only." : "You see all shop orders."}
            </p>
          </div>
        </header>

        <section aria-labelledby="status-tabs">
          <h2 id="status-tabs" className="sr-only">Order status</h2>
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
          </div>
        </section>

        <section>
          {result.orders.length === 0 ? (
            <p className="text-ink/60">
              No orders {status ? `with status "${status}"` : ""} yet.
            </p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-ink/10 text-xs font-semibold text-ink/50 uppercase">
                  <th className="pb-3 text-ink">Order</th>
                  <th className="pb-3 text-ink">Status</th>
                  <th className="pb-3 text-ink">Contact</th>
                  <th className="pb-3 text-ink">Total</th>
                  <th className="pb-3 text-ink">Assigned to</th>
                  <th className="pb-3 text-ink">Created</th>
                  <th className="pb-3 text-ink">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {result.orders.map((order) => (
                  <tr key={order.id} className="text-sm">
                    <td className="py-3 text-ink font-medium">{formatOrderNumber(order.orderNumber)}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        order.status === "paid"
                          ? "bg-brand/10 text-brand"
                          : order.status === "in_production"
                          ? "bg-amber/10 text-amber/90"
                          : order.status === "shipped"
                          ? "bg-blue/10 text-blue/90"
                          : order.status === "completed"
                          ? "bg-green/10 text-green/90"
                          : "bg-ink/5 text-ink/60"
                      }`}>
                        {order.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-3 text-ink/70">{order.contactName ?? "—"}</td>
                    <td className="py-3 font-medium">{formatMoney(order.totalKobo)}</td>
                    <td className="py-3 text-ink/60">
                      {isWriter && staffMembers.length > 0 && order.status !== "completed" && order.status !== "refunded" ? (
                        <form action={async (formData: FormData) => { await assignOrderAction(formData); }} className="flex items-center gap-2">
                          <select
                            name="staffMembershipId"
                            defaultValue={order.assignedMemberName ? "" : undefined}
                            className="rounded border border-ink/15 bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-brand"
                          >
                            <option value="">Assign</option>
                            {staffMembers.map((m) => (
                              <option key={m.membershipId} value={m.membershipId}>
                                {m.userName ?? m.userEmail}
                              </option>
                            ))}
                          </select>
                          <input type="hidden" name="orderId" value={order.id} />
                          <button
                            type="submit"
                            className="rounded bg-brand px-2 py-1 text-xs text-surface font-medium hover:bg-brand/90"
                          >
                            Go
                          </button>
                        </form>
                      ) : (
                        order.assignedMemberName ?? (isStaff ? "You" : "Unassigned")
                      )}
                    </td>
                    <td className="py-3 text-ink/50">
                      {order.createdAt.toLocaleDateString("en-NG", {
                        timeZone: "Africa/Lagos",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        {isWriter && order.status === "paid" && (
                          <form action={async (formData: FormData) => { await fulfillOrderAction(formData); }} className="inline" onSubmit={(e) => {
                            e.preventDefault();
                            const form = e.currentTarget;
                            const statusSelect = form.elements.namedItem("toStatus") as HTMLSelectElement;
                            const trackingInput = form.elements.namedItem("trackingNumber") as HTMLInputElement;
                            if (!confirm(`Move order ${formatOrderNumber(order.orderNumber)} to ${statusSelect.value}?`)) return;
                            (form.elements.namedItem("trackingNumber") as HTMLInputElement).value = trackingInput.value;
                            form.requestSubmit();
                          }}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <select name="toStatus" className="rounded border border-ink/15 bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-brand">
                              <option value="in_production">Start production</option>
                              <option value="shipped">Ship</option>
                            </select>
                            {order.deliveryMethod !== "pickup" && (
                              <input
                                name="trackingNumber"
                                type="text"
                                placeholder="Tracking no."
                                className="rounded border border-ink/15 bg-surface px-2 py-1 text-xs text-ink outline-none focus:border-brand w-24"
                              />
                            )}
                            <button type="submit" className="rounded bg-brand px-2 py-1 text-xs text-surface font-medium hover:bg-brand/90">
                              Go
                            </button>
                          </form>
                        )}
                        {isWriter && (order.status === "in_production" || order.status === "shipped") && (
                          <form action={async (formData: FormData) => { await fulfillOrderAction(formData); }} className="inline ml-2" onSubmit={(e) => {
                            e.preventDefault();
                            if (!confirm(`Mark order ${formatOrderNumber(order.orderNumber)} as completed?`)) return;
                            (e.currentTarget.elements.namedItem("toStatus") as HTMLSelectElement).value = "completed";
                            e.currentTarget.requestSubmit();
                          }}>
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="toStatus" value="completed" />
                            <button type="submit" className="rounded bg-green/10 px-2 py-1 text-xs text-green/90 font-medium hover:bg-green/20">
                              Complete
                            </button>
                          </form>
                        )}
                        {isWriter && order.status === "paid" && (
                          <form action={async (formData: FormData) => { await requestRefundAction(formData); }} className="inline ml-2">
                            <input type="hidden" name="orderId" value={order.id} />
                            <button
                              type="submit"
                              className="rounded bg-amber/10 px-2 py-1 text-xs text-amber/90 font-medium hover:bg-amber/20"
                              onClick={(e) => {
                                if (!confirm(`Request full refund for order ${formatOrderNumber(order.orderNumber)}?`)) e.preventDefault();
                              }}
                            >
                              Refund
                            </button>
                          </form>
                        )}
                      </div>
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
  return `/printer/orders?${search.toString()}`;
}

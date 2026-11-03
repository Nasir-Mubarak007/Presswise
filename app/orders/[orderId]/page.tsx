import { notFound, redirect } from "next/navigation";
import { headers } from "next/headers";
import { gatePrinterExperience, requirePrinterExperience } from "@/lib/printer-gate";
import { getAuthenticatedUser } from "@/lib/auth/role-resolver";
import { getCustomerOrderTracking, listCustomerOrders } from "@/lib/services/printer-service";
import { formatMoney, formatOrderNumber } from "@/lib/format-money";

export default async function OrderTrackingPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const gate = gatePrinterExperience();
  if (!gate.ok) {
    requirePrinterExperience();
  }

  const { orderId } = await params;
  const user = await getAuthenticatedUser(await headers());
  if (!user) {
    redirect("/sign-in");
  }

  const tracking = await getCustomerOrderTracking(user.id, orderId);
  if (!tracking) {
    notFound();
  }

  return (
    <main className="min-h-dvh bg-surface text-ink">
      <div className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-16">
        <header>
          <p className="text-sm font-medium tracking-widest text-brand uppercase">Order tracking</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Order {formatOrderNumber(tracking.orderNumber)}
          </h1>
          <p className="mt-2 text-ink/70">
            Total {formatMoney(tracking.totalKobo)} · Placed {tracking.createdAt.toLocaleDateString("en-NG", {
              timeZone: "Africa/Lagos",
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </p>
        </header>

        <section aria-labelledby="status-heading">
          <h2 id="status-heading" className="text-sm font-semibold tracking-wide text-ink/60 uppercase">
            Status
          </h2>
          <div className="mt-4 flex items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                tracking.status === "paid"
                  ? "bg-brand/10 text-brand"
                  : tracking.status === "in_production"
                  ? "bg-amber/10 text-amber/90"
                  : tracking.status === "shipped"
                  ? "bg-blue/10 text-blue/90"
                  : tracking.status === "completed"
                  ? "bg-green/10 text-green/90"
                  : tracking.status === "refunded"
                  ? "bg-green/10 text-green/90"
                  : tracking.status === "refund_failed"
                  ? "bg-amber/10 text-amber/90"
                  : tracking.status === "refund_pending"
                  ? "bg-amber/10 text-amber/90"
                  : "bg-ink/5 text-ink/60"
              }`}
            >
              {tracking.status.replace(/_/g, " ")}
            </span>
            {tracking.paymentStatus && tracking.paymentStatus !== tracking.status && (
              <span className="rounded-full px-3 py-1 text-xs font-medium border border-ink/10 text-ink/60">
                Payment: {tracking.paymentStatus}
              </span>
            )}
          </div>
          {tracking.refundStatus && (
            <p className="mt-3 text-sm text-ink/60">
              Refund:{tracking.refundStatus === "succeeded" ? " Succeeded" : tracking.refundStatus === "failed" ? " Failed" : " Pending"}
              {tracking.refundReason ? ` · ${tracking.refundReason}` : ""}
            </p>
          )}
        </section>

        <section aria-labelledby="history-heading">
          <h2 id="history-heading" className="text-sm font-semibold tracking-wide text-ink/60 uppercase">
            Your orders
          </h2>
          <p className="mt-1 text-ink/60">Signed in as {user.email}</p>
        </section>
      </div>
    </main>
  );
}

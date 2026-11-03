import PrinterDashboardShell from "@/components/printer-dashboard-shell";
import { requireDashboardAccess, requireOwnerOrPlatformAdmin } from "@/lib/printer-dashboard";
import { db } from "@/lib/db/client";
import { shopMembership, user } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export default async function TeamPage() {
  const ctx = await requireDashboardAccess();
  requireOwnerOrPlatformAdmin(ctx.roleContext);

  const isOwner =
    ctx.roleContext.roles.includes("printer_owner") ||
    ctx.roleContext.roles.includes("platform_admin");

  const memberships = await db
    .select({
      membershipId: shopMembership.id,
      role: shopMembership.role,
      status: shopMembership.status,
      userId: shopMembership.userId,
      userName: user.name,
      userEmail: user.email,
    })
    .from(shopMembership)
    .innerJoin(user, eq(user.id, shopMembership.userId))
    .where(eq(shopMembership.shopId, ctx.membership.shopId))
    .orderBy(shopMembership.createdAt);

  return (
    <PrinterDashboardShell
      activePage="team"
      isOwner={isOwner}
      isPlatformAdmin={ctx.roleContext.roles.includes("platform_admin")}
    >
      <div className="max-w-4xl">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="mt-1 text-ink/60">
            Shop members and invitations. Owner only.
          </p>
        </header>

        <section className="rounded-lg border border-ink/10 bg-surface p-4">
          <h2 className="text-sm font-semibold tracking-wide text-ink/60 uppercase mb-3">
            Members
          </h2>
          {memberships.length === 0 ? (
            <p className="text-ink/60">No members yet.</p>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-ink/10 text-xs font-semibold text-ink/50 uppercase">
                  <th className="pb-3 text-ink">Name</th>
                  <th className="pb-3 text-ink">Email</th>
                  <th className="pb-3 text-ink">Role</th>
                  <th className="pb-3 text-ink">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10">
                {memberships.map((m) => (
                  <tr key={m.membershipId} className="text-sm">
                    <td className="py-3 text-ink font-medium">{m.userName ?? "—"}</td>
                    <td className="py-3 text-ink/70">{m.userEmail}</td>
                    <td className="py-3 text-ink/60">{m.role}</td>
                    <td className="py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        m.status === "active"
                          ? "bg-brand/10 text-brand"
                          : "bg-amber/10 text-amber/90"
                      }`}>
                        {m.status}
                      </span>
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

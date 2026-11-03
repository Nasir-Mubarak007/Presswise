import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { gatePrinterExperience } from "@/lib/printer-gate";
import { getAuthenticatedUser, resolveRoleContext } from "@/lib/auth/role-resolver";
import { getActiveMembership } from "@/lib/services/printer-service";
import { logger } from "@/lib/log/logger";

export type DashboardContext = {
  user: { id: string; email: string; name: string | null };
  membership: {
    membershipId: string;
    shopId: string;
    userId: string;
    role: "owner" | "manager" | "staff";
    status: string;
  };
  roleContext: Awaited<ReturnType<typeof resolveRoleContext>>;
};

export async function requireDashboardAccess(): Promise<DashboardContext> {
  const gate = gatePrinterExperience();
  if (!gate.ok) {
    logger.warn("printer.dashboard_gate_off", { event: "printer.dashboard_gate_off" });
    redirect("/sign-in");
  }

  const user = await getAuthenticatedUser(await headers());
  if (!user) {
    redirect("/sign-in?next=/printer");
  }

  const roleContext = await resolveRoleContext(user.id);

  const isPrinter =
    roleContext.roles.includes("printer_owner") || roleContext.roles.includes("printer_staff");
  if (!isPrinter) {
    redirect("/printer/onboarding");
  }

  const shopId = roleContext.activeShopId;
  if (!shopId) {
    redirect("/printer/onboarding");
  }

  const membership = await getActiveMembership(shopId, user.id);
  if (!membership || membership.status !== "active") {
    redirect("/printer/onboarding");
  }

  return {
    user: { id: user.id, email: user.email, name: user.name },
    membership,
    roleContext,
  };
}

export function requireOwnerOrPlatformAdmin(roleContext: { roles: string[] }): never {
  const isOwner = roleContext.roles.includes("printer_owner");
  const isPlatformAdmin = roleContext.roles.includes("platform_admin");
  if (!isOwner && !isPlatformAdmin) {
    logger.warn("printer.dashboard_owner_required", { event: "printer.dashboard_owner_required" });
    redirect("/printer");
  }
  // unreachable but satisfies TS
  throw new Error("unreachable");
}

export function requirePlatformAdmin(roleContext: { roles: string[] }): never {
  if (!roleContext.roles.includes("platform_admin")) {
    logger.warn("printer.dashboard_platform_admin_required", { event: "printer.dashboard_platform_admin_required" });
    redirect("/printer");
  }
  throw new Error("unreachable");
}

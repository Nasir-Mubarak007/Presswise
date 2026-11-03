import { auth } from "@/lib/auth/auth";
import { db } from "@/lib/db/client";
import { eq, and } from "drizzle-orm";
import { member, shopMembership, customerProfile, userRoles } from "@/lib/db/schema";

export type Role = "customer" | "printer_owner" | "printer_staff" | "platform_admin";

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string | null;
  emailVerified: boolean;
};

export type RoleContext = {
  roles: Role[];
  activeShopId: string | null;
  activeOrganizationId: string | null;
  isCustomer: boolean;
  isPrinter: boolean;
  isPlatformAdmin: boolean;
};

export async function getAuthenticatedUser(headers: Headers): Promise<AuthenticatedUser | null> {
  const result = await auth.api.getSession({ headers });
  if (!result) return null;

  return {
    id: result.user.id,
    email: result.user.email,
    name: result.user.name,
    emailVerified: result.user.emailVerified,
  };
}

export async function resolveRoleContext(userId: string): Promise<RoleContext> {
  const memberships = await db
    .select()
    .from(shopMembership)
    .where(and(eq(shopMembership.userId, userId), eq(shopMembership.status, "active")));

  const roles: Role[] = [];
  let activeShopId: string | null = null;
  let activeOrganizationId: string | null = null;

  for (const m of memberships) {
    if (m.role === "owner") {
      if (!roles.includes("printer_owner")) roles.push("printer_owner");
      activeShopId = m.shopId;
    } else if (m.role === "manager" || m.role === "staff") {
      if (!roles.includes("printer_staff")) roles.push("printer_staff");
      if (!activeShopId) activeShopId = m.shopId;
    }
  }

  // Check user_roles table for explicit roles
  const explicitRoles = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
  for (const er of explicitRoles) {
    if (er.role === "platform_admin" && !roles.includes("platform_admin")) {
      roles.push("platform_admin");
    }
    if (er.role === "printer_owner" && !roles.includes("printer_owner")) {
      roles.push("printer_owner");
    }
    if (er.role === "printer_staff" && !roles.includes("printer_staff")) {
      roles.push("printer_staff");
    }
    if (er.role === "customer" && !roles.includes("customer")) {
      roles.push("customer");
    }
  }

  const profile = await db
    .select()
    .from(customerProfile)
    .where(eq(customerProfile.userId, userId))
    .limit(1);

  if (profile[0] && !roles.includes("customer")) {
    roles.push("customer");
  }

  const orgMembers = await db.select().from(member).where(eq(member.userId, userId));

  for (const om of orgMembers) {
    if (om.role === "admin" || om.role === "owner") {
      activeOrganizationId = om.organizationId;
    }
  }

  const isCustomer = roles.includes("customer");
  const isPrinter = roles.includes("printer_owner") || roles.includes("printer_staff");
  const isPlatformAdmin = roles.includes("platform_admin");

  return {
    roles,
    activeShopId,
    activeOrganizationId,
    isCustomer,
    isPrinter,
    isPlatformAdmin,
  };
}

export async function ensureCustomerProfile(userId: string): Promise<void> {
  const existing = await db.select().from(customerProfile).where(eq(customerProfile.userId, userId)).limit(1);
  if (!existing[0]) {
    await db.insert(customerProfile).values({ userId });
  }
}

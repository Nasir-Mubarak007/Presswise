"use server";

import { headers } from "next/headers";
import { gatePrinterExperience } from "@/lib/printer-gate";
import { getAuthenticatedUser, resolveRoleContext } from "@/lib/auth/role-resolver";
import {
  assignOrder,
  fulfillOrderTransition,
  requestRefund,
  checkRefundStatus,
  retryRefund,
} from "@/lib/services/printer-service";

type ActionResult = { ok: true } | { ok: false; code: string; message: string };

async function requireShopMember(): Promise<{ shopId: string; userId: string; role: string } | null> {
  const gate = gatePrinterExperience();
  if (!gate.ok) return null;

  const user = await getAuthenticatedUser(await headers());
  if (!user) return null;

  const roleContext = await resolveRoleContext(user.id);
  const isPrinter =
    roleContext.roles.includes("printer_owner") || roleContext.roles.includes("printer_staff");
  if (!isPrinter || !roleContext.activeShopId) return null;

  return { shopId: roleContext.activeShopId, userId: user.id, role: roleContext.roles.includes("printer_owner") ? "owner" : "printer_staff" };
}

export async function assignOrderAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireShopMember();
  if (!ctx) {
    return { ok: false, code: "auth.not_authenticated", message: "Sign in to assign orders." };
  }

  const orderId = String(formData.get("orderId") || "");
  const staffMembershipId = String(formData.get("staffMembershipId") || "");
  if (!orderId || !staffMembershipId) {
    return { ok: false, code: "order.invalid_input", message: "Order and staff member are required." };
  }

  const result = await assignOrder({
    shopId: ctx.shopId,
    actorUserId: ctx.userId,
    orderId,
    staffMembershipId,
  });
  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message };
  }
  return { ok: true };
}

export async function fulfillOrderAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireShopMember();
  if (!ctx) {
    return { ok: false, code: "auth.not_authenticated", message: "Sign in to update orders." };
  }

  const orderId = String(formData.get("orderId") || "");
  const toStatus = String(formData.get("toStatus") || "");
  const trackingNumber = String(formData.get("trackingNumber") || "") || undefined;
  if (!orderId || !toStatus) {
    return { ok: false, code: "order.invalid_input", message: "Order and status are required." };
  }

  const result = await fulfillOrderTransition({
    shopId: ctx.shopId,
    actorUserId: ctx.userId,
    orderId,
    toStatus: toStatus as "in_production" | "shipped" | "completed",
    trackingNumber,
  });
  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message };
  }
  return { ok: true };
}

export async function requestRefundAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireShopMember();
  if (!ctx) {
    return { ok: false, code: "auth.not_authenticated", message: "Sign in to request refunds." };
  }

  const orderId = String(formData.get("orderId") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!orderId || !reason) {
    return { ok: false, code: "order.invalid_input", message: "Order and reason are required." };
  }

  const result = await requestRefund({
    shopId: ctx.shopId,
    actorUserId: ctx.userId,
    orderId,
    reason,
  });
  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message };
  }
  return { ok: true };
}

export async function checkRefundAction(formData: FormData): Promise<ActionResult & { status?: string; providerStatus?: string | null }> {
  const ctx = await requireShopMember();
  if (!ctx) {
    return { ok: false, code: "auth.not_authenticated", message: "Sign in to check refunds." };
  }

  const orderId = String(formData.get("orderId") || "");
  if (!orderId) {
    return { ok: false, code: "order.invalid_input", message: "Order is required." };
  }

  const result = await checkRefundStatus({
    shopId: ctx.shopId,
    actorUserId: ctx.userId,
    orderId,
  });
  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message };
  }
  return { ok: true, status: result.status, providerStatus: result.providerStatus };
}

export async function retryRefundAction(formData: FormData): Promise<ActionResult> {
  const ctx = await requireShopMember();
  if (!ctx) {
    return { ok: false, code: "auth.not_authenticated", message: "Sign in to retry refunds." };
  }

  const orderId = String(formData.get("orderId") || "");
  if (!orderId) {
    return { ok: false, code: "order.invalid_input", message: "Order is required." };
  }

  const result = await retryRefund({
    shopId: ctx.shopId,
    actorUserId: ctx.userId,
    orderId,
  });
  if (!result.ok) {
    return { ok: false, code: result.code, message: result.message };
  }
  return { ok: true };
}

import { db } from "@/lib/db/client";
import { auditEvent } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export type AuditAction =
  | "shop.create"
  | "shop.member.invite"
  | "shop.member.remove"
  | "shop.member.role_change"
  | "role.change"
  | "payment.refund"
  | "payment.payout_update"
  | "account.sensitive_change";

export async function recordAuditEvent(input: {
  actorUserId: string | null;
  targetType: string;
  targetId: string;
  action: AuditAction;
  details?: Record<string, unknown>;
  requestId?: string | null;
}) {
  try {
    await db.insert(auditEvent).values({
      id: uuidv4(),
      actorUserId: input.actorUserId,
      targetType: input.targetType,
      targetId: input.targetId,
      action: input.action,
      detailsJson: input.details ?? null,
      requestId: input.requestId ?? null,
    });
  } catch (err) {
    // Audit failure must not break the caller's flow, but should be visible.
    console.error(JSON.stringify({ level: "error", event: "audit.record_failed", error: String(err) }));
  }
}

export async function listAuditEvents(targetType: string, targetId: string) {
  const rows = await db
    .select()
    .from(auditEvent)
    .where(and(eq(auditEvent.targetType, targetType), eq(auditEvent.targetId, targetId)))
    .orderBy(auditEvent.createdAt);

  return rows;
}
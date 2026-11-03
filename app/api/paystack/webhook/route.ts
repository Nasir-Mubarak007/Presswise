import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { gatePrinterExperience } from "@/lib/printer-gate";
import { completeRefund } from "@/lib/services/printer-service";
import { verifyWebhookSignature, parsePaystackWebhook } from "@/lib/paystack";
import { logger } from "@/lib/log/logger";
import { db } from "@/lib/db/client";
import { refunds, refundAttempts, orders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: Request) {
  const gate = gatePrinterExperience();
  if (!gate.ok) {
    return new NextResponse("not found", { status: 404 });
  }

  const rawBody = await request.text();
  const headersList = await headers();
  const signature = headersList.get("x-paystack-signature");

  if (!verifyWebhookSignature(rawBody, signature)) {
    logger.warn("paystack.webhook_invalid_signature", { event: "paystack.webhook_invalid_signature" });
    return new NextResponse("unauthorized", { status: 401 });
  }

  const event = parsePaystackWebhook(rawBody);
  if (!event) {
    return new NextResponse("bad request", { status: 400 });
  }

  const { event: eventName, data } = event;

  if (
    eventName === "refund.processed" ||
    eventName === "refund.failed" ||
    eventName === "refund.pending" ||
    eventName === "refund.processing"
  ) {
    const reference = data?.reference || data?.id;
    if (!reference) {
      return new NextResponse("accepted", { status: 200 });
    }

    const [attempt] = await db
      .select()
      .from(refundAttempts)
      .where(eq(refundAttempts.paystackReference, reference))
      .limit(1);

    if (!attempt) {
      return new NextResponse("accepted", { status: 200 });
    }

    const [refundRow] = await db.select().from(refunds).where(eq(refunds.id, attempt.refundId)).limit(1);
    if (!refundRow) {
      return new NextResponse("accepted", { status: 200 });
    }

    const [order] = await db.select().from(orders).where(eq(orders.id, refundRow.orderId)).limit(1);
    if (!order) {
      return new NextResponse("accepted", { status: 200 });
    }

    const status =
      eventName === "refund.processed"
        ? "succeeded"
        : eventName === "refund.failed"
          ? "failed"
          : null;

    if (status) {
      try {
        await completeRefund({
          orderId: refundRow.orderId,
          refundStatus: status,
          paystackReference: reference,
          actorUserId: null,
        });
      } catch (error) {
        logger.error("paystack.webhook_complete_failed", {
          event: "paystack.webhook_complete_failed",
          error: String(error),
        });
      }
    }
  }

  return new NextResponse("accepted", { status: 200 });
}

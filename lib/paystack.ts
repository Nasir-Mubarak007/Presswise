import { createHmac, timingSafeEqual } from "crypto";

const SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const BASE_URL = "https://api.paystack.co";

export function isPaystackConfigured(): boolean {
  return Boolean(SECRET_KEY);
}

export type PaystackRefundData = {
  id: string;
  reference: string;
  status: string;
  amount: number;
  currency: string;
  transaction: string;
  gateway_response?: string;
};

export async function createRefund(input: {
  transaction: string;
  amount?: number;
}): Promise<{ ok: true; data: PaystackRefundData } | { ok: false; error: string }> {
  if (!SECRET_KEY) {
    return { ok: false, error: "paystack_not_configured" };
  }

  const body = JSON.stringify({
    transaction: input.transaction,
    ...(input.amount ? { amount: input.amount } : {}),
  });

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/refund`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SECRET_KEY}`,
        "Content-Type": "application/json",
      },
      body,
    });
  } catch (error) {
    return { ok: false, error: `paystack_request_failed: ${String(error)}` };
  }

  const json = (await res.json().catch(() => ({}))) as { message?: string; data?: PaystackRefundData };
  if (!res.ok || !json.data) {
    return { ok: false, error: json.message ?? `paystack error ${res.status}` };
  }
  return { ok: true, data: json.data };
}

export async function fetchRefund(refundReference: string): Promise<{ ok: true; data: PaystackRefundData } | { ok: false; error: string }> {
  if (!SECRET_KEY) {
    return { ok: false, error: "paystack_not_configured" };
  }

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/refund/${encodeURIComponent(refundReference)}`, {
      headers: { Authorization: `Bearer ${SECRET_KEY}` },
    });
  } catch (error) {
    return { ok: false, error: `paystack_request_failed: ${String(error)}` };
  }

  const json = (await res.json().catch(() => ({}))) as { message?: string; data?: PaystackRefundData };
  if (!res.ok || !json.data) {
    return { ok: false, error: json.message ?? `paystack error ${res.status}` };
  }
  return { ok: true, data: json.data };
}

export function verifyWebhookSignature(rawBody: string | Buffer, signature: string | null): boolean {
  if (!SECRET_KEY || !signature) return false;

  try {
    const hmac = createHmac("sha512", SECRET_KEY);
    hmac.update(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8"));
    const digest = hmac.digest("hex");
    const a = Buffer.from(digest, "utf8");
    const b = Buffer.from(signature, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export type PaystackWebhookEvent = {
  event: string;
  data: { id?: string; reference?: string; status?: string; amount?: number; currency?: string };
};

export function parsePaystackWebhook(rawBody: string | Buffer): PaystackWebhookEvent | null {
  try {
    return JSON.parse(typeof rawBody === "string" ? rawBody : rawBody.toString("utf8")) as PaystackWebhookEvent;
  } catch {
    return null;
  }
}

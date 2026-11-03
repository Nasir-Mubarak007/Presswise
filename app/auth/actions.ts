"use server";

import { auth } from "@/lib/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { recordAuditEvent } from "@/lib/services/audit-service";
import { ensureCustomerProfile } from "@/lib/auth/role-resolver";
import { logger } from "@/lib/log/logger";

export type ActionError = { code: string; message: string };

export async function signInAction(formData: FormData): Promise<{ ok: true } | ActionError> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { code: "auth.invalid_input", message: "Email and password are required." };
  }

  try {
    await auth.api.signInEmail({
      body: { email, password },
      headers: await headers(),
    });
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign in failed.";
    logger.warn("auth.sign_in_failed", { event: "auth.sign_in_failed", email });
    return { code: "auth.sign_in_failed", message };
  }
}

export async function signUpAction(formData: FormData): Promise<{ ok: true } | ActionError> {
  const name = String(formData.get("name") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!name || !email || !password) {
    return { code: "auth.invalid_input", message: "Name, email, and password are required." };
  }
  if (password.length < 8) {
    return { code: "auth.weak_password", message: "Password must be at least 8 characters." };
  }

  try {
    const result = await auth.api.signUpEmail({
      body: { name, email, password },
      headers: await headers(),
    });

    const userId = (result as { user?: { id?: string } } | null)?.user?.id;
    if (userId) {
      await ensureCustomerProfile(userId);
      await recordAuditEvent({
        actorUserId: userId,
        targetType: "user",
        targetId: userId,
        action: "account.sensitive_change",
        details: { event: "signup", email },
      });
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign up failed.";
    logger.warn("auth.sign_up_failed", { event: "auth.sign_up_failed", email });
    return { code: "auth.sign_up_failed", message };
  }
}

export async function signOutAction(): Promise<void> {
  await auth.api.signOut({
    headers: await headers(),
  });
  redirect("/sign-in");
}
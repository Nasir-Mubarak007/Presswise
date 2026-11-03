import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { organization } from "better-auth/plugins/organization";
import { db } from "@/lib/db/client";
import { logger } from "@/lib/log/logger";

function authSecret(): string {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) {
    logger.error("config.missing", { event: "config.missing", message: "Missing required env var: BETTER_AUTH_SECRET" });
    throw new Error("Missing required env var: BETTER_AUTH_SECRET");
  }
  return value;
}

export const auth = betterAuth({
  advanced: {
    database: {
      generateId: "uuid",
    },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  secret: authSecret(),
  baseURL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    sendResetPassword: async ({ user, url, token }) => {
      logger.info("auth.password_reset_queued", { event: "auth.password_reset_queued", email: user.email });
      // Resend integration lands in a later slice; for now log only.
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      logger.info("auth.email_verification_queued", { event: "auth.email_verification_queued", email: user.email });
      // Resend integration lands in a later slice; for now log only.
    },
    expiresIn: 60 * 60 * 24,
  },
  plugins: [
    organization({
      allowUserToCreateOrganization: true,
      organizationLimit: 5,
      membershipLimit: 100,
      creatorRole: "owner",
      invitationExpiresIn: 60 * 60 * 24 * 7,
      sendInvitationEmail: async (data) => {
        logger.info("auth.invitation_queued", {
          event: "auth.invitation_queued",
          email: data.email,
          organization: data.organization.name,
        });
        // Resend integration lands in a later slice; for now log only.
      },
    }),
    // Must be the last plugin so cookies are set correctly on server actions.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
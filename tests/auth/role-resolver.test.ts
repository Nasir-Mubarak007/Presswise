import { beforeEach, describe, expect, it, vi } from "vitest";

const { getSession } = vi.hoisted(() => ({
  getSession: vi.fn(),
}));

vi.mock("@/lib/auth/auth", () => ({
  auth: { api: { getSession } },
}));

vi.mock("@/lib/db/client", () => ({
  db: {},
}));

import { auth } from "@/lib/auth/auth";
import { getAuthenticatedUser } from "@/lib/auth/role-resolver";

describe("getAuthenticatedUser", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses Better Auth to verify the signed session cookie", async () => {
    const headers = new Headers({
      cookie: "better-auth.session_token=signed-session-cookie",
    });
    getSession.mockResolvedValue({
      user: {
        id: "user-id",
        email: "printer@example.com",
        name: "Printer Owner",
        emailVerified: false,
      },
    });

    await expect(getAuthenticatedUser(headers)).resolves.toEqual({
      id: "user-id",
      email: "printer@example.com",
      name: "Printer Owner",
      emailVerified: false,
    });
    expect(auth.api.getSession).toHaveBeenCalledWith({ headers });
  });

  it("returns null when Better Auth finds no valid session", async () => {
    getSession.mockResolvedValue(null);

    await expect(getAuthenticatedUser(new Headers())).resolves.toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { getAuthRedirectPath } from "@/lib/auth/redirects";

describe("getAuthRedirectPath", () => {
  it("allows known in app destinations", () => {
    expect(getAuthRedirectPath("/printer")).toBe("/printer");
    expect(getAuthRedirectPath("/printer/onboarding")).toBe("/printer/onboarding");
  });

  it("uses the fallback for unknown and external destinations", () => {
    expect(getAuthRedirectPath(undefined)).toBe("/me");
    expect(getAuthRedirectPath("//example.com")).toBe("/me");
    expect(getAuthRedirectPath("https://example.com")).toBe("/me");
    expect(getAuthRedirectPath("/admin")).toBe("/me");
  });

  it("uses only the first value when the destination is repeated", () => {
    expect(getAuthRedirectPath(["/printer", "https://example.com"])).toBe("/printer");
  });
});

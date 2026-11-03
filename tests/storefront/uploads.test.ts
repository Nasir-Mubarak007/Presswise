import { describe, expect, it } from "vitest";
import { validateImageFile } from "@/lib/storefront/uploads";

describe("storefront image validation", () => {
  it("accepts supported full resolution image files", () => {
    expect(validateImageFile({ type: "image/png", size: 1024 }, 1200, 900)).toEqual({
      ok: true,
      warning: null,
    });
  });

  it("rejects unsupported image types and files over the size limit", () => {
    expect(validateImageFile({ type: "image/heic", size: 1024 }, 1200, 900)).toMatchObject({
      ok: false,
    });
    expect(
      validateImageFile({ type: "image/jpeg", size: 2.5 * 1024 * 1024 + 1 }, 1200, 900),
    ).toMatchObject({ ok: false });
  });

  it("rejects images below 200 pixels and warns below 600 pixels", () => {
    expect(validateImageFile({ type: "image/webp", size: 1024 }, 199, 600)).toMatchObject({
      ok: false,
    });
    expect(validateImageFile({ type: "image/webp", size: 1024 }, 500, 700)).toMatchObject({
      ok: true,
      warning: expect.stringContaining("under 600 pixels"),
    });
  });
});

import { describe, expect, it } from "vitest";
import { err, isErr, isOk, ok } from "@/lib/domain/result";
import type { AppError, Result } from "@/lib/domain/result";

const notFound: AppError = {
  code: "order.not_found",
  message: "We could not find that order.",
};

describe("ok", () => {
  it("wraps a value in a successful result", () => {
    expect(ok(42)).toEqual({ ok: true, data: 42 });
  });

  it("treats falsy payloads as data, never as a failure", () => {
    for (const value of [0, "", false, null, undefined]) {
      const result = ok(value);

      expect(result.ok).toBe(true);
      expect(isOk(result)).toBe(true);
    }
  });

  it("returns a fresh object so two callers cannot share one result", () => {
    expect(ok({ id: "o_1" })).not.toBe(ok({ id: "o_1" }));
  });
});

describe("err", () => {
  it("wraps an error in a failed result", () => {
    expect(err(notFound)).toEqual({ ok: false, error: notFound });
  });

  it("keeps the field messages a form needs to show", () => {
    const invalid: AppError = {
      code: "checkout.invalid",
      message: "Check the order details.",
      fields: { phone: "Enter a phone number.", address: "Enter a delivery address." },
    };

    expect(err(invalid)).toEqual({ ok: false, error: invalid });
  });

  it("accepts an error shape other than AppError", () => {
    const result = err<string>("boom");

    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

describe("isOk", () => {
  it("narrows a successful result and exposes its data", () => {
    const result: Result<number> = ok(7);

    if (!isOk(result)) throw new Error("expected a successful result");
    expect(result.data).toBe(7);
  });

  it("returns false for a failed result", () => {
    expect(isOk(err(notFound))).toBe(false);
  });
});

describe("isErr", () => {
  it("narrows a failed result and exposes its error", () => {
    const result: Result<number> = err(notFound);

    if (!isErr(result)) throw new Error("expected a failed result");
    expect(result.error).toEqual(notFound);
  });

  it("returns false for a successful result", () => {
    expect(isErr(ok(1))).toBe(false);
  });
});

describe("isOk and isErr together", () => {
  it("always disagree, so a caller never sees both or neither", () => {
    const results: Result<string>[] = [ok("saved"), err(notFound)];

    for (const result of results) {
      expect(isOk(result)).toBe(!isErr(result));
    }
  });
});

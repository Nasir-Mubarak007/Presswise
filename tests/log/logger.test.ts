import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MockInstance } from "vitest";
import { logger } from "@/lib/log/logger";

type ConsoleSpy = MockInstance<(...data: unknown[]) => void>;

/** Every line the logger wrote through the given console method, already parsed. */
function lines(spy: ConsoleSpy) {
  return spy.mock.calls.map((call) => JSON.parse(String(call[0])) as Record<string, unknown>);
}

describe("logger", () => {
  let out: ConsoleSpy;
  let failed: ConsoleSpy;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-27T10:00:00.000Z"));
    out = vi.spyOn(console, "log").mockImplementation(() => {});
    failed = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("writes one JSON line carrying the time, the level and the event", () => {
    logger.info("order.created");

    expect(lines(out)).toEqual([
      {
        time: "2026-10-27T10:00:00.000Z",
        level: "info",
        event: "order.created",
      },
    ]);
  });

  it("puts the caller's fields on the same line", () => {
    logger.info("order.created", { orderId: "o_1", total: 2500 });

    expect(lines(out)[0]).toMatchObject({ orderId: "o_1", total: 2500 });
  });

  it("keeps the structured keys when the caller passes none", () => {
    logger.info("app.booted");

    const [line] = lines(out);
    expect(Object.keys(line).sort()).toEqual(["event", "level", "time"]);
  });

  it("sends debug and info lines through the standard output", () => {
    logger.debug("cache.hit");
    logger.info("app.booted");

    expect(out).toHaveBeenCalledTimes(2);
    expect(failed).not.toHaveBeenCalled();
  });

  it("sends warn and error lines through the error output", () => {
    logger.warn("payment.slow");
    logger.error("payment.failed");

    expect(failed).toHaveBeenCalledTimes(2);
    expect(out).not.toHaveBeenCalled();
  });

  it("tags warn and error lines with their own level", () => {
    logger.warn("payment.slow");
    logger.error("payment.failed");

    expect(lines(failed).map((line) => line.level)).toEqual(["warn", "error"]);
  });

  it("drops debug lines in production so they never reach the logs", () => {
    vi.stubEnv("NODE_ENV", "production");

    logger.debug("cache.hit");

    expect(out).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it("still writes info, warn and error lines in production", () => {
    vi.stubEnv("NODE_ENV", "production");

    logger.info("app.booted");
    logger.warn("payment.slow");

    expect(out).toHaveBeenCalledTimes(1);
    expect(failed).toHaveBeenCalledTimes(1);
  });

  it("keeps debug lines outside production", () => {
    vi.stubEnv("NODE_ENV", "development");

    logger.debug("cache.hit");

    expect(lines(out)).toHaveLength(1);
  });

  it("binds the request id to every line of one request", () => {
    const request = logger.withRequest("req_123");

    request.info("checkout.started");
    request.error("checkout.failed", { reason: "card_declined" });

    expect(lines(out)[0]).toMatchObject({ requestId: "req_123" });
    expect(lines(failed)[0]).toMatchObject({ requestId: "req_123", reason: "card_declined" });
  });

  it("leaves lines written outside a request without a request id", () => {
    logger.info("app.booted");

    expect(lines(out)[0]).not.toHaveProperty("requestId");
  });

  it("gives each request its own id", () => {
    logger.withRequest("req_a").info("page.view");
    logger.withRequest("req_b").info("page.view");

    expect(lines(out).map((line) => line.requestId)).toEqual(["req_a", "req_b"]);
  });

  it("does not let one request's fields leak into the next", () => {
    const request = logger.withRequest("req_123");

    request.info("order.created", { orderId: "o_1" });
    request.info("order.created");

    expect(lines(out)[1]).not.toHaveProperty("orderId");
  });
});

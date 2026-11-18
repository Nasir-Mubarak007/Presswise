import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { err, ok, type Result } from "@/lib/domain/result";
import { logger } from "@/lib/log/logger";

type RateLimitError = {
  code: "upload.rate_limited" | "upload.rate_limiter_unavailable";
  message: string;
};

let limiter: Ratelimit | undefined;

function getLimiter(): Ratelimit {
  if (limiter) return limiter;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    logger.error("printer_asset.rate_limit_config_missing", {
      event: "printer_asset.rate_limit_config_missing",
    });
    throw new Error("Missing Upstash upload rate limit configuration.");
  }

  limiter = new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(30, "1 h"),
    prefix: "printer-asset-intents",
  });
  return limiter;
}

export async function checkPrinterAssetIntentLimit(
  userId: string,
): Promise<Result<{ remaining: number; reset: number }, RateLimitError>> {
  try {
    const result = await getLimiter().limit(userId);
    if (!result.success) {
      return err({
        code: "upload.rate_limited",
        message: "You have reached the hourly photo upload limit. Try again later.",
      });
    }
    return ok({ remaining: result.remaining, reset: result.reset });
  } catch (error) {
    logger.error("printer_asset.rate_limit_unavailable", {
      event: "printer_asset.rate_limit_unavailable",
      error: error instanceof Error ? error.name : "UnknownError",
    });
    return err({
      code: "upload.rate_limiter_unavailable",
      message: "Photo uploads are temporarily unavailable. Try again later.",
    });
  }
}

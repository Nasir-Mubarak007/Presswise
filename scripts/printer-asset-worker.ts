import { UnrecoverableError, Worker, Queue } from "bullmq";
import IORedis from "ioredis";
import {
  ASSET_JOB_ATTEMPTS,
  PRINTER_ASSET_QUEUE_NAME,
  type PrinterAssetJob,
} from "@/lib/jobs/printer-assets";
import { closeDb } from "@/lib/db/client";
import { logger } from "@/lib/log/logger";
import {
  cleanupExpiredProductPhotoIntents,
  markProductPhotoIntentFailed,
  PermanentAssetError,
  processProductPhotoIntent,
} from "@/lib/services/printer-asset-service";
import {
  markPublicationTransitionFailed,
  PermanentPublicationError,
  processProductPublicationTransition,
  processShopPublicationTransition,
  StorageUnavailableError,
} from "@/lib/services/printer-publication-service";

const redisUrl = process.env.BULLMQ_REDIS_URL;
if (!redisUrl) {
  throw new Error("Missing required env var: BULLMQ_REDIS_URL");
}

const connection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});
const scheduler = new Queue<PrinterAssetJob>(PRINTER_ASSET_QUEUE_NAME, {
  connection,
});

const worker = new Worker<PrinterAssetJob>(
  PRINTER_ASSET_QUEUE_NAME,
  async (job) => {
    if (job.data.type === "process-upload") {
      try {
        await processProductPhotoIntent(job.data.intentId);
      } catch (error) {
        if (error instanceof PermanentAssetError) {
          await markProductPhotoIntentFailed(job.data.intentId, error.failureCode);
          throw new UnrecoverableError(error.failureCode);
        }
        throw error;
      }
      return;
    }

    if (job.data.type === "cleanup-expired-intents") {
      await cleanupExpiredProductPhotoIntents();
      return;
    }

    if (job.data.type === "publish-product") {
      try {
        await processProductPublicationTransition(job.data.transitionId);
      } catch (error) {
        if (error instanceof PermanentPublicationError) {
          await markPublicationTransitionFailed(
            job.data.transitionId,
            error.failureCode,
          );
          throw new UnrecoverableError(error.failureCode);
        }
        throw error;
      }
      return;
    }

    if (job.data.type === "publish-shop") {
      try {
        await processShopPublicationTransition(job.data.transitionId);
      } catch (error) {
        if (error instanceof PermanentPublicationError) {
          await markPublicationTransitionFailed(
            job.data.transitionId,
            error.failureCode,
          );
          throw new UnrecoverableError(error.failureCode);
        }
        throw error;
      }
      return;
    }

    throw new UnrecoverableError("Unsupported printer asset job.");
  },
  {
    connection,
    concurrency: 2,
  },
);
let cleanupTimer: NodeJS.Timeout | undefined;

worker.on("error", (error) => {
  logger.error("printer_asset.worker_error", {
    event: "printer_asset.worker_error",
    error: error.name,
  });
});

worker.on("failed", (job, error) => {
  if (!job || job.attemptsMade < ASSET_JOB_ATTEMPTS) return;

  if (job.data.type === "process-upload") {
    const intentId = job.data.intentId;
    void markProductPhotoIntentFailed(intentId, "PROCESSING_FAILED").catch(
      (failure) => {
        logger.error("printer_asset.failure_record_failed", {
          event: "printer_asset.failure_record_failed",
          intentId,
          error: failure instanceof Error ? failure.name : "UnknownError",
        });
      },
    );
    logger.error("printer_asset.processing_exhausted", {
      event: "printer_asset.processing_exhausted",
      intentId,
      error: error.name,
    });
    return;
  }

  if (job.data.type === "publish-product" || job.data.type === "publish-shop") {
    const transitionId = job.data.transitionId;
    const failureCode =
      error instanceof StorageUnavailableError
        ? "STORAGE_UNAVAILABLE"
        : "PROCESSING_FAILED";
    void markPublicationTransitionFailed(transitionId, failureCode).catch(
      (failure) => {
        logger.error("printer_publication.failure_record_failed", {
          event: "printer_publication.failure_record_failed",
          transitionId,
          error: failure instanceof Error ? failure.name : "UnknownError",
        });
      },
    );
    logger.error("printer_publication.processing_exhausted", {
      event: "printer_publication.processing_exhausted",
      transitionId,
      error: error.name,
    });
  }
});

worker.on("stalled", (jobId) => {
  logger.warn("printer_asset.job_stalled", {
    event: "printer_asset.job_stalled",
    jobId,
  });
});

async function shutdown(): Promise<void> {
  if (cleanupTimer) clearInterval(cleanupTimer);
  await Promise.all([worker.close(), scheduler.close()]);
  await connection.quit();
  await closeDb();
}

process.once("SIGTERM", () => {
  void shutdown().catch((error) => {
    logger.error("printer_asset.worker_shutdown_failed", {
      event: "printer_asset.worker_shutdown_failed",
      error: error instanceof Error ? error.name : "UnknownError",
    });
    process.exitCode = 1;
  });
});

process.once("SIGINT", () => {
  void shutdown().catch((error) => {
    logger.error("printer_asset.worker_shutdown_failed", {
      event: "printer_asset.worker_shutdown_failed",
      error: error instanceof Error ? error.name : "UnknownError",
    });
    process.exitCode = 1;
  });
});

async function start(): Promise<void> {
  const enqueueCleanup = async () => {
    await scheduler.add(
      "cleanup-expired-intents",
      { type: "cleanup-expired-intents" },
      {
        jobId: `cleanup-${Math.floor(Date.now() / (15 * 60 * 1000))}`,
      },
    );
  };
  await enqueueCleanup();
  cleanupTimer = setInterval(() => {
    void enqueueCleanup().catch((error) => {
      logger.error("printer_asset.cleanup_enqueue_failed", {
        event: "printer_asset.cleanup_enqueue_failed",
        error: error instanceof Error ? error.name : "UnknownError",
      });
    });
  }, 15 * 60 * 1000);
  cleanupTimer.unref();
  await worker.waitUntilReady();
  logger.info("printer_asset.worker_started", {
    event: "printer_asset.worker_started",
    concurrency: 2,
  });
}

void start().catch(async (error) => {
  logger.error("printer_asset.worker_start_failed", {
    event: "printer_asset.worker_start_failed",
    error: error instanceof Error ? error.name : "UnknownError",
  });
  process.exitCode = 1;
  await shutdown();
});

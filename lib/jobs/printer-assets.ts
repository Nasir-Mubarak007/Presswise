import { Queue } from "bullmq";
import IORedis from "ioredis";

export const PRINTER_ASSET_QUEUE_NAME = "printer-assets";
export const ASSET_JOB_ATTEMPTS = 4;
export const ASSET_RETRY_DELAY_MS = 30_000;

export type PrinterAssetJob =
  | { type: "process-upload"; intentId: string }
  | { type: "cleanup-expired-intents" }
  | { type: "publish-product"; transitionId: string }
  | { type: "publish-shop"; transitionId: string };

let connection: IORedis | undefined;
let queue: Queue<PrinterAssetJob> | undefined;

function getQueue(): Queue<PrinterAssetJob> {
  if (queue) return queue;

  const url = process.env.BULLMQ_REDIS_URL;
  if (!url) {
    throw new Error("Missing required env var: BULLMQ_REDIS_URL");
  }

  connection = new IORedis(url, {
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
  });
  queue = new Queue<PrinterAssetJob>(PRINTER_ASSET_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: ASSET_JOB_ATTEMPTS,
      backoff: {
        type: "exponential",
        delay: ASSET_RETRY_DELAY_MS,
      },
      removeOnComplete: { count: 1000 },
      removeOnFail: { count: 5000 },
    },
  });
  return queue;
}

export async function enqueueAssetProcessing(intentId: string): Promise<void> {
  await getQueue().add(
    "process-upload",
    { type: "process-upload", intentId },
    { jobId: `upload-${intentId}` },
  );
}

export async function enqueueExpiredIntentCleanup(): Promise<void> {
  await getQueue().add(
    "cleanup-expired-intents",
    { type: "cleanup-expired-intents" },
    {
      jobId: `cleanup-${Math.floor(Date.now() / (15 * 60 * 1000))}`,
    },
  );
}

export async function enqueueProductPublication(
  transitionId: string,
  retryCount: number,
): Promise<void> {
  await getQueue().add(
    "publish-product",
    { type: "publish-product", transitionId },
    {
      jobId: `publish-product-${transitionId}-${retryCount}`,
      attempts: ASSET_JOB_ATTEMPTS,
      backoff: { type: "exponential", delay: ASSET_RETRY_DELAY_MS },
    },
  );
}

export async function enqueueShopPublication(
  transitionId: string,
  retryCount: number,
): Promise<void> {
  await getQueue().add(
    "publish-shop",
    { type: "publish-shop", transitionId },
    {
      jobId: `publish-shop-${transitionId}-${retryCount}`,
      attempts: ASSET_JOB_ATTEMPTS,
      backoff: { type: "exponential", delay: ASSET_RETRY_DELAY_MS },
    },
  );
}

export async function closePrinterAssetQueue(): Promise<void> {
  if (!queue) return;
  await queue.close();
  await connection?.quit();
  queue = undefined;
  connection = undefined;
}

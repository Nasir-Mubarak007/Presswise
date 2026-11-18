import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "@/lib/log/logger";

type StorageConfig = {
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  region: string;
  endpoint: string;
  publicUrl: string | null;
};

type StorageInstance = {
  client: S3Client;
  config: StorageConfig;
};

let instance: StorageInstance | undefined;

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    logger.error("storage.config_missing", { event: "storage.config_missing", missing: [name] });
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getPublicBaseUrl(): string | null {
  const publicUrl = process.env.BACKBLAZE_B2_PUBLIC_URL;
  if (!publicUrl) return null;
  const parsed = new URL(publicUrl.replace(/\/+$/, ""));
  if (parsed.protocol !== "https:") {
    throw new Error("BACKBLAZE_B2_PUBLIC_URL must use HTTPS.");
  }
  return parsed.href;
}

function getStorage(): StorageInstance {
  if (instance) return instance;

  const config: StorageConfig = {
    accessKeyId: required("BACKBLAZE_B2_KEY_ID"),
    secretAccessKey: required("BACKBLAZE_B2_APPLICATION_KEY"),
    bucket: required("BACKBLAZE_B2_BUCKET"),
    region: required("BACKBLAZE_B2_REGION"),
    endpoint: required("BACKBLAZE_B2_ENDPOINT"),
    publicUrl: getPublicBaseUrl(),
  };

  instance = {
    config,
    client: new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    }),
  };
  return instance;
}

export async function createPrivateUploadUrl(input: {
  key: string;
  contentType: string;
  contentLength: number;
}): Promise<string> {
  const { client, config } = getStorage();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    }),
    { expiresIn: 15 * 60 },
  );
}

export async function createPrivateReadUrl(key: string): Promise<string> {
  const { client, config } = getStorage();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: 5 * 60 },
  );
}

export async function inspectPrivateObject(key: string): Promise<{
  contentLength: number;
  contentType: string | null;
} | null> {
  const { client, config } = getStorage();
  try {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: config.bucket, Key: key }),
    );
    if (typeof result.ContentLength !== "number") {
      throw new Error("Uploaded object has no content length.");
    }
    return {
      contentLength: result.ContentLength,
      contentType: result.ContentType ?? null,
    };
  } catch (error) {
    if (error instanceof NoSuchKey) return null;
    throw error;
  }
}

export async function readPrivateObject(key: string): Promise<Uint8Array> {
  const { client, config } = getStorage();
  const result = await client.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  if (!result.Body) throw new Error("Uploaded object has no body.");
  return result.Body.transformToByteArray();
}

export async function copyPrivateObject(input: {
  sourceKey: string;
  destinationKey: string;
  contentType: string;
}): Promise<void> {
  const { client, config } = getStorage();
  const source = `${config.bucket}/${input.sourceKey}`
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  await client.send(
    new CopyObjectCommand({
      Bucket: config.bucket,
      Key: input.destinationKey,
      CopySource: source,
      ContentType: input.contentType,
      MetadataDirective: "REPLACE",
    }),
  );
}

export async function putPublicObject(input: {
  key: string;
  body: Uint8Array;
  contentType: string;
}): Promise<void> {
  const { client, config } = getStorage();
  await client.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: "public, max-age=300",
    }),
  );
}

export async function deletePrivateObject(key: string): Promise<void> {
  const { client, config } = getStorage();
  await client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  );
}

export async function deletePublicObject(key: string): Promise<void> {
  const { client, config } = getStorage();
  await client.send(
    new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
  );
}

export function getPublicObjectUrl(key: string): string | undefined {
  const publicUrl = getPublicBaseUrl();
  if (!publicUrl) return undefined;
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${publicUrl}/${encodedKey}`;
}

export function getStorageBucketName(): string {
  const { config } = getStorage();
  return config.bucket;
}

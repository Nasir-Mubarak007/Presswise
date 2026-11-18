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

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  privateBucket: string;
  publicBucket: string;
  publicUrl: string;
};

type R2Instance = {
  client: S3Client;
  config: R2Config;
};

let instance: R2Instance | undefined;

function required(name: keyof NodeJS.ProcessEnv): string {
  const value = process.env[name];
  if (!value) {
    logger.error("r2.config_missing", { event: "r2.config_missing", missing: [name] });
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getPublicBaseUrl(): string {
  const publicUrl = required("R2_PUBLIC_URL").replace(/\/+$/, "");
  const parsed = new URL(publicUrl);
  if (parsed.protocol !== "https:") {
    throw new Error("R2_PUBLIC_URL must use HTTPS.");
  }
  return publicUrl;
}

function getR2(): R2Instance {
  if (instance) return instance;

  const config: R2Config = {
    accountId: required("R2_ACCOUNT_ID"),
    accessKeyId: required("R2_ACCESS_KEY_ID"),
    secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    privateBucket: required("R2_PRIVATE_BUCKET"),
    publicBucket: required("R2_PUBLIC_BUCKET"),
    publicUrl: getPublicBaseUrl(),
  };
  instance = {
    config,
    client: new S3Client({
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      region: "auto",
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
  const { client, config } = getR2();
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: config.privateBucket,
      Key: input.key,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    }),
    { expiresIn: 15 * 60 },
  );
}

export async function createPrivateReadUrl(key: string): Promise<string> {
  const { client, config } = getR2();
  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: config.privateBucket, Key: key }),
    { expiresIn: 5 * 60 },
  );
}

export async function inspectPrivateObject(key: string): Promise<{
  contentLength: number;
  contentType: string | null;
} | null> {
  const { client, config } = getR2();
  try {
    const result = await client.send(
      new HeadObjectCommand({ Bucket: config.privateBucket, Key: key }),
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
  const { client, config } = getR2();
  const result = await client.send(
    new GetObjectCommand({ Bucket: config.privateBucket, Key: key }),
  );
  if (!result.Body) throw new Error("Uploaded object has no body.");
  return result.Body.transformToByteArray();
}

export async function copyPrivateObject(input: {
  sourceKey: string;
  destinationKey: string;
  contentType: string;
}): Promise<void> {
  const { client, config } = getR2();
  const source = `${config.privateBucket}/${input.sourceKey}`
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  await client.send(
    new CopyObjectCommand({
      Bucket: config.privateBucket,
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
  const { client, config } = getR2();
  await client.send(
    new PutObjectCommand({
      Bucket: config.publicBucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      CacheControl: "public, max-age=300",
    }),
  );
}

export async function deletePrivateObject(key: string): Promise<void> {
  const { client, config } = getR2();
  await client.send(
    new DeleteObjectCommand({ Bucket: config.privateBucket, Key: key }),
  );
}

export async function deletePublicObject(key: string): Promise<void> {
  const { client, config } = getR2();
  await client.send(
    new DeleteObjectCommand({ Bucket: config.publicBucket, Key: key }),
  );
}

export function getPublicObjectUrl(key: string): string {
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  return `${getPublicBaseUrl()}/${encodedKey}`;
}

export function getR2BucketNames(): {
  privateBucket: string;
  publicBucket: string;
} {
  const { config } = getR2();
  return {
    privateBucket: config.privateBucket,
    publicBucket: config.publicBucket,
  };
}

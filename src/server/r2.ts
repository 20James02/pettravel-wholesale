import "server-only";

import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getRequiredEnv, requireEnv } from "@/server/env";

const allowedContentTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

export interface PresignUploadInput {
  orderId: string;
  fileName: string;
  contentType: string;
  purpose: "payment-proof" | "invoice" | "product-image";
}

function sanitizePathPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export async function createR2UploadUrl(input: PresignUploadInput) {
  requireEnv(["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]);

  if (!allowedContentTypes.has(input.contentType)) {
    throw new Error("Unsupported file type.");
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${getRequiredEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getRequiredEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: getRequiredEnv("R2_SECRET_ACCESS_KEY")
    }
  });

  const key = [
    input.purpose,
    sanitizePathPart(input.orderId),
    `${Date.now()}-${sanitizePathPart(input.fileName)}`
  ].join("/");

  const command = new PutObjectCommand({
    Bucket: getRequiredEnv("R2_BUCKET"),
    Key: key,
    ContentType: input.contentType,
    Metadata: {
      orderId: input.orderId,
      purpose: input.purpose
    }
  });

  const uploadUrl = await getSignedUrl(client, command, { expiresIn: 300 });
  return {
    key,
    uploadUrl,
    expiresInSeconds: 300
  };
}

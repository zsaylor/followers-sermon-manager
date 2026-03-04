import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Sermon, SermonsData } from "./types";

export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const BUCKET = process.env.R2_BUCKET_NAME!;
export const PUBLIC_URL = process.env.R2_PUBLIC_URL!;

export async function getSermons(): Promise<Sermon[]> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: "sermons.json",
    });
    const response = await r2.send(command);
    const body = await response.Body?.transformToString();
    if (!body) return [];
    const data: SermonsData = JSON.parse(body);
    return data.sermons || [];
  } catch (error: any) {
    if (error.name === "NoSuchKey") {
      return [];
    }
    throw error;
  }
}

export async function putSermons(sermons: Sermon[]): Promise<void> {
  const data: SermonsData = { sermons };
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: "sermons.json",
    Body: JSON.stringify(data, null, 2),
    ContentType: "application/json",
  });
  await r2.send(command);
}

export async function uploadAudio(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
  });
  await r2.send(command);
}

export async function deleteAudio(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  await r2.send(command);
}

export async function getPodcastMeta(): Promise<any> {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: "podcastMeta.json",
    });
    const response = await r2.send(command);
    const body = await response.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body);
  } catch (error: any) {
    if (error.name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

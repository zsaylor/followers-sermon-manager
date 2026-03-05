import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomUUID } from "crypto";
import { authenticateRequest } from "../lib/auth";
import { createPresignedUploadUrl, PUBLIC_URL } from "../lib/r2";
import { safeError, safeLog } from "../lib/logger";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function parseJsonBody(req: VercelRequest): any {
  const body: any = (req as any).body;
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return null;
    }
  }
  return body;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  safeLog("UPLOAD_URL", "Handler started");

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = authenticateRequest(req);
  if (!auth.ok) {
    if (auth.status === 429) {
      if (auth.retryAfterSeconds) {
        res.setHeader("Retry-After", String(auth.retryAfterSeconds));
      }
      return res.status(429).json({ error: auth.error });
    }
    return res.status(401).json({ error: auth.error });
  }

  try {
    const body = parseJsonBody(req);
    if (!body) {
      return res.status(400).json({ error: "Invalid JSON body" });
    }

    const {
      title,
      description,
      speaker,
      date,
      durationSeconds,
      contentType,
      fileSize,
    } = body;

    const required = [
      ["title", title],
      ["description", description],
      ["speaker", speaker],
      ["date", date],
      ["durationSeconds", durationSeconds],
      ["contentType", contentType],
      ["fileSize", fileSize],
    ] as const;

    for (const [name, value] of required) {
      if (value === undefined || value === null || value === "") {
        return res
          .status(400)
          .json({ error: `Missing required field: ${name}` });
      }
    }

    if (typeof title !== "string" || typeof description !== "string") {
      return res.status(400).json({ error: "Invalid title/description" });
    }

    if (typeof speaker !== "string" || typeof date !== "string") {
      return res.status(400).json({ error: "Invalid speaker/date" });
    }

    const duration = Number(durationSeconds);
    if (!Number.isFinite(duration) || duration <= 0) {
      return res.status(400).json({ error: "Invalid durationSeconds" });
    }

    const size = Number(fileSize);
    if (!Number.isFinite(size) || size <= 0) {
      return res.status(400).json({ error: "Invalid fileSize" });
    }

    if (typeof contentType !== "string" || !contentType.startsWith("audio/")) {
      return res.status(400).json({ error: "File must be an audio file" });
    }

    const MAX_FILE_SIZE = 200 * 1024 * 1024;
    if (size > MAX_FILE_SIZE) {
      return res.status(400).json({ error: "File size exceeds 200MB limit" });
    }

    const id = randomUUID();
    const slug = slugify(title);
    const key = `sermons/${date}-${slug}-${id}.mp3`;
    safeLog("UPLOAD_URL", "Generated key:", key);

    const uploadUrl = await createPresignedUploadUrl(key, contentType);
    const audioUrl = `${PUBLIC_URL}/${key}`;

    return res.status(200).json({
      id,
      key,
      uploadUrl,
      audioUrl,
    });
  } catch (err: any) {
    safeError("UPLOAD_URL", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err?.message || String(err),
    });
  }
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticatePassword, setSessionCookie } from "../lib/auth";

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
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = parseJsonBody(req);
  const password = typeof body?.password === "string" ? body.password : "";

  const result = authenticatePassword(req, password);
  if (!result.ok) {
    if (result.status === 429) {
      if (result.retryAfterSeconds) {
        res.setHeader("Retry-After", String(result.retryAfterSeconds));
      }
      return res.status(429).json({ error: result.error });
    }
    return res.status(401).json({ error: result.error });
  }

  setSessionCookie(req, res);
  return res.status(200).json({ ok: true });
}

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { authenticateRequest } from "../lib/auth";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = authenticateRequest(req);
  if (!auth.ok) {
    if (auth.status === 429) {
      if (auth.retryAfterSeconds) {
        res.setHeader("Retry-After", String(auth.retryAfterSeconds));
      }
      return res.status(429).json({ ok: false, error: auth.error });
    }
    return res.status(200).json({ ok: false });
  }

  return res.status(200).json({ ok: true });
}

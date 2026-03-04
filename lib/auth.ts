import type { VercelRequest } from "@vercel/node";

export function authenticate(req: VercelRequest): boolean {
  const authHeader = req.headers.authorization;
  if (!authHeader) return false;

  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return false;

  const token = parts[1];
  return token === process.env.ADMIN_PASSWORD;
}

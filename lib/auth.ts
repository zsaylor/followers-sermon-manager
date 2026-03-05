import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";

type AuthOk = { ok: true };
type AuthFail = {
  ok: false;
  status: 401 | 429;
  error: string;
  retryAfterSeconds?: number;
};

export type AuthResult = AuthOk | AuthFail;

const COOKIE_NAME = "sm_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_FAILURES = 10;
const failuresByIp = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: VercelRequest): string {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.trim()) {
    return xff.split(",")[0].trim();
  }
  const socket = (req as any).socket;
  const ra = socket?.remoteAddress;
  return typeof ra === "string" && ra ? ra : "unknown";
}

function noteAuthFailure(req: VercelRequest): AuthFail {
  const ip = getClientIp(req);
  const now = Date.now();

  // Best-effort cleanup to avoid unbounded growth.
  if (failuresByIp.size > 2000) {
    for (const [key, value] of failuresByIp) {
      if (value.resetAt <= now) failuresByIp.delete(key);
    }
  }

  const existing = failuresByIp.get(ip);
  if (!existing || existing.resetAt <= now) {
    failuresByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  existing.count += 1;
  if (existing.count > RATE_LIMIT_MAX_FAILURES) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((existing.resetAt - now) / 1000),
    );
    return {
      ok: false,
      status: 429,
      error: "Too many failed authentication attempts",
      retryAfterSeconds,
    };
  }

  return { ok: false, status: 401, error: "Unauthorized" };
}

function clearAuthFailures(req: VercelRequest) {
  failuresByIp.delete(getClientIp(req));
}

function base64UrlEncode(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(s: string): Buffer | null {
  const normalized = s.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (normalized.length % 4)) % 4;
  const padded = normalized + "=".repeat(padLen);
  try {
    return Buffer.from(padded, "base64");
  } catch {
    return null;
  }
}

function sha256(data: string): Buffer {
  return createHash("sha256").update(data, "utf8").digest();
}

function safeStringEqual(a: string, b: string): boolean {
  // Hash before compare so timingSafeEqual always receives equal-length buffers.
  const ah = sha256(a);
  const bh = sha256(b);
  return timingSafeEqual(ah, bh);
}

function getSigningSecret(): string {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "";
}

function signBytes(data: string): Buffer {
  const secret = getSigningSecret();
  return createHmac("sha256", secret).update(data, "utf8").digest();
}

function parseCookies(req: VercelRequest): Record<string, string> {
  const header = req.headers.cookie;
  if (!header) return {};
  const cookieStr = Array.isArray(header) ? header.join(";") : header;
  const out: Record<string, string> = {};

  for (const part of cookieStr.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }

  return out;
}

function createSessionToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    n: base64UrlEncode(randomBytes(16)),
  };

  const payloadB64u = base64UrlEncode(Buffer.from(JSON.stringify(payload)));
  const sigB64u = base64UrlEncode(signBytes(payloadB64u));
  return `${payloadB64u}.${sigB64u}`;
}

function verifySessionToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64u, sigB64u] = parts;
  const payloadBuf = base64UrlDecode(payloadB64u);
  if (!payloadBuf) return false;
  const sigBuf = base64UrlDecode(sigB64u);
  if (!sigBuf) return false;

  // Signature is over the base64url payload.
  const expectedSig = signBytes(payloadB64u);
  if (expectedSig.length !== sigBuf.length) return false;
  if (!timingSafeEqual(expectedSig, sigBuf)) return false;

  try {
    const payload = JSON.parse(payloadBuf.toString("utf8")) as {
      v: number;
      iat: number;
      exp: number;
    };
    if (payload.v !== 1) return false;
    if (!Number.isFinite(payload.exp)) return false;
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return false;
    return true;
  } catch {
    return false;
  }
}

function extractBearerToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0] !== "Bearer") return null;
  return parts[1] || null;
}

export function authenticateRequest(req: VercelRequest): AuthResult {
  const secret = process.env.ADMIN_PASSWORD || "";
  if (!secret) {
    // Misconfiguration - fail closed.
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const cookies = parseCookies(req);
  const session = cookies[COOKIE_NAME];
  if (session) {
    if (verifySessionToken(session)) return { ok: true };
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const bearer = extractBearerToken(req);
  if (bearer) {
    if (safeStringEqual(bearer, secret)) {
      clearAuthFailures(req);
      return { ok: true };
    }
    return noteAuthFailure(req);
  }

  return { ok: false, status: 401, error: "Unauthorized" };
}

export function authenticatePassword(
  req: VercelRequest,
  password: string,
): AuthResult {
  const secret = process.env.ADMIN_PASSWORD || "";
  if (!secret) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  if (safeStringEqual(password, secret)) {
    clearAuthFailures(req);
    return { ok: true };
  }
  return noteAuthFailure(req);
}

function isHttps(req: VercelRequest): boolean {
  const proto = req.headers["x-forwarded-proto"];
  if (typeof proto === "string") return proto === "https";
  return process.env.NODE_ENV === "production";
}

export function setSessionCookie(req: VercelRequest, res: VercelResponse) {
  const token = createSessionToken();
  const secure = isHttps(req) ? "; Secure" : "";
  const cookie =
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict` +
    `${secure}; Max-Age=${SESSION_TTL_SECONDS}`;
  res.setHeader("Set-Cookie", cookie);
}

export function clearSessionCookie(req: VercelRequest, res: VercelResponse) {
  const secure = isHttps(req) ? "; Secure" : "";
  const cookie =
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict` +
    `${secure}; Max-Age=0`;
  res.setHeader("Set-Cookie", cookie);
}

// Backwards-compatible boolean helper for existing callers.
export function authenticate(req: VercelRequest): boolean {
  return authenticateRequest(req).ok;
}

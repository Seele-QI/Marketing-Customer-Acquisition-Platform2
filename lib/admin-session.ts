import crypto from "node:crypto"

import { getAdminAccessKey } from "@/lib/server-env"

const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const BLOCK_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5

type AttemptRow = { ts: number; ok: boolean }

/** 仅记录登录失败次数；session 本身为无状态 HMAC 签名 cookie，不依赖进程内 Map。 */
const attempts = new Map<string, AttemptRow[]>()

export function clientIp(req: Request): string {
  const forwarded = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim()
  const realIp = (req.headers.get("x-real-ip") || "").trim()
  return forwarded || realIp || "127.0.0.1"
}

export function timingSafeEq(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

export function recordAdminLoginAttempt(ip: string, ok: boolean): void {
  const now = Date.now()
  const list = (attempts.get(ip) || []).filter((a) => now - a.ts < BLOCK_WINDOW_MS)
  list.push({ ts: now, ok })
  attempts.set(ip, list)
}

export function isAdminLoginBlocked(ip: string): boolean {
  const now = Date.now()
  const failures = (attempts.get(ip) || []).filter((a) => !a.ok && now - a.ts < BLOCK_WINDOW_MS)
  return failures.length >= MAX_FAILURES
}

function signingSecret(): string {
  return getAdminAccessKey()
}

/** 签发无状态 admin_session（payload.exp + HMAC），跨 Route Handler 实例可验证。 */
export function issueAdminSession(opts: { ip: string; ttlMs?: number }): string {
  const secret = signingSecret()
  if (!secret) {
    throw new Error("CREDIT_ADMIN_ACCESS_KEY is not configured")
  }
  const exp = Date.now() + (opts.ttlMs ?? SESSION_TTL_MS)
  const payloadB64 = Buffer.from(
    JSON.stringify({ exp, ip: opts.ip }),
    "utf8",
  ).toString("base64url")
  const sig = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url")
  return `${payloadB64}.${sig}`
}

export function verifyAdminSession(token: string | undefined | null): boolean {
  if (!token) return false
  const secret = signingSecret()
  if (!secret) return false

  const dot = token.lastIndexOf(".")
  if (dot <= 0) return false
  const payloadB64 = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!payloadB64 || !sig) return false

  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payloadB64)
    .digest("base64url")
  if (!timingSafeEq(sig, expectedSig)) return false

  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf8"),
    ) as { exp?: number }
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) return false
    return true
  } catch {
    return false
  }
}

/** 无状态 session：登出由客户端清除 cookie 即可。 */
export function revokeAdminSession(_token: string | undefined | null): void {
  // no-op
}

export function readAdminSessionCookie(req: Request): string {
  const raw = req.headers.get("cookie") || ""
  for (const chunk of raw.split(";")) {
    const [name, ...rest] = chunk.trim().split("=")
    if (name === "admin_session") return rest.join("=").trim()
  }
  return ""
}

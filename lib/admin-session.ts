import crypto from "node:crypto"

const SESSION_TTL_MS = 12 * 60 * 60 * 1000
const BLOCK_WINDOW_MS = 15 * 60 * 1000
const MAX_FAILURES = 5

type SessionRow = { ip: string; expires: number }
type AttemptRow = { ts: number; ok: boolean }

const sessions = new Map<string, SessionRow>()
const attempts = new Map<string, AttemptRow[]>()

export function clientIp(req: Request): string {
  return (
    (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    ""
  )
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

export function issueAdminSession(opts: { ip: string; ttlMs?: number }): string {
  const token = crypto.randomBytes(32).toString("base64url")
  sessions.set(token, {
    ip: opts.ip,
    expires: Date.now() + (opts.ttlMs ?? SESSION_TTL_MS),
  })
  return token
}

export function verifyAdminSession(token: string | undefined | null): boolean {
  if (!token) return false
  const row = sessions.get(token)
  if (!row) return false
  if (row.expires < Date.now()) {
    sessions.delete(token)
    return false
  }
  return true
}

export function revokeAdminSession(token: string | undefined | null): void {
  if (token) sessions.delete(token)
}

export function readAdminSessionCookie(req: Request): string {
  const raw = req.headers.get("cookie") || ""
  for (const chunk of raw.split(";")) {
    const [name, ...rest] = chunk.trim().split("=")
    if (name === "admin_session") return rest.join("=").trim()
  }
  return ""
}

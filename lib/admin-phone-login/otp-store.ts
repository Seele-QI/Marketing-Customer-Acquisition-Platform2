import crypto from "node:crypto"

const CODE_TTL_MS = 5 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000
const MAX_VERIFY_ATTEMPTS = 5

type OtpRow = {
  codeHash: string
  expiresAt: number
  sentAt: number
  attempts: number
}

/** 进程内 OTP 存储（管理后台低频；与 admin-session attempts 同模式）。 */
const store = new Map<string, OtpRow>()

function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code, "utf8").digest("hex")
}

export function generateOtpCode(): string {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0")
}

export function getResendCooldownMs(): number {
  return RESEND_COOLDOWN_MS
}

export function canResend(phone: string, now = Date.now()): { ok: true } | { ok: false; waitSec: number } {
  const row = store.get(phone)
  if (!row) return { ok: true }
  const elapsed = now - row.sentAt
  if (elapsed >= RESEND_COOLDOWN_MS) return { ok: true }
  return { ok: false, waitSec: Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000) }
}

export function saveOtp(phone: string, code: string, now = Date.now()): void {
  store.set(phone, {
    codeHash: hashCode(code),
    expiresAt: now + CODE_TTL_MS,
    sentAt: now,
    attempts: 0,
  })
}

export type ConsumeOtpResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "expired" | "mismatch" | "locked" }

export function consumeOtp(phone: string, code: string, now = Date.now()): ConsumeOtpResult {
  const row = store.get(phone)
  if (!row) return { ok: false, reason: "missing" }
  if (row.expiresAt < now) {
    store.delete(phone)
    return { ok: false, reason: "expired" }
  }
  if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
    store.delete(phone)
    return { ok: false, reason: "locked" }
  }

  const digest = hashCode(code.trim())
  let match = false
  try {
    match = crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(row.codeHash, "hex"))
  } catch {
    match = false
  }

  if (!match) {
    row.attempts += 1
    if (row.attempts >= MAX_VERIFY_ATTEMPTS) {
      store.delete(phone)
      return { ok: false, reason: "locked" }
    }
    store.set(phone, row)
    return { ok: false, reason: "mismatch" }
  }

  store.delete(phone)
  return { ok: true }
}

/** 仅测试用：清空 OTP 状态。 */
export function __resetOtpStoreForTests(): void {
  store.clear()
}

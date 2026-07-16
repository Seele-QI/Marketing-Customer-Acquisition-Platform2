import { readServerEnv } from "@/lib/server-env"

/** 仅保留数字；大陆号去掉前导 +86 / 86。 */
export function normalizePhone(raw: string): string {
  let digits = String(raw || "").replace(/\D/g, "")
  if (digits.startsWith("86") && digits.length === 13) {
    digits = digits.slice(2)
  }
  return digits
}

export function isValidCnMobile(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(normalizePhone(phone))
}

export function maskPhone(phone: string): string {
  const p = normalizePhone(phone)
  if (p.length < 7) return "***"
  return `${p.slice(0, 3)}****${p.slice(-4)}`
}

/**
 * 允许登录的管理员手机号：
 * 优先 ADMIN_PHONE；否则当 ADMIN_LOGIN_NAME 为合法手机号时复用。
 */
export function getConfiguredAdminPhone(): string {
  const explicit = normalizePhone(readServerEnv("ADMIN_PHONE"))
  if (isValidCnMobile(explicit)) return explicit
  const loginName = normalizePhone(readServerEnv("ADMIN_LOGIN_NAME") || "18000634365")
  return isValidCnMobile(loginName) ? loginName : ""
}

export function isAdminPhone(phone: string): boolean {
  const expected = getConfiguredAdminPhone()
  if (!expected) return false
  return normalizePhone(phone) === expected
}

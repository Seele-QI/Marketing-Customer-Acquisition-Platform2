/**
 * 管理员账号密码校验（与 lib/auth.py hash_password / verify_password 一致）。
 */
import crypto from "node:crypto"

import { readServerEnv } from "@/lib/server-env"

const ITERATIONS = 210_000
const KEYLEN = 32
const DIGEST = "sha256"

function normalizeLoginName(loginName: string): string {
  return loginName.trim().toLowerCase().replace(/\s+/g, "")
}

function hashPassword(password: string, salt: string): string {
  return crypto.pbkdf2Sync(password, salt, ITERATIONS, KEYLEN, DIGEST).toString("hex")
}

export function verifyAdminCredentials(loginName: string, password: string): boolean {
  const expectedName = readServerEnv("ADMIN_LOGIN_NAME") || "18000634365"
  const passwordHash = readServerEnv("ADMIN_PASSWORD_HASH")
  const passwordSalt = readServerEnv("ADMIN_PASSWORD_SALT")
  if (!passwordHash || !passwordSalt) return false
  if (normalizeLoginName(loginName) !== normalizeLoginName(expectedName)) return false
  const digest = hashPassword(password, passwordSalt)
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, "hex"), Buffer.from(passwordHash, "hex"))
  } catch {
    return false
  }
}

export function isAdminCredentialsConfigured(): boolean {
  return Boolean(readServerEnv("ADMIN_PASSWORD_HASH") && readServerEnv("ADMIN_PASSWORD_SALT"))
}

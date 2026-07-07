#!/usr/bin/env node
/**
 * 生成 Zeabur 云端部署所需密钥（输出到 stdout，勿提交仓库）。
 *
 * 用法：
 *   node scripts/generate-zeabur-secrets.mjs
 *   node scripts/generate-zeabur-secrets.mjs --admin-password "YourStrongPassword"
 */

import crypto from "node:crypto"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import path from "node:path"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

function tokenHex(bytes) {
  return crypto.randomBytes(bytes).toString("hex")
}

function tokenUrlSafe(bytes) {
  return crypto.randomBytes(bytes).toString("base64url")
}

function parseArgs() {
  const args = process.argv.slice(2)
  let adminPassword = ""
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--admin-password" && args[i + 1]) {
      adminPassword = args[i + 1]
      i++
    }
  }
  return { adminPassword }
}

const { adminPassword } = parseArgs()

console.log("# Zeabur 部署密钥 — 复制到 Zeabur 控制台 Environment / Secrets")
console.log("# 生成时间:", new Date().toISOString())
console.log("")
console.log("EMAIL_HASH_SALT=" + tokenHex(32))
console.log("CREDIT_ADMIN_ACCESS_KEY=" + tokenUrlSafe(24))
console.log("")

if (adminPassword) {
  const r = spawnSync(process.execPath, [path.join(root, "scripts/hash-admin-password.mjs"), adminPassword], {
    encoding: "utf8",
    cwd: root,
  })
  if (r.status === 0) {
    console.log(r.stdout.trim())
  } else {
    console.error("管理员密码哈希失败:", r.stderr || r.stdout)
  }
} else {
  console.log("# 管理员密码哈希（请替换 YourPassword 后运行）：")
  console.log("# node scripts/hash-admin-password.mjs YourPassword")
}

console.log("")
console.log("# CENTRAL_SIGNING 密钥对（桌面激活验签）：")
console.log("# python scripts/generate-central-signing-keys.py")

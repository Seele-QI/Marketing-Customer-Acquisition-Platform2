#!/usr/bin/env node
/**
 * 生成管理员密码的 PBKDF2 哈希，写入 .env 用。
 * 用法：node scripts/hash-admin-password.mjs [password]
 * 未传参时从 stdin 读取（不回显）。
 */
import crypto from "node:crypto"
import { createInterface } from "node:readline"

const ITERATIONS = 210_000
const KEYLEN = 32
const DIGEST = "sha256"

function hashPassword(password, salt) {
  const saltValue = salt ?? crypto.randomBytes(16).toString("hex")
  const digest = crypto.pbkdf2Sync(password, saltValue, ITERATIONS, KEYLEN, DIGEST).toString("hex")
  return { hash: digest, salt: saltValue }
}

async function readPassword() {
  const rl = createInterface({ input: process.stdin, output: process.stderr })
  return new Promise((resolve) => {
    rl.question("管理员密码: ", (answer) => {
      rl.close()
      resolve(answer)
    })
  })
}

const password = process.argv[2] ?? (await readPassword())
if (!password || password.length < 8) {
  console.error("密码至少 8 位")
  process.exit(1)
}

const { hash, salt } = hashPassword(password)
console.log(`ADMIN_PASSWORD_HASH=${hash}`)
console.log(`ADMIN_PASSWORD_SALT=${salt}`)

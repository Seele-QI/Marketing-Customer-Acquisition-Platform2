#!/usr/bin/env node
/**
 * Ensure OSS bucket exists (public-read objects for electron-updater).
 * Reads OSS_* or falls back to ALIYUN_ACCESS_KEY_* from .env / .env.electron-build.local
 */
import { createHmac } from "node:crypto"
import { readFileSync, existsSync, writeFileSync } from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  const text = readFileSync(filePath, "utf8")
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (!(key in process.env) || process.env[key] === "") process.env[key] = val
  }
}

loadEnvFile(path.join(root, ".env.electron-build.local"))
loadEnvFile(path.join(root, ".env"))

const region = (process.env.OSS_REGION || "oss-cn-beijing").replace(/^https?:\/\//, "").replace(/\/+$/, "")
const bucket = (process.env.OSS_BUCKET || "mcap-desktop-releases").trim()
const accessKeyId = (
  process.env.OSS_ACCESS_KEY_ID ||
  process.env.ALIYUN_ACCESS_KEY_ID ||
  ""
).trim()
const accessKeySecret = (
  process.env.OSS_ACCESS_KEY_SECRET ||
  process.env.ALIYUN_ACCESS_KEY_SECRET ||
  ""
).trim()

if (!accessKeyId || !accessKeySecret) {
  console.error("缺少 OSS_ACCESS_KEY_ID/SECRET（或 ALIYUN_ACCESS_KEY_*）")
  process.exit(1)
}

async function listBuckets() {
  const date = new Date().toUTCString()
  const resource = "/"
  const stringToSign = `GET\n\n\n${date}\n${resource}`
  const signature = createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64")
  const r = await fetch(`https://${region}.aliyuncs.com/`, {
    headers: { Date: date, Authorization: `OSS ${accessKeyId}:${signature}` },
  })
  const text = await r.text()
  console.log(`[ensure-oss-bucket] ListBuckets → ${r.status}`)
  if (!r.ok) {
    console.warn(text.slice(0, 300).replace(/\s+/g, " "))
    throw new Error(`ListBuckets ${r.status}`)
  }
  const names = [...text.matchAll(/<Name>([^<]+)<\/Name>/g)].map((m) => m[1])
  console.log(`[ensure-oss-bucket] buckets: ${names.join(", ") || "(none)"}`)
  return names
}

async function createBucket() {
  const date = new Date().toUTCString()
  const host = `${bucket}.${region}.aliyuncs.com`
  const resource = `/${bucket}/`
  // 先不带 ACL 创建；公共读可在控制台或后续 PutBucketAcl
  const stringToSign = `PUT\n\n\n${date}\n${resource}`
  const signature = createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64")
  const r = await fetch(`https://${host}/`, {
    method: "PUT",
    headers: {
      Date: date,
      Authorization: `OSS ${accessKeyId}:${signature}`,
    },
  })
  const text = await r.text()
  console.log(`[ensure-oss-bucket] CreateBucket ${bucket} → ${r.status}`)
  if (!r.ok && r.status !== 409) {
    console.error(text.slice(0, 500))
    process.exit(1)
  }
}

function writeBuildLocalEnv() {
  const out = path.join(root, ".env.electron-build.local")
  const body = [
    "CLOUD_API_URL=https://mcap-cloud-api.preview.aliyun-zeabur.cn",
    "CENTRAL_SERVICE_URL=https://mcap-cloud-api.preview.aliyun-zeabur.cn",
    "UPDATE_FEED_URL=https://mcap-desktop-releases.oss-cn-beijing.aliyuncs.com/releases/",
    `OSS_REGION=${region}`,
    `OSS_BUCKET=${bucket}`,
    `OSS_ACCESS_KEY_ID=${accessKeyId}`,
    `OSS_ACCESS_KEY_SECRET=${accessKeySecret}`,
    "OSS_PREFIX=releases",
    "",
  ].join("\n")
  if (!existsSync(out)) {
    writeFileSync(out, body, "utf8")
    console.log(`[ensure-oss-bucket] wrote ${out} (gitignored via .env*.local)`)
  } else {
    console.log(`[ensure-oss-bucket] keep existing ${out}`)
  }
}

// RAM 子账号常无 oss:ListBuckets，跳过列举，直接 CreateBucket（已存在则 409）
try {
  await listBuckets()
} catch {
  /* ignore — SubUser 可能无 ListBuckets */
}
console.log(`[ensure-oss-bucket] ensure bucket ${bucket}…`)
await createBucket()
writeBuildLocalEnv()
console.log("[ensure-oss-bucket] OK")

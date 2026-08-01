#!/usr/bin/env node
/**
 * 将 release/ 下 Setup.exe + latest.yml (+ blockmap) 上传到阿里云 OSS。
 *
 * 环境变量（可用 .env.electron-build.local）：
 *   OSS_REGION=oss-cn-beijing
 *   OSS_BUCKET=mcap-desktop-releases
 *   OSS_ACCESS_KEY_ID=
 *   OSS_ACCESS_KEY_SECRET=
 *   OSS_PREFIX=releases
 *
 *   node scripts/upload-release-oss.mjs --dir release
 */

import { createHash, createHmac } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import * as path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { pickReleaseArtifacts } from "./lib/release-artifacts.mjs"

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

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

function requireEnv(name, fallbacks = []) {
  const candidates = [name, ...fallbacks]
  for (const key of candidates) {
    const v = (process.env[key] || "").trim()
    if (v) return v
  }
  console.error(
    `缺少环境变量 ${name}${fallbacks.length ? `（或 ${fallbacks.join(" / ")}）` : ""}（见 docs/deploy/DESKTOP-UPDATE-OSS.md）`,
  )
  process.exit(1)
}

/** OSS V1 签名 PUT；对象默认 public-read，供 electron-updater 公网拉取 */
async function ossPut({ region, bucket, accessKeyId, accessKeySecret, objectKey, body, contentType }) {
  const date = new Date().toUTCString()
  const acl = "public-read"
  const resource = `/${bucket}/${objectKey}`
  const stringToSign = `PUT\n\n${contentType}\n${date}\nx-oss-acl:${acl}\n${resource}`
  const signature = createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64")
  const host = `${bucket}.${region}.aliyuncs.com`
  const url = `https://${host}/${objectKey.split("/").map(encodeURIComponent).join("/")}`
  const r = await fetch(url, {
    method: "PUT",
    headers: {
      Date: date,
      "Content-Type": contentType,
      "x-oss-acl": acl,
      Authorization: `OSS ${accessKeyId}:${signature}`,
      "Content-Length": String(body.length),
    },
    body,
  })
  if (!r.ok) {
    const text = await r.text().catch(() => "")
    throw new Error(`PUT ${objectKey} → ${r.status} ${text.slice(0, 300)}`)
  }
  return url
}

function contentTypeFor(file) {
  if (file.endsWith(".yml") || file.endsWith(".yaml")) return "text/yaml; charset=utf-8"
  if (file.endsWith(".exe") || file.endsWith(".dmg")) return "application/octet-stream"
  if (file.endsWith(".blockmap")) return "application/octet-stream"
  return "application/octet-stream"
}

async function verifyPublicUpload(url, expectedSize, { requireRange = false } = {}) {
  const head = await fetch(url, { method: "HEAD" })
  if (!head.ok) {
    throw new Error(`上传后公网校验失败: HEAD ${url} → ${head.status}`)
  }
  const remoteSize = Number(head.headers.get("content-length") || 0)
  if (remoteSize !== expectedSize) {
    throw new Error(`上传后大小不一致: ${url} remote=${remoteSize} local=${expectedSize}`)
  }
  if (requireRange) {
    const ranged = await fetch(url, { headers: { Range: "bytes=0-0" } })
    const body = await ranged.arrayBuffer()
    if (ranged.status !== 206 || body.byteLength !== 1) {
      throw new Error(
        `更新安装包不支持 Range 下载: ${url} status=${ranged.status} bytes=${body.byteLength}`,
      )
    }
  }
}

async function main() {
  const dir = path.resolve(root, arg("dir", "release"))
  if (!existsSync(dir)) {
    console.error(`目录不存在: ${dir}`)
    process.exit(1)
  }
  const region = (process.env.OSS_REGION || "oss-cn-beijing")
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "")
  const bucket = requireEnv("OSS_BUCKET")
  const accessKeyId = requireEnv("OSS_ACCESS_KEY_ID", ["ALIYUN_ACCESS_KEY_ID"])
  const accessKeySecret = requireEnv("OSS_ACCESS_KEY_SECRET", ["ALIYUN_ACCESS_KEY_SECRET"])
  const prefix = (process.env.OSS_PREFIX || "releases").replace(/^\/+|\/+$/g, "")
  if (!process.env.OSS_REGION) {
    console.warn(`[upload-release-oss] OSS_REGION unset, defaulting to ${region}`)
  }

  const files = pickReleaseArtifacts(dir)
  console.log(`[upload-release-oss] ${files.length} file(s) → oss://${bucket}/${prefix}/`)

  for (const file of files) {
    const base = path.basename(file)
    const objectKey = `${prefix}/${base}`
    const body = readFileSync(file)
    const sha = createHash("sha256").update(body).digest("hex").slice(0, 12)
    const url = await ossPut({
      region,
      bucket,
      accessKeyId,
      accessKeySecret,
      objectKey,
      body,
      contentType: contentTypeFor(base),
    })
    if (!/\.ya?ml$/i.test(base)) {
      await verifyPublicUpload(url, body.length, {
        requireRange: /\.exe$/i.test(base),
      })
    }
    console.log(`OK ${base}  ${Math.round(body.length / 1024 / 1024)}MB  sha256=${sha}…  ${url}`)
  }
  console.log("[upload-release-oss] done")

  let pkgVersion = ""
  try {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
    pkgVersion = String(pkg.version || "").trim()
  } catch {
    /* ignore */
  }
  let ymlVersion = ""
  try {
    const ymlPath = path.join(dir, "latest.yml")
    if (existsSync(ymlPath)) {
      const m = readFileSync(ymlPath, "utf8").match(/^\s*version:\s*(\S+)/m)
      if (m) ymlVersion = m[1]
    }
  } catch {
    /* ignore */
  }
  const version = ymlVersion || pkgVersion || "(unknown)"
  const publicBase = `https://${bucket}.${region}.aliyuncs.com/${prefix}/`

  console.log("")
  console.log("── 发版后核对清单 ──")
  console.log(`1. 浏览器打开可访问: ${publicBase}latest.yml （应含 version: ${version}）`)
  console.log(`2. Zeabur api 环境变量 CENTRAL_LATEST_VERSION=${version}`)
  console.log("3. 仅重大不兼容时抬高 CENTRAL_FORCE_UPDATE_BELOW（例如设为本次版本以强制旧包升级）")
  console.log(`4. CENTRAL_UPDATE_URL 与客户端 UPDATE_FEED_URL 均指向: ${publicBase}`)
  console.log("5. 可选 CENTRAL_RELEASE_NOTES=短文本更新说明，然后 Redeploy api")
  console.log("6. 生产机：设置页 → 检查更新 → 下载 → 安装并重启")
}

const isDirectExecution =
  Boolean(process.argv[1]) &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isDirectExecution) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

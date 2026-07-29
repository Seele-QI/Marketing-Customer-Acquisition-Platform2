#!/usr/bin/env node
/**
 * 关闭桶的「阻止公共访问」，设置 public-read / 桶策略，并验收 releases/latest.yml
 */
import { createHmac } from "node:crypto"
import { readFileSync, existsSync } from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const i = t.indexOf("=")
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if (!(k in process.env) || process.env[k] === "") process.env[k] = v
  }
}

loadEnvFile(path.join(root, ".env.electron-build.local"))
loadEnvFile(path.join(root, ".env"))

const accessKeyId = (process.env.OSS_ACCESS_KEY_ID || "").trim()
const accessKeySecret = (process.env.OSS_ACCESS_KEY_SECRET || "").trim()
const bucket = (process.env.OSS_BUCKET || "mcap-desktop-releases").trim()
const region = (process.env.OSS_REGION || "oss-cn-beijing").trim()
const host = `${bucket}.${region}.aliyuncs.com`

if (!accessKeyId || !accessKeySecret) {
  console.error("缺少 OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET")
  process.exit(1)
}

async function signedFetch(method, resource, { headers = {}, body, contentType = "" } = {}) {
  const date = new Date().toUTCString()
  const ossKeys = Object.keys(headers)
    .filter((k) => k.toLowerCase().startsWith("x-oss-"))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
  let canon = ""
  for (const k of ossKeys) canon += `${k.toLowerCase()}:${headers[k]}\n`
  const stringToSign = `${method}\n\n${contentType}\n${date}\n${canon}${resource}`
  const signature = createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64")
  const pathAndQuery = resource.startsWith(`/${bucket}`)
    ? resource.slice(`/${bucket}`.length) || "/"
    : resource
  const url = `https://${host}${pathAndQuery}`
  const r = await fetch(url, {
    method,
    headers: {
      Date: date,
      Authorization: `OSS ${accessKeyId}:${signature}`,
      ...(contentType ? { "Content-Type": contentType } : {}),
      ...headers,
      ...(body != null ? { "Content-Length": String(Buffer.byteLength(body)) } : {}),
    },
    body,
  })
  const text = await r.text()
  return { status: r.status, text }
}

async function main() {
  // 1) 关闭阻止公共访问
  const blockXml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    "<PublicAccessBlockConfiguration>\n" +
    "  <BlockPublicAccess>false</BlockPublicAccess>\n" +
    "</PublicAccessBlockConfiguration>"
  {
    const r = await signedFetch("PUT", `/${bucket}/?publicAccessBlock`, {
      contentType: "application/xml",
      body: blockXml,
    })
    console.log("[oss-public] PutPublicAccessBlock →", r.status, r.text.slice(0, 200).replace(/\s+/g, " "))
  }
  {
    const r = await signedFetch("GET", `/${bucket}/?publicAccessBlock`)
    console.log("[oss-public] GetPublicAccessBlock →", r.status, r.text.replace(/\s+/g, " ").slice(0, 250))
  }

  // 2) 桶 ACL public-read
  {
    const r = await signedFetch("PUT", `/${bucket}/?acl`, {
      headers: { "x-oss-acl": "public-read" },
    })
    console.log("[oss-public] PutBucketAcl →", r.status, r.text.slice(0, 200).replace(/\s+/g, " "))
  }

  // 3) 桶策略：releases/* 匿名 GetObject
  const policy = JSON.stringify({
    Version: "1",
    Statement: [
      {
        Effect: "Allow",
        Principal: ["*"],
        Action: ["oss:GetObject"],
        Resource: [`acs:oss:*:*:${bucket}/releases/*`],
      },
    ],
  })
  {
    const r = await signedFetch("PUT", `/${bucket}/?policy`, {
      contentType: "application/json",
      body: policy,
    })
    console.log("[oss-public] PutBucketPolicy →", r.status, r.text.slice(0, 200).replace(/\s+/g, " "))
  }

  // 4) 对象 ACL
  const objects = [
    "releases/latest.yml",
    "releases/招财猫-Setup-1.3.5.exe",
    "releases/招财猫-Setup-1.3.5.exe.blockmap",
    "releases/招财猫-Setup-0.1.3.exe",
    "releases/招财猫-Setup-0.1.3.exe.blockmap",
    "releases/招财猫-Setup-0.1.2.exe",
    "releases/招财猫-Setup-0.1.2.exe.blockmap",
    "releases/招财猫-Setup-0.1.1.exe",
    "releases/招财猫-Setup-0.1.1.exe.blockmap",
    "releases/招财猫-Setup-0.1.0.exe",
    "releases/招财猫-Setup-0.1.0.exe.blockmap",
  ]
  for (const objectKey of objects) {
    const r = await signedFetch("PUT", `/${bucket}/${objectKey}?acl`, {
      headers: { "x-oss-object-acl": "public-read" },
    })
    // 老对象可能已删除，404/NoSuchKey 忽略
    console.log(`[oss-public] PutObjectAcl ${objectKey} →`, r.status, r.text.slice(0, 120).replace(/\s+/g, " "))
  }

  // 5) 匿名验收
  const feedUrl = `https://${host}/releases/latest.yml`
  const fr = await fetch(feedUrl)
  const body = await fr.text()
  console.log(`[oss-public] GET ${feedUrl} →`, fr.status)
  console.log(body.slice(0, 300))
  if (!fr.ok || !/version:\s*1\.3\.5/.test(body)) process.exit(1)
  console.log("[oss-public] OK")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

#!/usr/bin/env node
/**
 * 北京迁机 / 域名切换验收
 *
 *   node scripts/verify-beijing-cutover.mjs --phase prod
 *   node scripts/verify-beijing-cutover.mjs --phase prod --resolve-ip 39.96.6.183
 *
 * --resolve-ip：本机 DNS 污染时强制 *.preview.aliyun-zeabur.cn 走指定 IPv4（via curl --resolve）。
 */

import { spawnSync } from "node:child_process"
import { URL } from "node:url"

const PROD_API = "https://mcap-cloud-api.preview.aliyun-zeabur.cn"
const PROD_WEB = "https://mcap-cloud-web.preview.aliyun-zeabur.cn"

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

const RESOLVE_IP = arg("resolve-ip", "").trim()
if (RESOLVE_IP) {
  console.log(`[dns] force *.preview.aliyun-zeabur.cn -> ${RESOLVE_IP}`)
}

function curlFetch(url, { follow = false } = {}) {
  const u = new URL(url)
  const args = ["-sS", "--connect-timeout", "12", "--max-time", "25", "-D", "-", "-o", "-"]
  if (!follow) args.push("--max-redirs", "0")
  if (RESOLVE_IP && u.hostname.endsWith(".preview.aliyun-zeabur.cn")) {
    args.push("--resolve", `${u.hostname}:443:${RESOLVE_IP}`)
  }
  args.push(url)
  const r = spawnSync("curl.exe", args, { encoding: "utf8", maxBuffer: 4 * 1024 * 1024 })
  if (r.error) throw r.error
  const out = `${r.stdout || ""}${r.stderr || ""}`
  const sep = out.indexOf("\r\n\r\n") >= 0 ? out.indexOf("\r\n\r\n") : out.indexOf("\n\n")
  const head = sep >= 0 ? out.slice(0, sep) : ""
  const body = sep >= 0 ? out.slice(sep).replace(/^\r?\n\r?\n/, "") : out
  const statusLine = head.split(/\r?\n/)[0] || ""
  const m = statusLine.match(/HTTP\/[\d.]+ (\d+)/)
  const status = m ? Number(m[1]) : 0
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  }
}

async function nativeFetch(url, { follow = false } = {}) {
  const r = await fetch(url, {
    redirect: follow ? "follow" : "manual",
    signal: AbortSignal.timeout(20000),
  })
  const text = await r.text().catch(() => "")
  return {
    ok: r.ok,
    status: r.status,
    text: async () => text,
  }
}

async function doFetch(url, opts) {
  if (RESOLVE_IP) return curlFetch(url, opts)
  return nativeFetch(url, opts)
}

async function check(label, url, pred, { soft = false, follow = false } = {}) {
  const t0 = Date.now()
  try {
    const r = await doFetch(url, { follow })
    const text = await r.text()
    const ms = Date.now() - t0
    const ok = pred(r, text)
    const tag = ok ? "OK" : soft ? "WARN" : "FAIL"
    console.log(`${tag} ${label}  ${r.status}  ${ms}ms  ${url}`)
    if (!ok && text) console.log(`  body: ${text.slice(0, 180).replace(/\s+/g, " ")}`)
    return soft ? true : ok
  } catch (e) {
    console.log(`${soft ? "WARN" : "FAIL"} ${label}  ${(e && e.message) || e}  ${url}`)
    return soft
  }
}

async function checkPair(apiBase, webBase) {
  const api = apiBase.replace(/\/+$/, "")
  const web = webBase.replace(/\/+$/, "")
  let pass = 0
  let total = 0
  const one = async (label, url, pred, opts) => {
    total += 1
    if (await check(label, url, pred, opts)) pass += 1
  }
  await one(
    "api /health",
    `${api}/health`,
    (r, t) => r.ok && (/["']status["']\s*:\s*["']ok["']/i.test(t) || /ok/i.test(t)),
  )
  await one(
    "api /api/auth/me (expect 401)",
    `${api}/api/auth/me`,
    (r) => r.status === 401 || r.status === 200,
  )
  await one(
    "api /api/central/manifest",
    `${api}/api/central/manifest?client_version=0.0.1`,
    (r) => r.ok,
    { soft: true },
  )
  await one(
    "web / (reachable)",
    `${web}/`,
    (r) => r.ok || (r.status >= 300 && r.status < 400) || r.status === 401,
    { follow: true },
  )
  console.log(`[summary] ${pass}/${total}  api=${api}  web=${web}`)
  return pass === total
}

async function main() {
  const phase = arg("phase", "prod")
  if (phase === "pre") {
    console.log("[pre] 当前生产域名基线（迁机前）")
    const ok = await checkPair(PROD_API, PROD_WEB)
    console.log(
      ok
        ? "[pre] 基线可用。请按 docs/deploy/ZEABUR-BEIJING-MIGRATE.md 备份 accounts.db 后 Copy Project。"
        : "[pre] 基线异常，先修复旧环境再迁移。",
    )
    process.exit(ok ? 0 : 1)
  }
  if (phase === "temp") {
    const api = arg("api")
    const web = arg("web")
    if (!api || !web) {
      console.error("用法: --phase temp --api https://临时api --web https://临时web")
      process.exit(2)
    }
    console.log("[temp] 新项目临时域名验收（换绑 mcap-cloud-* 之前）")
    process.exit((await checkPair(api, web)) ? 0 : 1)
  }
  if (phase === "prod") {
    console.log("[prod] 复用域名验收（解绑旧 → 绑新之后）")
    process.exit((await checkPair(PROD_API, PROD_WEB)) ? 0 : 1)
  }
  console.error(`未知 phase: ${phase}`)
  process.exit(2)
}

main()

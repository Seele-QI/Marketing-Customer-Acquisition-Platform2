#!/usr/bin/env node
/**
 * 验收桌面软更新链路（不启 UI）：
 * 1) package / latest.yml 版本一致
 * 2) 云端 manifest 对旧客户端提示最新版且非强更
 * 3) UPDATE feed latest.yml 公网可读且 version 匹配
 *
 *   node scripts/verify-desktop-update.mjs
 *   node scripts/verify-desktop-update.mjs --client 0.1.0 --expect 0.1.1
 */

import { readFileSync, existsSync } from "node:fs"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "..")

function arg(name, fallback = "") {
  const i = process.argv.indexOf(`--${name}`)
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]
  return fallback
}

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const eq = t.indexOf("=")
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    if (!(k in process.env) || process.env[k] === "") process.env[k] = v
  }
}

loadEnvFile(path.join(root, ".env.electron-build.local"))
loadEnvFile(path.join(root, ".env"))
loadEnvFile(path.join(root, "resources", ".env"))

function fail(msg) {
  console.error(`[verify-desktop-update] FAIL: ${msg}`)
  process.exit(1)
}

function ok(msg) {
  console.log(`[verify-desktop-update] OK: ${msg}`)
}

const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"))
const expect = arg("expect", String(pkg.version || "").trim())
const client = arg("client", "0.1.0")
const api =
  arg("api") ||
  process.env.CLOUD_API_URL ||
  "https://mcap-cloud-api.preview.aliyun-zeabur.cn"
const feed = (
  arg("feed") ||
  process.env.UPDATE_FEED_URL ||
  process.env.CENTRAL_UPDATE_URL ||
  "https://mcap-desktop-releases.oss-cn-beijing.aliyuncs.com/releases/"
).replace(/\/?$/, "/")

const ymlPath = path.join(root, "release", "latest.yml")
if (!existsSync(ymlPath)) fail("release/latest.yml missing — run pnpm dist:win first")
const yml = readFileSync(ymlPath, "utf8")
const ymlVer = (yml.match(/^\s*version:\s*(\S+)/m) || [])[1]
if (ymlVer !== expect) fail(`latest.yml version=${ymlVer} != expect ${expect}`)
ok(`local latest.yml version=${ymlVer}`)

const setupName = (yml.match(/^\s*path:\s*(.+)$/m) || [])[1]?.trim()
if (!setupName) fail("latest.yml missing path")
const setupPath = path.join(root, "release", setupName)
if (!existsSync(setupPath)) fail(`missing artifact ${setupName}`)
ok(`artifact present: ${setupName}`)

const manifestUrl = `${api.replace(/\/$/, "")}/api/central/manifest?client_version=${encodeURIComponent(client)}`
const mr = await fetch(manifestUrl)
if (!mr.ok) fail(`manifest HTTP ${mr.status}`)
const manifest = await mr.json()
if (String(manifest.latest_version) !== expect) {
  fail(`manifest.latest_version=${manifest.latest_version} != ${expect}`)
}
if (manifest.force_update === true) {
  fail("force_update unexpectedly true (soft update expected)")
}
ok(`manifest soft update: client ${client} → latest ${manifest.latest_version}`)

const feedYmlUrl = `${feed}latest.yml`
const fr = await fetch(feedYmlUrl)
const feedBody = await fr.text()
if (!fr.ok) {
  fail(`feed latest.yml HTTP ${fr.status}: ${feedBody.slice(0, 200).replace(/\s+/g, " ")}`)
}
const feedVer = (feedBody.match(/^\s*version:\s*(\S+)/m) || [])[1]
if (feedVer !== expect) fail(`feed version=${feedVer} != ${expect}`)
ok(`public feed latest.yml version=${feedVer} (${feedYmlUrl})`)

console.log("[verify-desktop-update] ALL CHECKS PASSED")
console.log("Manual UI: 旧客户端 → 设置 → 应用更新 → 检查更新 → 下载 → 重启")

#!/usr/bin/env node
/**
 * 清理 DATA_DIR 下过期的 video-postprocess / video-cache 任务目录。
 * 用法: node scripts/cleanup-video-cache.mjs --data-dir /data --max-age-days 14
 */
import fs from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
function arg(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback
}

const dataDir = arg("--data-dir", process.env.DATA_DIR || "./data")
const maxAgeDays = Number(arg("--max-age-days", "14"))
const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
const now = Date.now()

const targets = ["video-postprocess", "video-cache"]
let removed = 0

for (const sub of targets) {
  const root = path.join(dataDir, sub)
  if (!fs.existsSync(root)) continue
  for (const name of fs.readdirSync(root)) {
    const full = path.join(root, name)
    try {
      const st = fs.statSync(full)
      if (now - st.mtimeMs > maxAgeMs) {
        fs.rmSync(full, { recursive: true, force: true })
        removed += 1
        console.log("removed", full)
      }
    } catch (e) {
      console.warn("skip", full, e)
    }
  }
}

console.log(`cleanup done: removed ${removed} entries older than ${maxAgeDays} days`)

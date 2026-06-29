#!/usr/bin/env node
/**
 * Ensure tools/ffmpeg/bin has ffmpeg + ffprobe (extract from zip if needed).
 * Prints JSON paths to stdout when --json is passed.
 */

import { existsSync } from "node:fs"
import { spawnSync } from "node:child_process"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const binDir = path.join(projectRoot, "tools", "ffmpeg", "bin")
const exeExt = process.platform === "win32" ? ".exe" : ""
const ffmpegPath = path.join(binDir, `ffmpeg${exeExt}`)
const ffprobePath = path.join(binDir, `ffprobe${exeExt}`)

if (!existsSync(ffmpegPath) || !existsSync(ffprobePath)) {
  const r = spawnSync(process.execPath, [path.join(__dirname, "extract-ffmpeg.mjs")], {
    stdio: "inherit",
    cwd: projectRoot,
  })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

if (!existsSync(ffmpegPath) || !existsSync(ffprobePath)) {
  console.error("[ensure-ffmpeg] binaries still missing after extract")
  process.exit(1)
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ ffmpeg: ffmpegPath, ffprobe: ffprobePath, binDir }))
} else {
  console.log(`[ensure-ffmpeg] OK: ${ffmpegPath}`)
}

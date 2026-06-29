#!/usr/bin/env node
/**
 * 从 tools/ffmpeg/ffmpeg.zip 解压 ffmpeg/ffprobe 到：
 * - tools/ffmpeg/bin/     （本地 dev / Docker 可选）
 * - resources/ffmpeg/bin/ （Electron 打包）
 *
 * 触发：pnpm ffmpeg:ensure | pnpm resources:build
 */

import { existsSync, mkdirSync, copyFileSync, rmSync, readdirSync, statSync } from "node:fs"
import { spawn } from "node:child_process"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")

const zipSrc = path.join(projectRoot, "tools", "ffmpeg", "ffmpeg.zip")
const targetDirs = [
  path.join(projectRoot, "tools", "ffmpeg", "bin"),
  path.join(projectRoot, "resources", "ffmpeg", "bin"),
]

const exeExt = process.platform === "win32" ? ".exe" : ""
const ffmpegName = `ffmpeg${exeExt}`
const ffprobeName = `ffprobe${exeExt}`

function allTargetsReady() {
  return targetDirs.every((dir) => {
    return existsSync(path.join(dir, ffmpegName)) && existsSync(path.join(dir, ffprobeName))
  })
}

function copyBinFromInner(innerBinDir, targetDir) {
  mkdirSync(targetDir, { recursive: true })
  for (const f of readdirSync(innerBinDir)) {
    if (f === ffmpegName || f === ffprobeName || f.endsWith(".exe")) {
      copyFileSync(path.join(innerBinDir, f), path.join(targetDir, f))
    }
  }
}

async function extractToTmp() {
  const tmpDir = path.join(projectRoot, "tools", "ffmpeg", "_tmp_extract")
  rmSync(tmpDir, { recursive: true, force: true })
  mkdirSync(tmpDir, { recursive: true })

  if (process.platform === "win32") {
    await new Promise((resolve, reject) => {
      const tk = spawn("tar", ["-xf", zipSrc, "-C", tmpDir], { stdio: "inherit", shell: false })
      tk.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`tar exit ${code}`))))
      tk.on("error", reject)
    })
  } else {
    await new Promise((resolve, reject) => {
      const tk = spawn("unzip", ["-o", zipSrc, "-d", tmpDir], { stdio: "inherit" })
      tk.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`unzip exit ${code}`))))
      tk.on("error", reject)
    })
  }

  const entries = readdirSync(tmpDir)
  if (entries.length === 0) throw new Error("no entries extracted")
  const innerBin = path.join(tmpDir, entries[0], "bin")
  if (!existsSync(innerBin)) throw new Error(`expected bin/ inside ${entries[0]}`)
  return innerBin
}

console.log("[extract-ffmpeg] source:", zipSrc)

if (!existsSync(zipSrc)) {
  console.error(`[extract-ffmpeg] ERROR: ${zipSrc} not found`)
  console.error("  Download: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip")
  console.error("  Save as tools/ffmpeg/ffmpeg.zip")
  process.exit(1)
}

if (allTargetsReady()) {
  console.log("[extract-ffmpeg] already extracted to all targets, skipping")
  process.exit(0)
}

try {
  const innerBin = await extractToTmp()
  for (const targetDir of targetDirs) {
    const ffmpegPath = path.join(targetDir, ffmpegName)
    const ffprobePath = path.join(targetDir, ffprobeName)
    if (existsSync(ffmpegPath) && existsSync(ffprobePath)) {
      console.log("[extract-ffmpeg] skip (ready):", targetDir)
      continue
    }
    console.log("[extract-ffmpeg] writing:", targetDir)
    copyBinFromInner(innerBin, targetDir)
  }
  rmSync(path.join(projectRoot, "tools", "ffmpeg", "_tmp_extract"), { recursive: true, force: true })
} catch (err) {
  console.error("[extract-ffmpeg] FAILED:", err instanceof Error ? err.message : err)
  process.exit(1)
}

for (const targetDir of targetDirs) {
  const ffmpegPath = path.join(targetDir, ffmpegName)
  const ffprobePath = path.join(targetDir, ffprobeName)
  if (!existsSync(ffmpegPath) || !existsSync(ffprobePath)) {
    console.error(`[extract-ffmpeg] ERROR: missing binaries in ${targetDir}`)
    process.exit(1)
  }
  const ffmpegStat = statSync(ffmpegPath)
  const ffprobeStat = statSync(ffprobePath)
  console.log(
    `[extract-ffmpeg] OK ${targetDir}: ffmpeg=${(ffmpegStat.size / 1024 / 1024).toFixed(1)}MB, ` +
      `ffprobe=${(ffprobeStat.size / 1024 / 1024).toFixed(1)}MB`,
  )
}

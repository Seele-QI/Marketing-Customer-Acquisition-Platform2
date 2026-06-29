#!/usr/bin/env node
/**
 * Dev FastAPI launcher: ensure ffmpeg from zip, inject FFMPEG_EXE, start uvicorn.
 */

import { spawnSync, spawn } from "node:child_process"
import * as path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, "..")
const exeExt = process.platform === "win32" ? ".exe" : ""
const binDir = path.join(projectRoot, "tools", "ffmpeg", "bin")
const ffmpegPath = path.join(binDir, `ffmpeg${exeExt}`)
const ffprobePath = path.join(binDir, `ffprobe${exeExt}`)

const ensure = spawnSync(process.execPath, [path.join(__dirname, "ensure-ffmpeg.mjs")], {
  stdio: "inherit",
  cwd: projectRoot,
})
if (ensure.status !== 0) process.exit(ensure.status ?? 1)

const env = {
  ...process.env,
  FFMPEG_EXE: ffmpegPath,
  FFPROBE_EXE: ffprobePath,
}

const args = process.argv.slice(2)
const uvicornArgs =
  args.length > 0
    ? args
    : ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"]

const child = spawn("python", uvicornArgs, {
  cwd: projectRoot,
  env,
  stdio: "inherit",
  shell: process.platform === "win32",
})

child.on("exit", (code) => process.exit(code ?? 0))

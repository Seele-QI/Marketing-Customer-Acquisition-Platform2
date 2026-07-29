#!/usr/bin/env node
/** Dev FastAPI launcher with Node-managed reload (required for Playwright on Windows). */

import { spawnSync, spawn } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, readdirSync, watch, writeFileSync } from "node:fs"
import { randomBytes } from "node:crypto"
import * as path from "node:path"
import { fileURLToPath } from "node:url"
import {
  createRestartDebouncer,
  defaultUvicornArgs,
  isWatchedPythonPath,
  relativeWatchedPath,
  sanitizeUvicornArgs,
} from "./dev-api-runtime.mjs"

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

const env = { ...process.env, FFMPEG_EXE: ffmpegPath, FFPROBE_EXE: ffprobePath }
const bundledBrowsers = path.join(projectRoot, "resources", "python", ".browsers")

function hasBundledChromium(root) {
  if (!existsSync(root)) return false
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("chromium-") && !entry.name.includes("headless"))
    .some((entry) => [
      path.join(root, entry.name, "chrome-win64", "chrome.exe"),
      path.join(root, entry.name, "chrome-linux", "chrome"),
      path.join(root, entry.name, "chrome-mac", "Chromium.app", "Contents", "MacOS", "Chromium"),
    ].some(existsSync))
}

if (!env.PLAYWRIGHT_BROWSERS_PATH && hasBundledChromium(bundledBrowsers)) env.PLAYWRIGHT_BROWSERS_PATH = bundledBrowsers

const secretFile = path.join(projectRoot, "data", "distribution-dev-secret")
if (!env.COOKIE_ENCRYPTION_KEY) {
  mkdirSync(path.dirname(secretFile), { recursive: true })
  let secret = existsSync(secretFile) ? readFileSync(secretFile, "utf8").trim() : ""
  if (secret.length < 32) {
    secret = randomBytes(32).toString("base64url")
    writeFileSync(secretFile, secret, { encoding: "utf8", mode: 0o600 })
  }
  env.COOKIE_ENCRYPTION_KEY = secret
}

function resolvePython() {
  const configured = (process.env.PYTHON_EXE || "").trim()
  const bundled = path.join(projectRoot, "resources", "python", `python${exeExt}`)
  for (const candidate of [configured, bundled]) if (candidate && existsSync(candidate)) return candidate
  return process.platform === "win32" ? "py" : "python3"
}

const pythonExe = resolvePython()
if (!hasBundledChromium(bundledBrowsers) && existsSync(pythonExe)) {
  console.log("[dev-api] Playwright Chromium missing, installing once...")
  mkdirSync(bundledBrowsers, { recursive: true })
  const install = spawnSync(pythonExe, ["-m", "playwright", "install", "chromium"], {
    cwd: projectRoot,
    env: { ...env, PLAYWRIGHT_BROWSERS_PATH: bundledBrowsers },
    stdio: "inherit",
  })
  if (install.status === 0) env.PLAYWRIGHT_BROWSERS_PATH = bundledBrowsers
  else console.warn("[dev-api] bundled Chromium install failed; runtime will try system Chrome")
}

const requestedArgs = process.argv.slice(2)
const uvicornArgs = sanitizeUvicornArgs(requestedArgs.length ? requestedArgs : defaultUvicornArgs())
if (requestedArgs.includes("--reload") && !uvicornArgs.includes("--reload")) {
  console.warn("[dev-api] Windows Playwright requires ProactorEventLoop; Uvicorn --reload was replaced by Node file watching")
}

const bundledPython = path.join(projectRoot, "resources", "python", `python${exeExt}`)
function pythonCommand() {
  if (path.resolve(pythonExe) === path.resolve(bundledPython)) {
    const cliArgs = uvicornArgs[0] === "-m" && uvicornArgs[1] === "uvicorn" ? uvicornArgs.slice(2) : uvicornArgs
    const bootstrap = `import sys,runpy;sys.path.insert(0,${JSON.stringify(projectRoot)});sys.argv=${JSON.stringify(["uvicorn", ...cliArgs])};runpy.run_module('uvicorn',run_name='__main__')`
    return ["-c", bootstrap]
  }
  return pythonExe === "py" ? ["-3", ...uvicornArgs] : uvicornArgs
}

let child = null
let restarting = false
let shuttingDown = false
let pendingRestart = false
const watchers = []

function launchApi() {
  console.log(`[dev-api] python: ${pythonExe}`)
  console.log(`[dev-api] uvicorn: ${uvicornArgs.join(" ")}`)
  child = spawn(pythonExe, pythonCommand(), { cwd: projectRoot, env, stdio: "inherit", shell: false })
  child.on("exit", (code) => {
    child = null
    if (shuttingDown) return
    if (restarting) {
      restarting = false
      launchApi()
      if (pendingRestart) {
        pendingRestart = false
        scheduleRestart()
      }
      return
    }
    closeWatchers()
    process.exit(code ?? 1)
  })
}

function restartApi() {
  if (shuttingDown) return
  if (restarting) {
    pendingRestart = true
    return
  }
  restarting = true
  console.log("[dev-api] Python source changed; restarting FastAPI...")
  if (child) child.kill()
  else {
    restarting = false
    launchApi()
  }
}

const scheduleRestart = createRestartDebouncer(restartApi, 500)

function registerWatcher(directory, recursive) {
  if (!existsSync(directory)) return
  const watcher = watch(directory, { recursive }, (_event, filename) => {
    const relative = relativeWatchedPath(projectRoot, directory, filename)
    if (isWatchedPythonPath(relative)) scheduleRestart()
  })
  watchers.push(watcher)
}

function closeWatchers() {
  scheduleRestart.dispose()
  for (const watcher of watchers) watcher.close()
  watchers.length = 0
}

function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  closeWatchers()
  if (child) child.kill()
  else process.exit(0)
}

registerWatcher(projectRoot, false)
registerWatcher(path.join(projectRoot, "lib"), true)
process.on("SIGINT", shutdown)
process.on("SIGTERM", shutdown)
launchApi()

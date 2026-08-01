#!/usr/bin/env node

import { spawn } from "node:child_process"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { loadDevCloudModelEnv } from "./dev-cloud-model-env.mjs"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const defaultProjectRoot = path.resolve(scriptDir, "..")

export function startDevServices({
  projectRoot = defaultProjectRoot,
  runtimeProcess = process,
  spawnImpl = spawn,
  loadEnv = loadDevCloudModelEnv,
} = {}) {
  const env = loadEnv({ baseEnv: runtimeProcess.env })
  const commonOptions = { cwd: projectRoot, env, stdio: "inherit", shell: false }
  const nextCli = path.join(projectRoot, "node_modules", "next", "dist", "bin", "next")
  const children = [
    spawnImpl(runtimeProcess.execPath, [nextCli, "dev"], commonOptions),
    spawnImpl(runtimeProcess.execPath, [path.join(projectRoot, "scripts", "dev-api.mjs")], commonOptions),
  ]
  let stopping = false

  function shutdown(exitCode) {
    if (stopping) return
    stopping = true
    if (Number.isInteger(exitCode)) runtimeProcess.exitCode = exitCode
    for (const child of children) {
      if (typeof child.kill === "function") child.kill()
    }
  }

  for (const child of children) {
    child.once("error", (error) => {
      console.error(`[dev:all] 子进程启动失败：${error.message}`)
      shutdown(1)
    })
    child.once("exit", (code) => {
      if (!stopping) shutdown(code ?? 1)
    })
  }
  runtimeProcess.once("SIGINT", () => shutdown(0))
  runtimeProcess.once("SIGTERM", () => shutdown(0))

  console.log("[dev:all] 已向 Next.js 与 FastAPI 注入同一份云端模型配置。")
  return { children, env, shutdown }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ""
if (invokedPath === import.meta.url) {
  try {
    startDevServices()
  } catch (error) {
    console.error(`[dev:all] ${error?.message || String(error)}`)
    process.exitCode = 1
  }
}

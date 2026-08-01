import assert from "node:assert/strict"
import { EventEmitter } from "node:events"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"

import { startDevServices } from "../scripts/dev-all.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("dev:all uses the cloud-aware development launcher", () => {
  const pkg = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"))
  assert.equal(pkg.scripts["dev:all"], "node scripts/dev-all.mjs")
})

test("development launcher passes one cloud provider snapshot to Next and FastAPI", () => {
  const calls = []
  const runtimeProcess = new EventEmitter()
  runtimeProcess.env = { LOCAL_ONLY: "preserved" }
  runtimeProcess.execPath = "node-test"
  runtimeProcess.exitCode = undefined
  const spawnImpl = (command, args, options) => {
    const child = new EventEmitter()
    child.kill = () => true
    calls.push({ command, args, options, child })
    return child
  }
  const injectedEnv = {
    LOCAL_ONLY: "preserved",
    MODEL_PROVIDERS_JSON_B64: "cloud-snapshot",
    DESKTOP_RUNTIME: "1",
  }

  const result = startDevServices({
    projectRoot,
    platform: "win32",
    runtimeProcess,
    spawnImpl,
    loadEnv: () => injectedEnv,
  })

  assert.equal(calls.length, 2)
  assert.equal(calls[0].command, "node-test")
  assert.deepEqual(calls[0].args, [path.join(projectRoot, "node_modules", "next", "dist", "bin", "next"), "dev"])
  assert.deepEqual(calls[1].args, [path.join(projectRoot, "scripts", "dev-api.mjs")])
  assert.strictEqual(calls[0].options.env, injectedEnv)
  assert.strictEqual(calls[1].options.env, injectedEnv)
  assert.equal(calls[0].options.env.MODEL_PROVIDERS_JSON_B64, "cloud-snapshot")
  result.shutdown()
})

import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, it } from "node:test"
import { syncConfig } from "../electron/services/config-sync-client.ts"
import logger from "../electron/services/logger.ts"

const fakeWindow = {
  isDestroyed: () => false,
  webContents: {
    session: { cookies: { get: async () => [{ name: "session_id", value: "session-secret" }] } },
  },
} as any

async function withSyncEnv(run: () => Promise<void>) {
  const userData = mkdtempSync(path.join(tmpdir(), "config-sync-"))
  const previousCloud = process.env.CLOUD_API_URL
  const previousData = process.env.TEST_ELECTRON_USER_DATA
  process.env.CLOUD_API_URL = "https://cloud.example"
  process.env.TEST_ELECTRON_USER_DATA = userData
  try {
    await run()
  } finally {
    if (previousCloud === undefined) delete process.env.CLOUD_API_URL
    else process.env.CLOUD_API_URL = previousCloud
    if (previousData === undefined) delete process.env.TEST_ELECTRON_USER_DATA
    else process.env.TEST_ELECTRON_USER_DATA = previousData
    rmSync(userData, { recursive: true, force: true })
  }
}

describe("config sync resilience", () => {
  it("times out a fetch that never settles", async () => withSyncEnv(async () => {
    const startedAt = Date.now()
    const result = await syncConfig(fakeWindow, "http://127.0.0.1:3000", {
      timeoutMs: 10,
      fetchImpl: async () => new Promise<Response>(() => {}),
    })
    assert.equal(result.ok, false)
    assert.equal((result as any).code, "REQUEST_TIMEOUT")
    assert.ok(Date.now() - startedAt < 500)
  }))

  it("normalizes invalid JSON and credential-store failures", async () => withSyncEnv(async () => {
    const invalid = await syncConfig(fakeWindow, "http://127.0.0.1:3000", {
      fetchImpl: async () => new Response("not-json", { status: 200 }),
    })
    assert.deepEqual(invalid, {
      ok: false,
      code: "INVALID_RESPONSE",
      message: "云端配置响应异常，请稍后重试。",
    })

    const invalidShape = await syncConfig(fakeWindow, "http://127.0.0.1:3000", {
      fetchImpl: async () => new Response(JSON.stringify({
        config_version: 123,
        providers: [null],
      }), { status: 200 }),
    })
    assert.equal(invalidShape.ok, false)
    assert.equal((invalidShape as any).code, "INVALID_RESPONSE")

    const storeFailure = await syncConfig(fakeWindow, "http://127.0.0.1:3000", {
      fetchImpl: async () => new Response(JSON.stringify({
        config_version: "cfg-save-fail",
        keys: { API_KEY: "must-not-leak" },
      }), { status: 200 }),
      saveCredentials: () => { throw new Error("disk error with must-not-leak") },
    })
    assert.deepEqual(storeFailure, {
      ok: false,
      code: "STORE_ERROR",
      message: "客户端配置保存失败，请重启程序后再试。",
    })
  }))

  it("times out response parsing so the coordinator cannot remain in-flight forever", async () => withSyncEnv(async () => {
    const startedAt = Date.now()
    const result = await syncConfig(fakeWindow, "http://127.0.0.1:3000", {
      timeoutMs: 10,
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => new Promise<unknown>(() => {}),
      } as Response),
    })
    assert.equal(result.ok, false)
    assert.equal((result as any).code, "REQUEST_TIMEOUT")
    assert.ok(Date.now() - startedAt < 500)
  }))

  it("never logs raw network exceptions or upstream response bodies", async () => withSyncEnv(async () => {
    const logs: string[] = []
    const originalError = logger.error
    const originalWarn = logger.warn
    logger.error = (...args: unknown[]) => { logs.push(args.join(" ")) }
    logger.warn = (...args: unknown[]) => { logs.push(args.join(" ")) }
    try {
      await syncConfig(fakeWindow, "http://127.0.0.1:3000", {
        fetchImpl: async () => { throw new Error("password=network-secret") },
      })
      await syncConfig(fakeWindow, "http://127.0.0.1:3000", {
        fetchImpl: async () => new Response("cookie=upstream-secret", { status: 500 }),
      })
    } finally {
      logger.error = originalError
      logger.warn = originalWarn
    }
    assert.doesNotMatch(logs.join("\n"), /network-secret|upstream-secret|password=|cookie=/)
  }))
})

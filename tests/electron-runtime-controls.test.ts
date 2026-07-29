import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import { createRestartAppHandler } from "../electron/services/app-restart.ts"
import { sanitizeClientErrorReport } from "../electron/services/client-error-report.ts"
import {
  attachRendererNetworkLogBridge,
  sanitizeRendererNetworkLogMessage,
} from "../electron/services/renderer-network-log.ts"

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}

describe("Electron runtime controls", () => {
  it("runs a requested app restart only once and in shutdown order", async () => {
    const stopGate = deferred<void>()
    const calls: string[] = []
    const restart = createRestartAppHandler({
      beginQuit: () => calls.push("beginQuit"),
      stopScheduler: () => calls.push("stopScheduler"),
      stopChildren: async () => {
        calls.push("stopChildren")
        await stopGate.promise
      },
      relaunch: () => calls.push("relaunch"),
      exit: () => calls.push("exit"),
    })

    const first = restart()
    const second = restart()
    assert.equal(first, second)
    assert.deepEqual(calls, ["beginQuit", "stopScheduler", "stopChildren"])
    stopGate.resolve()
    await first
    assert.deepEqual(calls, ["beginQuit", "stopScheduler", "stopChildren", "relaunch", "exit"])
  })

  it("still relaunches when child cleanup fails instead of staying permanently rejected", async () => {
    const calls: string[] = []
    const restart = createRestartAppHandler({
      beginQuit: () => calls.push("beginQuit"),
      stopScheduler: () => calls.push("stopScheduler"),
      stopChildren: async () => {
        calls.push("stopChildren")
        throw new Error("taskkill failed")
      },
      onStopError: () => calls.push("onStopError"),
      relaunch: () => calls.push("relaunch"),
      exit: () => calls.push("exit"),
    })

    assert.deepEqual(await restart(), { ok: true })
    assert.deepEqual(calls, [
      "beginQuit",
      "stopScheduler",
      "stopChildren",
      "onStopError",
      "relaunch",
      "exit",
    ])
  })

  it("allows only a minimal sanitized client diagnostic payload", () => {
    const safe = sanitizeClientErrorReport({
      category: "local_service",
      requestPath: "http://127.0.0.1:8010/api/login?account=18900000000&password=secret#token",
      status: 503,
      timestamp: "2026-07-22T01:02:03.000Z",
      account: "18900000000",
      password: "secret",
      cookie: "session_id=secret",
      body: { password: "secret" },
    })

    assert.deepEqual(safe, {
      category: "local_service",
      requestPath: "/api/login",
      status: 503,
      timestamp: "2026-07-22T01:02:03.000Z",
    })
    assert.equal(sanitizeClientErrorReport({ category: "credential_leak", requestPath: "/api" }), null)
  })

  it("persists only prefixed renderer network logs after aggressive redaction", () => {
    assert.equal(sanitizeRendererNetworkLogMessage("ordinary renderer console"), null)
    const safe = sanitizeRendererNetworkLogMessage(
      "[client-network-error] TypeError: Failed https://user:url-pass@api.example.com/login?token=url-secret " +
      "password=\"two word secret\" api_key=key-secret Authorization: Bearer bearer-secret " +
      "Cookie: sid=cookie-secret; refresh=second-secret",
    )
    assert.ok(safe)
    assert.match(safe, /^\[client-network-error\]/)
    assert.match(safe, /https:\/\/api\.example\.com\/login/)
    assert.doesNotMatch(safe, /url-secret|url-pass|bearer-secret|cookie-secret|second-secret|two word secret|key-secret|\?token=/)
    assert.ok(safe.length <= 1024)

    const basic = sanitizeRendererNetworkLogMessage(
      "[client-network-error] request failed Authorization: Basic dXNlcjpwYXNz trailing diagnostic",
    )
    assert.ok(basic)
    assert.doesNotMatch(basic, /dXNlcjpwYXNz|trailing diagnostic/)

    const spaced = sanitizeRendererNetworkLogMessage(
      "[client-network-error] request failed password = hunter 2 token = two word token",
    )
    assert.ok(spaced)
    assert.doesNotMatch(spaced, /hunter|two word token| token /)
  })

  it("wires the renderer console bridge without using IPC payloads", () => {
    let listener: ((event: unknown, level: number, message: string) => void) | undefined
    const persisted: string[] = []
    const fakeWindow = {
      webContents: {
        on: (_event: string, callback: typeof listener) => { listener = callback },
      },
    }
    attachRendererNetworkLogBridge(fakeWindow as never, (message) => persisted.push(message))
    listener?.({}, 3, "ordinary")
    listener?.({}, 3, "[client-network-error] Failed to fetch token=secret")
    assert.equal(persisted.length, 1)
    assert.doesNotMatch(persisted[0], /secret/)
  })

  it("wires scheduler, runtime status, restart, and reporting through the safe preload bridge", () => {
    const main = readFileSync(new URL("../electron/main.ts", import.meta.url), "utf8")
    const scheduler = readFileSync(new URL("../electron/services/config-scheduler.ts", import.meta.url), "utf8")
    const preload = readFileSync(new URL("../electron/preload.ts", import.meta.url), "utf8")
    const declarations = readFileSync(new URL("../types/electron.d.ts", import.meta.url), "utf8")

    assert.doesNotMatch(scheduler, /from ['"]\.\/config-sync-client['"]|syncConfig\(/)
    assert.match(main, /configUpdateCoordinator\.requestSync\(\)/)
    assert.match(main, /ipcMain\.handle\('service-runtime:get-status'/)
    assert.match(main, /ipcMain\.handle\('app:restart'/)
    assert.match(main, /ipcMain\.handle\('client-error:report'/)
    assert.match(main, /requireTrustedIpc\(/)
    assert.match(main, /registerUpdaterIpc\(requireTrustedIpc\)/)
    assert.match(main, /setWindowOpenHandler/)
    assert.match(main, /will-navigate/)
    assert.match(main, /attachRendererNetworkLogBridge\(win/)
    assert.match(preload, /getServiceRuntimeStatus:/)
    assert.match(preload, /onServiceRuntimeStatus:/)
    assert.match(preload, /restartApp:/)
    assert.match(preload, /reportClientError:/)
    assert.match(declarations, /type ServiceRuntimeStatus/)
    assert.match(declarations, /restartApp:/)
    assert.match(declarations, /reportClientError:/)
  })

  it("reloads FastAPI before Next from one injected credential snapshot", () => {
    const main = readFileSync(new URL("../electron/main.ts", import.meta.url), "utf8")
    assert.match(main, /restartChildrenWithFreshKeys[\s\S]*?startChildSpecs\(specs, \['uvicorn', 'next'\]\)/)
    assert.match(main, /const injectedNextDev[\s\S]*?await injectApiKeys\(devEnv\)/)
    assert.equal(main.match(/await injectApiKeys\(/g)?.length, 2)
  })
})

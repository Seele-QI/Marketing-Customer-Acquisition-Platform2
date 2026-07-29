import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
  ConfigUpdateCoordinator,
  type ConfigUpdateResult,
} from "../electron/services/config-update-coordinator.ts"
import type { ConfigSyncResult } from "../electron/services/config-sync-client.ts"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function changed(version: string): ConfigSyncResult {
  return { ok: true, unchanged: false, config_version: version }
}

describe("ConfigUpdateCoordinator", () => {
  it("coalesces follow-up requests into one queued cycle and applies one version exactly once", async () => {
    const syncGate = deferred<ConfigSyncResult>()
    const applyGate = deferred<void>()
    let syncCalls = 0
    const applied: string[] = []
    const states: string[] = []
    const coordinator = new ConfigUpdateCoordinator({
      sync: async () => {
        syncCalls += 1
        return syncGate.promise
      },
      apply: async (version) => {
        applied.push(version)
        await applyGate.promise
      },
      publish: (status) => states.push(status.state),
    })

    const first = coordinator.requestSync()
    const second = coordinator.requestSync()
    const third = coordinator.requestSync()
    assert.notEqual(first, second)
    assert.equal(second, third)
    syncGate.resolve(changed("cfg-2"))
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(applied, ["cfg-2"])
    applyGate.resolve()

    assert.deepEqual(await first, changed("cfg-2"))
    assert.deepEqual(await second, changed("cfg-2"))
    assert.equal(syncCalls, 2)
    assert.deepEqual(states, ["idle", "updating", "ready"])
  })

  it("never reapplies a failed version and publishes a customer-safe failed status", async () => {
    let applyCalls = 0
    const states: Array<{ state: string; message?: string }> = []
    const coordinator = new ConfigUpdateCoordinator({
      sync: async () => changed("cfg-bad"),
      apply: async () => {
        applyCalls += 1
        throw new Error("ECONNREFUSED 127.0.0.1:8010")
      },
      publish: (status) => states.push(status),
    })

    const first = await coordinator.requestSync()
    const second = await coordinator.requestSync()

    assert.equal(first.ok, false)
    assert.equal((first as Extract<ConfigUpdateResult, { ok: false }>).code, "APPLY_FAILED")
    assert.equal(second.ok, true)
    assert.equal(applyCalls, 1)
    assert.deepEqual(states.map((item) => item.state), ["idle", "updating", "failed"])
    assert.equal(states.at(-1)?.message, "客户端服务更新未完成，请重启程序后再试。")
    assert.doesNotMatch(JSON.stringify(states), /ECONNREFUSED|8010/)
  })

  it("drains a newer request only after the previous update finishes", async () => {
    const firstApply = deferred<void>()
    const versions = [changed("cfg-1"), changed("cfg-2")]
    const events: string[] = []
    const coordinator = new ConfigUpdateCoordinator({
      sync: async () => versions.shift()!,
      apply: async (version) => {
        events.push(`start:${version}`)
        if (version === "cfg-1") await firstApply.promise
        events.push(`end:${version}`)
      },
      publish: (status) => events.push(`state:${status.state}:${status.configVersion ?? ""}`),
    })

    const first = coordinator.requestSync()
    await new Promise((resolve) => setImmediate(resolve))
    const second = coordinator.requestSync()
    await new Promise((resolve) => setImmediate(resolve))
    assert.deepEqual(events, [
      "state:idle:",
      "state:updating:cfg-1",
      "start:cfg-1",
    ])
    firstApply.resolve()
    await first
    await second

    assert.deepEqual(events, [
      "state:idle:",
      "state:updating:cfg-1",
      "start:cfg-1",
      "end:cfg-1",
      "state:ready:cfg-1",
      "state:updating:cfg-2",
      "start:cfg-2",
      "end:cfg-2",
      "state:ready:cfg-2",
    ])
  })

  it("never reapplies an old version after more than 32 newer versions", async () => {
    const versions = Array.from({ length: 40 }, (_, index) => changed(`cfg-${index}`))
    versions.push(changed("cfg-0"))
    let applies = 0
    const coordinator = new ConfigUpdateCoordinator({
      sync: async () => versions.shift()!,
      apply: async () => { applies += 1 },
      publish: () => {},
    })

    for (let index = 0; index < 41; index += 1) await coordinator.requestSync()

    assert.equal(applies, 40)
    assert.equal((coordinator as any).attemptedVersions.size, 40)
  })

  it("keeps failed status when the saved failed version is later reported unchanged", async () => {
    const results: ConfigSyncResult[] = [
      changed("cfg-failed"),
      { ok: true, unchanged: true, config_version: "cfg-failed" },
    ]
    const coordinator = new ConfigUpdateCoordinator({
      sync: async () => results.shift()!,
      apply: async () => { throw new Error("startup timeout") },
      publish: () => {},
    })

    await coordinator.requestSync()
    await coordinator.requestSync()

    assert.equal(coordinator.getStatus().state, "failed")
    assert.equal(coordinator.getStatus().configVersion, "cfg-failed")
  })
})

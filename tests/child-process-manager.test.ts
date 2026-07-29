import { describe, it } from "node:test"
import assert from "node:assert/strict"
import type { ChildProcess } from "node:child_process"
import { EventEmitter } from "node:events"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { createServer } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import { ChildProcessManager, type ChildSpec } from "../electron/services/child-process-manager.ts"
import { killProcessTree } from "../electron/utils/process-tree.ts"

const spec: ChildSpec = {
  name: "next",
  command: "node",
  args: [],
  cwd: process.cwd(),
  env: {},
  port: 3010,
}

function fakeHandle(restartCount = 0) {
  const logStream = Object.assign(new EventEmitter(), {
    writableEnded: false,
    end() { this.writableEnded = true },
  })
  return {
    proc: { exitCode: null } as ChildProcess,
    port: spec.port,
    restartCount,
    lastCrashAt: 0,
    stopping: false,
    readinessAbort: new AbortController(),
    logStream,
    logClosed: false,
    ready: true,
    recentStderr: [],
  }
}

function fakeRunningProcess(pid = 999_999): ChildProcess {
  const proc = new EventEmitter() as ChildProcess
  Object.assign(proc, { exitCode: null, signalCode: null, pid })
  return proc
}

async function getFreePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve())
  })
  return address.port
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe("ChildProcessManager lifecycle", () => {
  it("ignores an exit emitted by a replaced process generation", () => {
    const manager = new ChildProcessManager()
    const oldHandle = fakeHandle()
    const currentHandle = fakeHandle(3)
    const internals = manager as any
    internals.handles.set(spec.name, currentHandle)

    internals.handleExit(spec, oldHandle, 1, null)

    assert.equal(internals.handles.get(spec.name), currentHandle)
    assert.equal(currentHandle.restartCount, 3)
  })

  it("does not run a crash restart timer after the handle was replaced", async () => {
    const manager = new ChildProcessManager()
    const crashedHandle = fakeHandle()
    const replacementHandle = fakeHandle()
    const internals = manager as any
    internals.handles.set(spec.name, crashedHandle)

    let scheduled: (() => void) | undefined
    let restartCalls = 0
    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = ((callback: () => void) => {
      scheduled = callback
      return { fake: true }
    }) as any
    internals.restart = async () => { restartCalls += 1 }

    try {
      internals.handleExit(spec, crashedHandle, 1, null)
      assert.ok(scheduled)
      internals.handles.set(spec.name, replacementHandle)

      scheduled()
      await Promise.resolve()

      assert.equal(restartCalls, 0)
      assert.equal(internals.handles.get(spec.name), replacementHandle)
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }
  })

  it("does not start a restart generation before the old process exit is confirmed", async () => {
    let killCalls = 0
    const manager = new ChildProcessManager({
      exitWaitTimeoutMs: 20,
      killProcessTree: async () => { killCalls += 1 },
    } as any)
    const crashedHandle = {
      ...fakeHandle(1),
      proc: fakeRunningProcess(),
    } as any
    const internals = manager as any
    internals.handles.set(spec.name, crashedHandle)
    let startCalls = 0
    internals.startInternal = async () => {
      startCalls += 1
      return fakeHandle()
    }

    const result = await internals.restart(spec, 1, crashedHandle)

    assert.equal(result, null)
    assert.equal(startCalls, 0)
    assert.equal(killCalls, 0)
    assert.equal(internals.handles.get(spec.name), crashedHandle)
  })

  it("inherits restart count before a real replacement process can crash during readiness", async () => {
    const server = createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200)
        res.end("unrelated health responder")
      }, 200)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    assert.ok(address && typeof address !== "string")
    let startupKillCalls = 0
    const manager = new ChildProcessManager({
      killProcessTree: async () => { startupKillCalls += 1 },
    })
    const internals = manager as any
    const earlyCrashSpec: ChildSpec = {
      ...spec,
      command: process.execPath,
      args: ["-e", "process.exit(1)"],
      port: 0,
      healthUrl: `http://127.0.0.1:${address.port}/health`,
      startupTimeoutMs: 2_000,
      shell: false,
    }

    const startup = internals.startInternal(earlyCrashSpec, 1)
    const startupOutcome = startup.then(
      () => ({ ok: true as const, error: undefined }),
      (error: unknown) => ({ ok: false as const, error }),
    )
    try {
      const settledStartup = await startupOutcome
      assert.equal(settledStartup.ok, false)
      assert.match(String(settledStartup.error), /crashed during startup/)
      assert.equal((settledStartup.error as any).restartCount, 2)
      assert.equal(internals.handles.has(spec.name), false)
      assert.equal(startupKillCalls, 0)
      await new Promise((resolve) => setTimeout(resolve, 100))
      assert.equal(internals.handles.has(spec.name), false)
    } finally {
      await startup.catch(() => {})
      await manager.stop(spec.name)
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }
  })

  it("does not taskkill an exited crash generation before restarting", async () => {
    let killCalls = 0
    const manager = new ChildProcessManager({
      killProcessTree: async () => { killCalls += 1 },
    })
    const crashedHandle = {
      ...fakeHandle(1),
      proc: Object.assign(fakeRunningProcess(), { exitCode: 1 }),
    } as any
    const internals = manager as any
    internals.handles.set(spec.name, crashedHandle)
    let initialCount: number | undefined
    internals.startInternal = async (_spec: ChildSpec, count: number) => {
      initialCount = count
      return fakeHandle(count)
    }

    await internals.restart(spec, 1, crashedHandle)

    assert.equal(killCalls, 0)
    assert.equal(initialCount, 1)
  })

  it("marks a stopped handle and cancels its pending restart", async () => {
    const manager = new ChildProcessManager()
    const handle = fakeHandle() as any
    const restartTimer = { fake: true }
    handle.restartTimer = restartTimer
    const internals = manager as any
    internals.handles.set(spec.name, handle)

    let cleared: unknown
    const originalClearTimeout = globalThis.clearTimeout
    globalThis.clearTimeout = ((timer: unknown) => { cleared = timer }) as any

    try {
      await manager.stop(spec.name)

      assert.equal(handle.stopping, true)
      assert.equal(cleared, restartTimer)
      assert.equal(internals.handles.has(spec.name), false)
    } finally {
      globalThis.clearTimeout = originalClearTimeout
    }
  })

  it("bounds stop when kill returns but the child never emits exit or error", async () => {
    const manager = new ChildProcessManager({
      exitWaitTimeoutMs: 20,
      killProcessTree: async () => {},
    } as any)
    const handle = {
      ...fakeHandle(),
      proc: fakeRunningProcess(),
    } as any
    const internals = manager as any
    internals.handles.set(spec.name, handle)

    const outcome = await Promise.race([
      manager.stop(spec.name).then(() => "stopped"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 100)),
    ])

    assert.equal(outcome, "stopped")
    assert.equal(internals.handles.has(spec.name), false)
  })

  it("bounds stop when the process-tree killer never resolves", async () => {
    const manager = new ChildProcessManager({
      exitWaitTimeoutMs: 20,
      killProcessTree: async () => new Promise<void>(() => {}),
    })
    const handle = {
      ...fakeHandle(),
      proc: fakeRunningProcess(),
    } as any
    const internals = manager as any
    internals.handles.set(spec.name, handle)

    const outcome = await Promise.race([
      manager.stop(spec.name).then(() => "stopped"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 100)),
    ])

    assert.equal(outcome, "stopped")
  })

  it("does not count or restart an intentional nonzero exit", () => {
    const manager = new ChildProcessManager()
    const handle = fakeHandle() as any
    handle.stopping = true
    const internals = manager as any
    internals.handles.set(spec.name, handle)

    let scheduled = false
    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = (() => {
      scheduled = true
      return { fake: true }
    }) as any

    try {
      internals.handleExit(spec, handle, 1, "SIGTERM")

      assert.equal(handle.restartCount, 0)
      assert.equal(scheduled, false)
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }
  })

  it("does not report a signal-terminated current process as alive", () => {
    const manager = new ChildProcessManager()
    const handle = fakeHandle() as any
    handle.proc.signalCode = "SIGTERM"
    const internals = manager as any
    internals.handles.set(spec.name, handle)

    assert.deepEqual(manager.status(spec.name), { alive: false, restartCount: 0 })
  })

  it("schedules at most three crash restarts with exponential backoff", () => {
    const manager = new ChildProcessManager()
    const handle = fakeHandle() as any
    const internals = manager as any
    internals.handles.set(spec.name, handle)

    const delays: number[] = []
    const originalSetTimeout = globalThis.setTimeout
    globalThis.setTimeout = ((_callback: () => void, delay?: number) => {
      delays.push(delay ?? 0)
      return { fake: true }
    }) as any

    try {
      for (let crash = 0; crash < 4; crash += 1) {
        internals.handleExit(spec, handle, 1, null)
      }

      assert.deepEqual(delays, [1_000, 2_000, 4_000])
      assert.equal(handle.restartCount, 4)
    } finally {
      globalThis.setTimeout = originalSetTimeout
    }
  })

  it("rejects readiness when this process exited but another service answers the health URL", async () => {
    const manager = new ChildProcessManager()
    const server = createServer((_req, res) => {
      const respondAfterManagedChildStops = () => {
        if (manager.status(spec.name)?.alive) {
          setTimeout(respondAfterManagedChildStops, 5)
          return
        }
        res.writeHead(200)
        res.end("old service")
      }
      respondAfterManagedChildStops()
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    assert.ok(address && typeof address !== "string")

    const exitingSpec: ChildSpec = {
      ...spec,
      command: process.execPath,
      args: ["-e", "process.exit(1)"],
      port: 0,
      healthUrl: `http://127.0.0.1:${address.port}/health`,
      startupTimeoutMs: 2_000,
      shell: false,
    }

    try {
      await assert.rejects(
        manager.start(exitingSpec),
        /crashed during startup|exited before becoming ready/,
      )
    } finally {
      await manager.stop(spec.name)
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }
  })

  it("fails before spawn when the target port is already occupied", async () => {
    const server = createServer((_req, res) => res.end("existing service"))
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    assert.ok(address && typeof address !== "string")
    const tempDir = mkdtempSync(path.join(tmpdir(), "child-manager-port-"))
    const markerPath = path.join(tempDir, "spawned.txt")
    const manager = new ChildProcessManager()
    const occupiedSpec: ChildSpec = {
      ...spec,
      command: process.execPath,
      args: [
        "-e",
        `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'spawned'); setInterval(() => {}, 1000)`,
      ],
      port: address.port,
      healthUrl: `http://127.0.0.1:${address.port}/health`,
      startupTimeoutMs: 2_000,
      shell: false,
    }

    let startError: unknown
    try {
      await manager.start(occupiedSpec)
    } catch (error) {
      startError = error
    } finally {
      await manager.stop(spec.name)
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }

    try {
      assert.match(String(startError), /port .* already in use/i)
      assert.equal(existsSync(markerPath), false)
    } finally {
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("rejects a live foreign responder that does not echo this generation", async () => {
    const port = await getFreePort()
    const manager = new ChildProcessManager()
    const foreignServerScript = [
      "const http = require('node:http')",
      `http.createServer((_req, res) => { res.setHeader('X-Electron-Service-Generation', 'foreign'); res.end('foreign') }).listen(${port}, '127.0.0.1')`,
    ].join(";")
    const sleeperScript = [
      "const { spawn } = require('node:child_process')",
      `const child = spawn(process.execPath, ['-e', ${JSON.stringify(foreignServerScript)}], { stdio: 'ignore', env: {} })`,
      "child.unref()",
      "setInterval(() => {}, 1000)",
    ].join(";")
    const foreignSpec: ChildSpec = {
      ...spec,
      command: process.execPath,
      args: ["-e", sleeperScript],
      port,
      healthUrl: `http://127.0.0.1:${port}/health`,
      startupTimeoutMs: 2_000,
      shell: false,
      generationHealthCheck: true,
    } as ChildSpec

    try {
      await assert.rejects(manager.start(foreignSpec), /timeout|generation|startup/i)
    } finally {
      await manager.stop(spec.name)
    }
  })

  it("injects a high-entropy generation that the current child can echo", async () => {
    const port = await getFreePort()
    const tempDir = mkdtempSync(path.join(tmpdir(), "child-manager-generation-"))
    const markerPath = path.join(tempDir, "generation.txt")
    const manager = new ChildProcessManager()
    const generationSpec: ChildSpec = {
      ...spec,
      command: process.execPath,
      args: [
        "-e",
        [
          "const fs = require('node:fs')",
          "const http = require('node:http')",
          "const generation = process.env.ELECTRON_SERVICE_GENERATION || ''",
          `fs.writeFileSync(${JSON.stringify(markerPath)}, generation)`,
          `http.createServer((_req, res) => { res.setHeader('X-Electron-Service-Generation', generation); res.end('ready') }).listen(${port}, '127.0.0.1')`,
        ].join(";"),
      ],
      port,
      healthUrl: `http://127.0.0.1:${port}/health`,
      startupTimeoutMs: 2_000,
      shell: false,
      generationHealthCheck: true,
    } as ChildSpec

    try {
      await manager.start(generationSpec)
      assert.match(readFileSync(markerPath, "utf8"), /^[a-f0-9]{64}$/)
    } finally {
      await manager.stop(spec.name)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("serializes concurrent starts so only the final generation remains alive and tracked", async () => {
    const [firstPort, secondPort] = await Promise.all([getFreePort(), getFreePort()])
    assert.notEqual(firstPort, secondPort)
    const tempDir = mkdtempSync(path.join(tmpdir(), "child-manager-concurrent-"))
    const firstMarker = path.join(tempDir, "first.pid")
    const secondMarker = path.join(tempDir, "second.pid")
    const makeSpec = (port: number, marker: string): ChildSpec => ({
      ...spec,
      command: process.execPath,
      args: [
        "-e",
        [
          "const fs = require('node:fs')",
          "const http = require('node:http')",
          `fs.writeFileSync(${JSON.stringify(marker)}, String(process.pid))`,
          `http.createServer((_req, res) => res.end('ready')).listen(${port}, '127.0.0.1')`,
        ].join(";"),
      ],
      port,
      healthUrl: `http://127.0.0.1:${port}/health`,
      startupTimeoutMs: 5_000,
      shell: false,
    })
    const manager = new ChildProcessManager()
    let pids: number[] = []

    try {
      const results = await Promise.allSettled([
        manager.start(makeSpec(firstPort, firstMarker)),
        manager.start(makeSpec(secondPort, secondMarker)),
      ])
      pids = [firstMarker, secondMarker]
        .filter((marker) => existsSync(marker))
        .map((marker) => Number(readFileSync(marker, "utf8")))

      assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled"])
      assert.equal(pids.filter(isPidAlive).length, 1)
      assert.equal(manager.status(spec.name)?.alive, true)
    } finally {
      await manager.stop(spec.name)
      await Promise.all(pids.map((pid) => killProcessTree(pid)))
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("stopAll aborts a child that is still waiting for readiness", async () => {
    const port = await getFreePort()
    const tempDir = mkdtempSync(path.join(tmpdir(), "child-manager-abort-"))
    const markerPath = path.join(tempDir, "sleeper.pid")
    const manager = new ChildProcessManager({ exitWaitTimeoutMs: 200 })
    const sleeperSpec: ChildSpec = {
      ...spec,
      command: process.execPath,
      args: [
        "-e",
        `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, String(process.pid)); setInterval(() => {}, 1000)`,
      ],
      port,
      healthUrl: `http://127.0.0.1:${port}/health`,
      startupTimeoutMs: 2_000,
      shell: false,
    }
    const startup = manager.start(sleeperSpec)
    const startupOutcome = startup.then(
      () => ({ ok: true as const, error: undefined }),
      (error: unknown) => ({ ok: false as const, error }),
    )
    const deadline = Date.now() + 1_000
    while (!existsSync(markerPath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    assert.ok(existsSync(markerPath))

    try {
      const outcome = await Promise.race([
        manager.stopAll().then(() => "stopped"),
        new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 400)),
      ])
      assert.equal(outcome, "stopped")
      const settledStartup = await startupOutcome
      assert.equal(settledStartup.ok, false)
      assert.match(String(settledStartup.error), /abort|stopp|startup/i)
    } finally {
      await startup.catch(() => {})
      const pid = Number(readFileSync(markerPath, "utf8"))
      await killProcessTree(pid)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("continues startup crashes through exactly three replacement attempts", async () => {
    const port = await getFreePort()
    const tempDir = mkdtempSync(path.join(tmpdir(), "child-manager-retries-"))
    const counterPath = path.join(tempDir, "count.txt")
    const manager = new ChildProcessManager({ restartBackoffBaseMs: 10 } as any)
    const script = [
      "const fs = require('node:fs')",
      "const http = require('node:http')",
      `const file = ${JSON.stringify(counterPath)}`,
      "const count = fs.existsSync(file) ? Number(fs.readFileSync(file, 'utf8')) + 1 : 1",
      "fs.writeFileSync(file, String(count))",
      `if (count === 1) { http.createServer((_req, res) => { res.end('ready'); setTimeout(() => process.exit(1), 50) }).listen(${port}, '127.0.0.1') } else { process.exit(1) }`,
    ].join(";")
    const retrySpec: ChildSpec = {
      ...spec,
      command: process.execPath,
      args: ["-e", script],
      port,
      healthUrl: `http://127.0.0.1:${port}/health`,
      startupTimeoutMs: 1_000,
      shell: false,
    }

    try {
      await manager.start(retrySpec)
      const deadline = Date.now() + 3_000
      while (Date.now() < deadline) {
        if (existsSync(counterPath) && Number(readFileSync(counterPath, "utf8")) >= 4) break
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      assert.equal(Number(readFileSync(counterPath, "utf8")), 4)
      const settleDeadline = Date.now() + 1_000
      while (manager.status(spec.name) !== null && Date.now() < settleDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      assert.equal(manager.status(spec.name), null)
      await new Promise((resolve) => setTimeout(resolve, 150))
      assert.equal(Number(readFileSync(counterPath, "utf8")), 4)
    } finally {
      await manager.stop(spec.name)
      rmSync(tempDir, { recursive: true, force: true })
    }
  })

  it("rejects readiness when this process was terminated by a signal", async () => {
    const server = createServer((_req, res) => {
      setTimeout(() => {
        res.writeHead(200)
        res.end("old service")
      }, 100)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    assert.ok(address && typeof address !== "string")

    const manager = new ChildProcessManager()
    const signaledSpec: ChildSpec = {
      ...spec,
      command: process.execPath,
      args: ["-e", "process.kill(process.pid, 'SIGTERM')"],
      port: 0,
      healthUrl: `http://127.0.0.1:${address.port}/health`,
      startupTimeoutMs: 2_000,
      shell: false,
    }

    try {
      await assert.rejects(
        manager.start(signaledSpec),
        /crashed during startup|exited before becoming ready/,
      )
    } finally {
      await manager.stop(spec.name)
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }
  })

  it("rejects readiness when spawn fails even if another service answers health", async () => {
    const server = createServer((_req, res) => res.end("unrelated health responder"))
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    assert.ok(address && typeof address !== "string")
    const manager = new ChildProcessManager()
    const spawnFailureSpec: ChildSpec = {
      ...spec,
      command: path.join(tmpdir(), `missing-child-${Date.now()}.exe`),
      args: [],
      port: 0,
      healthUrl: `http://127.0.0.1:${address.port}/health`,
      startupTimeoutMs: 2_000,
      shell: false,
    }

    try {
      await assert.rejects(manager.start(spawnFailureSpec), /failed to spawn/i)
    } finally {
      await manager.stop(spec.name)
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve())
      })
    }
  })

  it("waits for the process tree kill to finish before stop resolves", async () => {
    const reservation = createServer()
    await new Promise<void>((resolve) => reservation.listen(0, "127.0.0.1", resolve))
    const address = reservation.address()
    assert.ok(address && typeof address !== "string")
    const port = address.port
    await new Promise<void>((resolve, reject) => {
      reservation.close((error) => error ? reject(error) : resolve())
    })

    const manager = new ChildProcessManager()
    const serverScript = [
      "const http = require('node:http')",
      `http.createServer((_req, res) => res.end('ready')).listen(${port}, '127.0.0.1')`,
    ].join(";")
    const runningSpec: ChildSpec = {
      ...spec,
      command: process.execPath,
      args: ["-e", serverScript],
      port,
      healthUrl: `http://127.0.0.1:${port}/health`,
      startupTimeoutMs: 5_000,
      shell: false,
    }

    const handle = await manager.start(runningSpec)
    let exited = false
    handle.proc.once("exit", () => { exited = true })

    await manager.stop(spec.name)

    assert.equal(exited, true)
    assert.equal((handle as any).logStream.writableEnded, true)
    assert.equal(manager.status(spec.name), null)
    assert.equal(handle.restartCount, 0)
  })
})

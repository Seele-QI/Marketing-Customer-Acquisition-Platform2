import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"
import {
  STARTUP_RECOVERY_DIALOG,
  handleStartupFailure,
} from "../electron/services/startup-recovery.ts"

describe("native startup recovery", () => {
  it("shows only fixed customer-safe copy and invokes restart once", async () => {
    const calls: string[] = []
    let shown: unknown
    const result = await handleStartupFailure({
      showMessageBox: async (options) => {
        shown = options
        return { response: 0 }
      },
      restartApp: async () => {
        calls.push("restart")
        return { ok: true }
      },
      exitApp: async () => { calls.push("exit") },
    })

    assert.equal(result, "restart")
    assert.deepEqual(calls, ["restart"])
    assert.deepEqual(shown, STARTUP_RECOVERY_DIALOG)
    assert.deepEqual(STARTUP_RECOVERY_DIALOG.buttons, ["一键重启程序", "退出程序"])
    assert.doesNotMatch(JSON.stringify(shown), /ECONN|EADDR|Traceback|\.log|127\.0\.0\.1|错误：/i)
  })

  it("uses controlled exit without relaunch when the customer chooses exit", async () => {
    const calls: string[] = []
    const result = await handleStartupFailure({
      showMessageBox: async () => ({ response: 1 }),
      restartApp: async () => {
        calls.push("restart")
        return { ok: true }
      },
      exitApp: async () => { calls.push("exit") },
    })

    assert.equal(result, "exit")
    assert.deepEqual(calls, ["exit"])
  })

  it("wires bootstrap startup failures to the fixed recovery dialog without raw details", () => {
    const source = readFileSync(new URL("../electron/main.ts", import.meta.url), "utf8")
    assert.doesNotMatch(source, /showErrorBox/)
    assert.doesNotMatch(source, /readLogTail\(/)
    assert.match(source, /handleStartupFailure\(/)
    assert.match(source, /restartApp/)
    assert.match(source, /exitApp:\s*quitApp/)
  })
})

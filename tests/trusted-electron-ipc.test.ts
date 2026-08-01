import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isTrustedIpcEvent, isTrustedRendererUrl } from "../electron/services/trusted-ipc.ts"

describe("trusted Electron renderer boundary", () => {
  const webContents = { getURL: () => "http://127.0.0.1:3000/dashboard" }
  const win = { isDestroyed: () => false, webContents }

  it("requires the active window webContents and exact local origin", () => {
    assert.equal(isTrustedIpcEvent({
      sender: webContents,
      senderFrame: { url: "http://127.0.0.1:3000/settings" },
    }, win, "http://127.0.0.1:3000"), true)
    assert.equal(isTrustedIpcEvent({
      sender: {},
      senderFrame: { url: "http://127.0.0.1:3000/settings" },
    }, win, "http://127.0.0.1:3000"), false)
    assert.equal(isTrustedIpcEvent({
      sender: webContents,
      senderFrame: { url: "https://evil.example/" },
    }, win, "http://127.0.0.1:3000"), false)
  })

  it("allows same-origin navigation but never treats external HTTPS as trusted", () => {
    assert.equal(isTrustedRendererUrl("http://127.0.0.1:3000/help", "http://127.0.0.1:3000"), true)
    assert.equal(isTrustedRendererUrl("https://docs.example/", "http://127.0.0.1:3000"), false)
    assert.equal(isTrustedRendererUrl("javascript:alert(1)", "http://127.0.0.1:3000"), false)
    assert.equal(isTrustedRendererUrl("file:///C:/app/index.html#route", "file:///C:/app/index.html"), true)
    assert.equal(isTrustedRendererUrl("file:///C:/app/index.html.evil", "file:///C:/app/index.html"), false)
  })
})

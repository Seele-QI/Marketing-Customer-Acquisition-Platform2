import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { toFriendlyUpdateError } from "../lib/update-error.ts"

describe("toFriendlyUpdateError", () => {
  it("maps net::ERR_CONNECTION_CLOSED to friendly Chinese", () => {
    assert.equal(
      toFriendlyUpdateError("net::ERR_CONNECTION_CLOSED"),
      "无法连接更新服务器，请检查网络或稍后重试",
    )
  })

  it("maps ECONNRESET / ENOTFOUND", () => {
    assert.equal(
      toFriendlyUpdateError("read ECONNRESET"),
      "无法连接更新服务器，请检查网络或稍后重试",
    )
    assert.equal(
      toFriendlyUpdateError("getaddrinfo ENOTFOUND example.com"),
      "无法连接更新服务器，请检查网络或稍后重试",
    )
  })

  it("keeps non-network errors (truncated)", () => {
    const long = "x".repeat(250)
    assert.equal(toFriendlyUpdateError(long), `${"x".repeat(200)}…`)
    assert.equal(toFriendlyUpdateError("SHA512 checksum mismatch"), "SHA512 checksum mismatch")
  })

  it("handles empty", () => {
    assert.equal(toFriendlyUpdateError(""), "更新失败，请稍后重试")
    assert.equal(toFriendlyUpdateError(null), "更新失败，请稍后重试")
  })
})

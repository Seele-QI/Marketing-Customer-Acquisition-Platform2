import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { stripSystemProxy } from "../electron/utils/strip-system-proxy.ts"

describe("stripSystemProxy", () => {
  it("removes proxy keys after merge and sets NO_PROXY=*", () => {
    const merged = stripSystemProxy({
      PATH: "/usr/bin",
      HTTP_PROXY: "http://bad-proxy:7890",
      https_proxy: "http://bad-proxy:7890",
      NEWAPI_KEY: "sk-test",
    })
    assert.equal(merged.HTTP_PROXY, undefined)
    assert.equal(merged.https_proxy, undefined)
    assert.equal(merged.NO_PROXY, "*")
    assert.equal(merged.NEWAPI_KEY, "sk-test")
    assert.equal(merged.PATH, "/usr/bin")
  })
})

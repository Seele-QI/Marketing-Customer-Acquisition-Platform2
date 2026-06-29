import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { parseApiDetail, parseApiErrorResponse } from "@/lib/api/parse-detail.ts"

describe("parseApiDetail", () => {
  it("returns string detail", () => {
    assert.equal(parseApiDetail("hello"), "hello")
  })

  it("returns object message", () => {
    assert.equal(
      parseApiDetail({ code: "NOT_LOGGED_IN", message: "请先登录" }),
      "请先登录",
    )
  })

  it("falls back when unknown", () => {
    assert.equal(parseApiDetail(null, "fallback"), "fallback")
  })
})

describe("parseApiErrorResponse", () => {
  it("maps 401 to login hint", () => {
    assert.equal(
      parseApiErrorResponse(401, { detail: { code: "NOT_LOGGED_IN", message: "请先登录" } }),
      "请先登录",
    )
  })

  it("maps 402 to credit hint", () => {
    assert.equal(
      parseApiErrorResponse(402, { detail: { code: "INSUFFICIENT_CREDIT" } }),
      "积分不足，请充值",
    )
  })
})

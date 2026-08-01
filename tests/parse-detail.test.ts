import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { parseApiDetail, parseApiErrorResponse } from "@/lib/api/parse-detail.ts"
import { CUSTOMER_ERROR_MESSAGES } from "@/lib/api/customer-network-error.ts"

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
    assert.equal(
      parseApiErrorResponse(401, { detail: { code: "NOT_LOGGED_IN" } }),
      "请先登录",
    )
  })

  it("maps 402 to credit hint", () => {
    assert.equal(
      parseApiErrorResponse(402, { detail: { code: "INSUFFICIENT_CREDIT" } }),
      "积分不足，请充值",
    )
  })

  it("preserves model permission business errors", () => {
    assert.equal(
      parseApiErrorResponse(403, { detail: { code: "MODEL_PERMISSION_DENIED", message: "当前模型无调用权限" } }),
      "当前模型无调用权限",
    )
  })

  it("maps known service and timeout failures without leaking technical codes", () => {
    const cases: Array<[number, unknown, string]> = [
      [503, { code: "SERVICE_CONFIG_UPDATING" }, CUSTOMER_ERROR_MESSAGES.updating],
      [503, { code: "CONFIG_UPDATE_FAILED" }, CUSTOMER_ERROR_MESSAGES.updateFailed],
      [503, { code: "FASTAPI_UNAVAILABLE" }, CUSTOMER_ERROR_MESSAGES.localUnavailable],
      [503, { code: "FASTAPI_PROXY_FAILED", cause: "connect ECONNREFUSED" }, CUSTOMER_ERROR_MESSAGES.localUnavailable],
      [503, { code: "CLOUD_SERVICE_UNAVAILABLE" }, CUSTOMER_ERROR_MESSAGES.cloudUnavailable],
      [502, { message: "bad gateway" }, CUSTOMER_ERROR_MESSAGES.cloudUnavailable],
      [504, { code: "UPSTREAM_TIMEOUT", message: "gateway timeout" }, CUSTOMER_ERROR_MESSAGES.timeout],
    ]
    for (const [status, detail, expected] of cases) {
      const result = parseApiErrorResponse(status, { detail }, "请求失败", { runtime: "desktop" })
      assert.equal(result, expected)
      assert.doesNotMatch(result, /FASTAPI_|ECONNREFUSED|Failed to fetch|UPSTREAM_TIMEOUT/i)
    }
  })

  it("maps local FastAPI failures by runtime without telling web users to restart the app", () => {
    for (const code of ["FASTAPI_UNAVAILABLE", "FASTAPI_PROXY_FAILED", "LOCAL_SERVICE_UNAVAILABLE"]) {
      const webMessage = parseApiErrorResponse(
        503,
        { detail: { code } },
        "请求失败",
        { runtime: "web" },
      )
      assert.equal(webMessage, CUSTOMER_ERROR_MESSAGES.generic)
      assert.doesNotMatch(webMessage, /重启程序/)

      assert.equal(
        parseApiErrorResponse(
          503,
          { detail: { code } },
          "请求失败",
          { runtime: "desktop" },
        ),
        CUSTOMER_ERROR_MESSAGES.localUnavailable,
      )
    }
  })

  it("sanitizes unknown technical details", () => {
    const result = parseApiErrorResponse(500, {
      detail: { code: "FASTAPI_MYSTERY", message: "connect ECONNREFUSED 127.0.0.1:8010" },
    })
    assert.equal(result, CUSTOMER_ERROR_MESSAGES.generic)
    assert.doesNotMatch(result, /FASTAPI_|ECONNREFUSED/i)
    assert.equal(
      parseApiErrorResponse(500, { detail: { code: "INTERNAL_SERVER_ERROR" } }),
      CUSTOMER_ERROR_MESSAGES.generic,
    )
  })

  it("uses a generic Chinese fallback for every unknown 503", () => {
    assert.equal(
      parseApiErrorResponse(503, { detail: { code: "SOMETHING_NEW", message: "HTTP 503" } }),
      CUSTOMER_ERROR_MESSAGES.generic,
    )
    assert.equal(
      parseApiErrorResponse(503, { detail: "temporary upstream failure" }),
      CUSTOMER_ERROR_MESSAGES.generic,
    )
  })
})

import { describe, it } from "node:test"
import assert from "node:assert/strict"

import { parseAccountAuthResponse } from "@/lib/api/account-auth-response.ts"
import { CUSTOMER_ERROR_MESSAGES } from "@/lib/api/customer-network-error.ts"

describe("account auth response parsing", () => {
  it("maps non-JSON 502 and 503 responses to Chinese customer messages", async () => {
    const cases: Array<[number, string]> = [
      [502, CUSTOMER_ERROR_MESSAGES.cloudUnavailable],
      [503, CUSTOMER_ERROR_MESSAGES.generic],
    ]
    for (const [status, expected] of cases) {
      const response = new Response("<html>upstream unavailable</html>", {
        status,
        headers: { "content-type": "text/html" },
      })
      await assert.rejects(
        parseAccountAuthResponse(response, { runtime: "web" }),
        (error: unknown) => {
          assert.ok(error instanceof Error)
          assert.equal(error.message, expected)
          assert.doesNotMatch(error.message, /Unexpected token|Unexpected end|is not valid JSON|<html>/i)
          return true
        },
      )
    }
  })

  it("does not accept an invalid JSON success response or expose its parser exception", async () => {
    await assert.rejects(
      parseAccountAuthResponse(new Response("{invalid", { status: 200 }), { runtime: "web" }),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.equal(error.message, CUSTOMER_ERROR_MESSAGES.generic)
        assert.doesNotMatch(error.message, /Unexpected token|Unexpected end|is not valid JSON/i)
        return true
      },
    )
  })

  it("preserves desktop local-service mapping for a valid error payload", async () => {
    await assert.rejects(
      parseAccountAuthResponse(
        Response.json({ detail: { code: "FASTAPI_UNAVAILABLE" } }, { status: 503 }),
        { runtime: "desktop" },
      ),
      { message: CUSTOMER_ERROR_MESSAGES.localUnavailable },
    )
  })
})

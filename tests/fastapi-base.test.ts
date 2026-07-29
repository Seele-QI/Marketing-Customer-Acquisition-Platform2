import { describe, it, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert/strict"
import { CUSTOMER_ERROR_MESSAGES } from "../lib/api/customer-network-error.ts"

describe("fastapi-base URL split", () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
  })

  afterEach(() => {
    process.env = env
  })

  it("getServerFastapiBase prefers FASTAPI_URL", async () => {
    process.env.FASTAPI_URL = "http://api:8000"
    process.env.NEXT_PUBLIC_FASTAPI_URL = "https://api.example.com"
    const mod = await import("../lib/fastapi-base.ts?" + Date.now())
    assert.equal(mod.getServerFastapiBase(), "http://api:8000")
    assert.equal(mod.getFastapiBase(), "https://api.example.com")
  })

  it("getServerFastapiBase falls back to NEXT_PUBLIC in production", async () => {
    process.env.NODE_ENV = "production"
    delete process.env.FASTAPI_URL
    process.env.NEXT_PUBLIC_FASTAPI_URL = "https://api.example.com"
    const mod = await import("../lib/fastapi-base.ts?" + Date.now())
    assert.equal(mod.getServerFastapiBase(), "https://api.example.com")
  })
})

describe("fastapi-base proxy timeout", () => {
  const env = process.env
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    process.env = { ...env }
  })

  afterEach(() => {
    process.env = env
    globalThis.fetch = originalFetch
  })

  it("proxyToFastapi returns FASTAPI_PROXY_TIMEOUT on AbortError", async () => {
    process.env.FASTAPI_URL = "http://api:8000"
    process.env.FASTAPI_PROXY_TIMEOUT_MS = "100"
    globalThis.fetch = mock.fn(async () => {
      const err = new Error("The operation was aborted")
      err.name = "TimeoutError"
      throw err
    }) as typeof fetch

    const mod = await import("../lib/fastapi-base.ts?" + Date.now())
    const req = new Request("http://localhost/api/geo/matrix-projects", { method: "GET" })
    const resp = await mod.proxyToFastapi(req, "/api/geo/matrix-projects")
    assert.equal(resp.status, 503)
    const body = (await resp.json()) as { detail: { code: string; message: string } }
    assert.equal(body.detail.code, "FASTAPI_PROXY_TIMEOUT")
    assert.equal(body.detail.message, CUSTOMER_ERROR_MESSAGES.timeout)
    assert.equal(resp.headers.get("x-client-service-error"), "timeout")
  })

  it("proxyToFastapi hides local service implementation details", async () => {
    process.env.FASTAPI_URL = "http://api:8000"
    globalThis.fetch = mock.fn(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:8010")
    }) as typeof fetch

    const mod = await import("../lib/fastapi-base.ts?friendly=" + Date.now())
    const req = new Request("http://localhost/api/jobs", { method: "GET" })
    const resp = await mod.proxyToFastapi(req, "/api/jobs")
    const body = (await resp.json()) as { detail: { code: string; message: string; cause?: string } }
    assert.equal(body.detail.code, "FASTAPI_PROXY_FAILED")
    assert.equal(body.detail.message, CUSTOMER_ERROR_MESSAGES.localUnavailable)
    assert.equal(resp.headers.get("x-client-service-error"), "local_service")
    assert.doesNotMatch(body.detail.message, /FastAPI|pnpm|ECONNREFUSED/i)
  })

  it("fastapiPathWithQuery preserves batch_id for redeem-codes/items", async () => {
    const mod = await import("../lib/fastapi-base.ts?" + Date.now())
    const req = new Request(
      "http://localhost/api/credit/redeem-codes/items?batch_id=batch_1784_abc",
      { method: "GET" },
    )
    assert.equal(
      mod.fastapiPathWithQuery(req, "/api/credit/redeem-codes/items"),
      "/api/credit/redeem-codes/items?batch_id=batch_1784_abc",
    )
  })
})

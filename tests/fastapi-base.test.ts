import { describe, it, beforeEach, afterEach, mock } from "node:test"
import assert from "node:assert/strict"

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
    assert.match(body.detail.message, /超时/)
  })
})

import { describe, it, beforeEach, afterEach } from "node:test"
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
    const mod = await import("../lib/fastapi-base.ts")
    assert.equal(mod.getServerFastapiBase(), "http://api:8000")
    assert.equal(mod.getFastapiBase(), "https://api.example.com")
  })

  it("getServerFastapiBase falls back to NEXT_PUBLIC in production", async () => {
    process.env.NODE_ENV = "production"
    delete process.env.FASTAPI_URL
    process.env.NEXT_PUBLIC_FASTAPI_URL = "https://api.example.com"
    const mod = await import("../lib/fastapi-base.ts")
    assert.equal(mod.getServerFastapiBase(), "https://api.example.com")
  })
})

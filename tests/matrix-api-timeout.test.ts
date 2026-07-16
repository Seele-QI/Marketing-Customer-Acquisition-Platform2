import { describe, it, mock, afterEach } from "node:test"
import assert from "node:assert/strict"

describe("matrix-api CRUD timeout", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("createMatrixProject maps TimeoutError to readable message", async () => {
    globalThis.fetch = mock.fn(async () => {
      const err = new DOMException("The operation was aborted due to timeout", "TimeoutError")
      throw err
    }) as typeof fetch

    const { createMatrixProject } = await import("../lib/geo/matrix-api.ts?" + Date.now())
    await assert.rejects(
      () => createMatrixProject("测试项目"),
      (err: unknown) =>
        err instanceof Error && /新建项目失败.*超时/.test(err.message),
    )
  })

  it("generateMatrixProject keeps long timeout path distinct from CRUD", async () => {
    let seenSignal: AbortSignal | null | undefined
    globalThis.fetch = mock.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      seenSignal = init?.signal
      return new Response(JSON.stringify({ project: { id: "p1", name: "x" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    }) as typeof fetch

    const { generateMatrixProject } = await import("../lib/geo/matrix-api.ts?" + Date.now())
    await generateMatrixProject("p1", {
      platforms: ["xiaohongshu"],
      provider: "deepseek",
    })
    assert.ok(seenSignal)
    assert.equal(typeof seenSignal!.aborted, "boolean")
  })
})

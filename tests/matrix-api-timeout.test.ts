import { describe, it, mock, afterEach } from "node:test"
import assert from "node:assert/strict"

describe("matrix-api CRUD timeout", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
    mock.restoreAll()
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
    let seenTimeoutMs = 0
    mock.method(AbortSignal, "timeout", (timeoutMs: number) => {
      seenTimeoutMs = timeoutMs
      return new AbortController().signal
    })
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
    })
    assert.ok(seenSignal)
    assert.equal(typeof seenSignal!.aborted, "boolean")
    assert.ok(
      seenTimeoutMs > 180_000,
      `客户端生成超时 ${seenTimeoutMs}ms 必须长于服务端 180s 执行上限`,
    )
  })

  it("reconciles a generated matrix after the POST response times out", async () => {
    let calls = 0
    globalThis.fetch = mock.fn(async (url: string | URL | Request) => {
      calls += 1
      if (String(url).endsWith("/generate")) {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError")
      }
      return new Response(
        JSON.stringify({
          project: {
            id: "p-recovered",
            name: "已完成项目",
            platforms: ["xiaohongshu"],
            updatedAt: Date.now() + 1,
            matrix: {
              generatedAt: new Date().toISOString(),
              platforms: [{ platformId: "xiaohongshu", cells: [{ title: "已生成" }] }],
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }) as typeof fetch

    const { generateMatrixProject } = await import("../lib/geo/matrix-api.ts?" + Date.now())
    const project = await generateMatrixProject("p-recovered", {
      platforms: ["xiaohongshu"],
    })

    assert.equal(project.matrix.platforms[0]?.cells[0]?.title, "已生成")
    assert.equal(calls, 2)
  })
})

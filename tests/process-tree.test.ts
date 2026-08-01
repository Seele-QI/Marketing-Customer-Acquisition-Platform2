import assert from "node:assert/strict"
import { createServer } from "node:http"
import { describe, it } from "node:test"
import { waitForHttpReady } from "../electron/utils/process-tree.ts"

async function withServer(
  generation: string,
  run: (url: string) => Promise<void>,
  status = 200,
): Promise<void> {
  const server = createServer((_req, res) => {
    res.statusCode = status
    res.setHeader("X-Electron-Service-Generation", generation)
    res.end("ok")
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  assert.ok(address && typeof address !== "string")
  try {
    await run(`http://127.0.0.1:${address.port}/health`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}

describe("waitForHttpReady generation identity", () => {
  it("accepts an exact generation response header", async () => {
    await withServer("generation-current", async (url) => {
      await waitForHttpReady(url, 200, 10, {
        expectedHeader: {
          name: "X-Electron-Service-Generation",
          value: "generation-current",
        },
      })
    })
  })

  it("does not accept a response from an old generation", async () => {
    await withServer("generation-old", async (url) => {
      await assert.rejects(
        waitForHttpReady(url, 80, 10, {
          expectedHeader: {
            name: "X-Electron-Service-Generation",
            value: "generation-current",
          },
        }),
        /timeout/,
      )
    })
  })

  it("does not accept a degraded 503 response even with the exact generation", async () => {
    await withServer("generation-current", async (url) => {
      await assert.rejects(
        waitForHttpReady(url, 80, 10, {
          expectedHeader: {
            name: "X-Electron-Service-Generation",
            value: "generation-current",
          },
        }),
        /timeout/,
      )
    }, 503)
  })

  it("requires a successful 2xx response for generic health checks", async () => {
    await withServer("unused", async (url) => {
      await assert.rejects(waitForHttpReady(url, 80, 10), /timeout/)
    }, 503)
  })

  it("aborts an in-flight readiness wait", async () => {
    const controller = new AbortController()
    const startedAt = Date.now()
    const waiting = waitForHttpReady("http://127.0.0.1:1/health", 60_000, 500, {
      signal: controller.signal,
    })
    controller.abort()

    await assert.rejects(waiting, /abort/i)
    assert.ok(Date.now() - startedAt < 300)
  })
})

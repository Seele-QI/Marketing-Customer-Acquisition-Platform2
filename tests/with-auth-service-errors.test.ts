import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"

import {
  createServiceUnavailableResponse,
  getCloudApiServiceErrorCategory,
} from "@/lib/fastapi-base.ts"
import { CUSTOMER_ERROR_MESSAGES } from "@/lib/api/customer-network-error.ts"
import {
  authProbeErrorResponse,
  chargeCredit,
  chargeErrorResponse,
  withAuth,
} from "@/lib/api/with-auth.ts"

async function routeFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(dir, entry.name)
    return entry.isDirectory() ? routeFiles(path) : [path]
  }))
  return files.flat().filter((path) => path.endsWith("route.ts"))
}

describe("withAuth service-unavailable contract", () => {
  it("retries a transient auth-probe transport failure before rejecting the request", async () => {
    const previousCloud = process.env.CLOUD_API_URL
    const previousFetch = globalThis.fetch
    let calls = 0
    try {
      process.env.CLOUD_API_URL = "https://cloud.example.com"
      globalThis.fetch = async () => {
        calls += 1
        if (calls === 1) throw new TypeError("fetch failed")
        return Response.json({ user: { id: 7 } })
      }

      const handler = withAuth(async (_request, context) =>
        Response.json({ userId: context.userId }),
      )
      const response = await handler(new Request("http://localhost/api/test"))

      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { userId: 7 })
      assert.equal(calls, 2)
    } finally {
      globalThis.fetch = previousFetch
      if (previousCloud === undefined) delete process.env.CLOUD_API_URL
      else process.env.CLOUD_API_URL = previousCloud
    }
  })

  it("retries a transient auth-probe 503 before rejecting the request", async () => {
    const previousCloud = process.env.CLOUD_API_URL
    const previousFetch = globalThis.fetch
    let calls = 0
    try {
      process.env.CLOUD_API_URL = "https://cloud.example.com"
      globalThis.fetch = async () => {
        calls += 1
        if (calls === 1) return new Response("temporary outage", { status: 503 })
        return Response.json({ user: { id: 8 } })
      }

      const handler = withAuth(async (_request, context) =>
        Response.json({ userId: context.userId }),
      )
      const response = await handler(new Request("http://localhost/api/test"))

      assert.equal(response.status, 200)
      assert.deepEqual(await response.json(), { userId: 8 })
      assert.equal(calls, 2)
    } finally {
      globalThis.fetch = previousFetch
      if (previousCloud === undefined) delete process.env.CLOUD_API_URL
      else process.env.CLOUD_API_URL = previousCloud
    }
  })

  it("serializes business-task billing context on fixed credit charges", async () => {
    const previousCloud = process.env.CLOUD_API_URL
    const previousFastapi = process.env.FASTAPI_URL
    const previousFetch = globalThis.fetch
    let captured: Record<string, unknown> = {}
    try {
      delete process.env.CLOUD_API_URL
      process.env.FASTAPI_URL = "http://127.0.0.1:8000"
      globalThis.fetch = async (_input, init) => {
        captured = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>
        return Response.json({ balance: 80, cost: 20 })
      }

      await chargeCredit({
        cookieHeader: "session_id=safe",
        scene: "dh_v2_plan_script",
        refId: "video-1:plan",
        businessTask: {
          businessTaskId: "video-1",
          businessType: "video_digital_human",
          billingStage: "script",
        },
      })

      assert.equal(captured.business_task_id, "video-1")
      assert.equal(captured.business_type, "video_digital_human")
      assert.equal(captured.billing_stage, "script")
    } finally {
      globalThis.fetch = previousFetch
      if (previousCloud === undefined) delete process.env.CLOUD_API_URL
      else process.env.CLOUD_API_URL = previousCloud
      if (previousFastapi === undefined) delete process.env.FASTAPI_URL
      else process.env.FASTAPI_URL = previousFastapi
    }
  })

  it("returns customer-safe local and cloud 503 responses with a classification header", async () => {
    for (const [category, code, message] of [
      ["local_service", "LOCAL_SERVICE_UNAVAILABLE", CUSTOMER_ERROR_MESSAGES.localUnavailable],
      ["cloud_service", "CLOUD_SERVICE_UNAVAILABLE", CUSTOMER_ERROR_MESSAGES.cloudUnavailable],
    ] as const) {
      const response = createServiceUnavailableResponse(category)
      assert.equal(response.status, 503)
      assert.equal(response.headers.get("x-client-service-error"), category)
      const body = await response.json() as { detail: { code: string; message: string } }
      assert.deepEqual(body, { detail: { code, message } })
      assert.doesNotMatch(JSON.stringify(body), /FASTAPI_UNAVAILABLE|ECONNREFUSED|无法连接后端服务|后端服务未配置/i)
    }
  })

  it("classifies the actual cloud base semantics explicitly", () => {
    const previous = process.env.CLOUD_API_URL
    try {
      delete process.env.CLOUD_API_URL
      assert.equal(getCloudApiServiceErrorCategory(), "local_service")
      process.env.CLOUD_API_URL = "https://cloud.example.com"
      assert.equal(getCloudApiServiceErrorCategory(), "cloud_service")
    } finally {
      if (previous === undefined) delete process.env.CLOUD_API_URL
      else process.env.CLOUD_API_URL = previous
    }
  })

  it("converts charge-path transport failures to the same safe 503 contract", async () => {
    const previousCloud = process.env.CLOUD_API_URL
    const previousFastapi = process.env.FASTAPI_URL
    const previousFetch = globalThis.fetch
    try {
      globalThis.fetch = async () => {
        throw new TypeError("connect ECONNREFUSED secret.internal:8010")
      }
      for (const [cloudBase, fastapiBase, expectedCategory] of [
        ["https://cloud.example.com", undefined, "cloud_service"],
        [undefined, "http://127.0.0.1:8000", "local_service"],
      ] as const) {
        if (cloudBase) process.env.CLOUD_API_URL = cloudBase
        else delete process.env.CLOUD_API_URL
        if (fastapiBase) process.env.FASTAPI_URL = fastapiBase
        else delete process.env.FASTAPI_URL

        let failure: unknown
        try {
          await chargeCredit({ cookieHeader: "session_id=safe", scene: "test", refId: "r1" })
        } catch (error) {
          failure = error
        }
        const response = chargeErrorResponse(failure)
        assert.equal(response.status, 503)
        assert.equal(response.headers.get("x-client-service-error"), expectedCategory)
        assert.doesNotMatch(await response.text(), /ECONNREFUSED|secret\.internal|FASTAPI_UNAVAILABLE/i)
      }
    } finally {
      globalThis.fetch = previousFetch
      if (previousCloud === undefined) delete process.env.CLOUD_API_URL
      else process.env.CLOUD_API_URL = previousCloud
      if (previousFastapi === undefined) delete process.env.FASTAPI_URL
      else process.env.FASTAPI_URL = previousFastapi
    }
  })

  it("surfaces an unregistered cloud billing scene as configuration error", async () => {
    const previousCloud = process.env.CLOUD_API_URL
    const previousFetch = globalThis.fetch
    try {
      process.env.CLOUD_API_URL = "https://cloud.example.com"
      globalThis.fetch = async () =>
        Response.json(
          {
            detail: {
              code: "INVALID_SCENE",
              message: "不支持的消费场景",
            },
          },
          { status: 400 },
        )

      let failure: unknown
      try {
        await chargeCredit({
          cookieHeader: "session_id=safe",
          scene: "image_creation",
          refId: "image-1",
        })
      } catch (error) {
        failure = error
      }

      const response = chargeErrorResponse(failure)
      assert.equal(response.status, 503)
      assert.match(await response.text(), /计费项目未配置/)
    } finally {
      globalThis.fetch = previousFetch
      if (previousCloud === undefined) delete process.env.CLOUD_API_URL
      else process.env.CLOUD_API_URL = previousCloud
    }
  })

  it("keeps resolved auth-probe 503 as service unavailable for cloud and FastAPI fallback", async () => {
    const previousCloud = process.env.CLOUD_API_URL
    const previousFastapi = process.env.FASTAPI_URL
    try {
      for (const [cloudBase, fastapiBase, expectedCategory, expectedMessage] of [
        [
          "https://cloud.example.com",
          undefined,
          "cloud_service",
          CUSTOMER_ERROR_MESSAGES.cloudUnavailable,
        ],
        [
          undefined,
          "http://127.0.0.1:8000",
          "local_service",
          CUSTOMER_ERROR_MESSAGES.localUnavailable,
        ],
      ] as const) {
        if (cloudBase) process.env.CLOUD_API_URL = cloudBase
        else delete process.env.CLOUD_API_URL
        if (fastapiBase) process.env.FASTAPI_URL = fastapiBase
        else delete process.env.FASTAPI_URL

        const response = authProbeErrorResponse(new Response("unsafe upstream body", { status: 503 }))
        assert.ok(response)
        assert.equal(response.status, 503)
        assert.equal(response.headers.get("x-client-service-error"), expectedCategory)
        const body = await response.json() as { detail: { message: string } }
        assert.equal(body.detail.message, expectedMessage)
        assert.doesNotMatch(JSON.stringify(body), /unsafe upstream body|HTTP 503/i)
      }
    } finally {
      if (previousCloud === undefined) delete process.env.CLOUD_API_URL
      else process.env.CLOUD_API_URL = previousCloud
      if (previousFastapi === undefined) delete process.env.FASTAPI_URL
      else process.env.FASTAPI_URL = previousFastapi
    }
  })

  it("keeps auth-probe 401 and 403 as the business signed-out response", async () => {
    for (const status of [401, 403]) {
      const response = authProbeErrorResponse(new Response(null, { status }))
      assert.ok(response)
      assert.equal(response.status, 401)
      assert.equal(response.headers.get("x-client-service-error"), null)
      assert.deepEqual(await response.json(), {
        detail: { code: "NOT_LOGGED_IN", message: "请先登录" },
      })
    }
  })

  it("protects every route using the one shared withAuth boundary", async () => {
    const root = new URL("../app", import.meta.url).pathname.replace(/^\/(.:\/)/, "$1")
    const files = await routeFiles(root)
    const sources = await Promise.all(files.map(async (file) => [file, await readFile(file, "utf8")] as const))
    const protectedRoutes = sources.filter(([, source]) => source.includes("withAuth"))
    assert.ok(protectedRoutes.length >= 20, `expected broad withAuth coverage, got ${protectedRoutes.length}`)
    for (const [file, source] of protectedRoutes) {
      assert.match(source, /from ["']@\/lib\/api\/with-auth["']/, file)
    }

    const wrapper = await readFile(new URL("../lib/api/with-auth.ts", import.meta.url), "utf8")
    assert.match(wrapper, /const category = getCloudApiServiceErrorCategory\(\)/)
    assert.match(wrapper, /createServiceUnavailableResponse\((?:error|e)\.category\)/)
    assert.doesNotMatch(wrapper, /后端服务未配置|无法连接后端服务/)
  })
})

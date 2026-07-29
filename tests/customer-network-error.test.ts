import { describe, it } from "node:test"
import assert from "node:assert/strict"

import {
  CUSTOMER_ERROR_MESSAGES,
  FriendlyNetworkError,
  classifyNetworkFailure,
  createClientErrorReport,
  getCustomerFacingErrorMessage,
  installFetchErrorGuard,
  createRecoveryIncidentDeduper,
  getRecoveryIncidentKey,
  shouldShowGlobalNetworkErrorToast,
} from "@/lib/api/customer-network-error.ts"

describe("customer network error messages", () => {
  it("keeps the five approved customer messages exact", () => {
    assert.deepEqual(
      {
        updating: CUSTOMER_ERROR_MESSAGES.updating,
        updateFailed: CUSTOMER_ERROR_MESSAGES.updateFailed,
        localUnavailable: CUSTOMER_ERROR_MESSAGES.localUnavailable,
        cloudUnavailable: CUSTOMER_ERROR_MESSAGES.cloudUnavailable,
        timeout: CUSTOMER_ERROR_MESSAGES.timeout,
      },
      {
        updating: "正在应用最新模型配置，客户端服务通常会在15秒内恢复，请稍后重新操作。",
        updateFailed: "客户端服务更新未完成，请重启程序后再试。",
        localUnavailable: "客户端服务暂时无法连接，请重启程序后再试。",
        cloudUnavailable: "当前网络无法连接云端服务，请检查网络后重试。",
        timeout: "服务器响应较慢，请稍后重试。",
      },
    )
  })

  it("uses runtime state before URL classification", () => {
    assert.equal(
      classifyNetworkFailure("/api/auth/login", new TypeError("Failed to fetch"), {
        runtimeState: "updating",
        origin: "http://127.0.0.1:3210",
      }).category,
      "updating",
    )
    assert.equal(
      classifyNetworkFailure("/api/auth/login", new Error("ECONNREFUSED"), {
        runtimeState: "failed",
        origin: "http://127.0.0.1:3210",
      }).category,
      "update_failed",
    )
  })

  it("distinguishes local, cloud, and timeout failures", () => {
    assert.equal(
      classifyNetworkFailure("http://127.0.0.1:8010/health", new Error("fetch failed"), {
        runtimeState: "ready",
        origin: "http://127.0.0.1:3210",
        isDesktop: true,
        localServiceOrigins: ["http://127.0.0.1:8010"],
      }).category,
      "local_service",
    )
    assert.equal(
      classifyNetworkFailure("https://api.example.com/v1/models", new Error("fetch failed"), {
        runtimeState: "ready",
        origin: "http://127.0.0.1:3210",
      }).category,
      "cloud_service",
    )
    assert.equal(
      classifyNetworkFailure("https://api.example.com/v1/models", new DOMException("aborted", "TimeoutError"), {
        runtimeState: "ready",
        origin: "http://127.0.0.1:3210",
      }).category,
      "timeout",
    )
  })

  it("does not treat an unrelated loopback debug collector as a recoverable client service", () => {
    const error = classifyNetworkFailure(
      "http://127.0.0.1:7359/ingest/debug-session",
      new TypeError("Failed to fetch"),
      {
        runtimeState: "ready",
        origin: "http://127.0.0.1:3010",
        isDesktop: true,
        localServiceOrigins: ["http://127.0.0.1:8010"],
      },
    )

    assert.equal(error.category, "unknown")
    assert.equal(getRecoveryIncidentKey(error.category), null)
  })

  it("never tells a web user to restart the desktop app for a same-origin rejection", () => {
    const error = classifyNetworkFailure("/api/auth/login", new TypeError("Failed to fetch"), {
      runtimeState: "ready",
      origin: "https://app.example.com",
      isDesktop: false,
    })
    assert.equal(error.category, "unknown")
    assert.equal(error.message, CUSTOMER_ERROR_MESSAGES.generic)
    assert.doesNotMatch(error.message, /重启程序/)
  })

  it("never exposes raw transport diagnostics", () => {
    for (const raw of [
      new TypeError("Failed to fetch"),
      new Error("connect ECONNREFUSED 127.0.0.1:8010"),
      new Error("FASTAPI_UNAVAILABLE"),
    ]) {
      const message = getCustomerFacingErrorMessage(raw)
      assert.doesNotMatch(message, /Failed to fetch|ECONNREFUSED|FASTAPI_/i)
    }
  })

  it("preserves clear business errors", () => {
    assert.equal(getCustomerFacingErrorMessage(new Error("账号或密码错误")), "账号或密码错误")
    assert.equal(getCustomerFacingErrorMessage(new Error("当前模型无调用权限")), "当前模型无调用权限")
  })
})

describe("fetch error guard", () => {
  it("does not open local recovery for a rejected optional loopback request", async () => {
    let receivedCategory = ""
    let recoveries = 0
    const target = {
      fetch: async () => {
        throw new TypeError("Failed to fetch")
      },
    }
    const uninstall = installFetchErrorGuard({
      target,
      origin: "http://127.0.0.1:3010",
      isDesktop: true,
      localServiceOrigins: ["http://127.0.0.1:8010"],
      onFriendlyError: (error) => { receivedCategory = error.category },
      onLocalRecovery: () => { recoveries += 1 },
    })

    await assert.rejects(
      target.fetch("http://127.0.0.1:7359/ingest/debug-session"),
      (error: unknown) => error instanceof FriendlyNetworkError && error.category === "unknown",
    )
    assert.equal(receivedCategory, "unknown")
    assert.equal(recoveries, 0)
    uninstall()
  })

  it("wraps a rejected POST once without replaying it", async () => {
    let calls = 0
    const reports: unknown[] = []
    const target = {
      fetch: async () => {
        calls += 1
        throw new TypeError("Failed to fetch")
      },
    }
    const uninstall = installFetchErrorGuard({
      target,
      origin: "http://127.0.0.1:3210",
      isDesktop: true,
      getRuntimeState: () => "ready",
      report: (payload) => {
        reports.push(payload)
      },
    })

    await assert.rejects(
      target.fetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ login_name: "secret-user", password: "secret-pass" }),
      }),
      (error: unknown) => {
        assert.ok(error instanceof FriendlyNetworkError)
        assert.equal(error.message, CUSTOMER_ERROR_MESSAGES.localUnavailable)
        assert.ok(error.cause instanceof TypeError)
        return true
      },
    )

    assert.equal(calls, 1)
    assert.deepEqual(reports, [
      {
        category: "local_service",
        requestPath: "/api/auth/login",
        timestamp: reports[0] && (reports[0] as { timestamp: string }).timestamp,
      },
    ])
    assert.doesNotMatch(JSON.stringify(reports), /secret-user|secret-pass|login_name|password/)
    uninstall()
  })

  it("installs only one wrapper and restores it after the last subscriber", async () => {
    const original = async () => new Response("ok")
    const target = { fetch: original }
    const offA = installFetchErrorGuard({ target, origin: "http://localhost:3000" })
    const wrapped = target.fetch
    const offB = installFetchErrorGuard({ target, origin: "http://localhost:3000" })
    assert.equal(target.fetch, wrapped)
    offA()
    assert.equal(target.fetch, wrapped)
    offB()
    assert.equal(target.fetch, original)
  })

  it("uses the newest registration and reports local recovery without consuming the response", async () => {
    let mode: "fail" | "ok" = "fail"
    const response = new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    })
    const target = {
      fetch: async () => {
        if (mode === "fail") throw new TypeError("Failed to fetch")
        return response
      },
    }
    let oldErrors = 0
    let newErrors = 0
    let recoveries = 0
    const offOld = installFetchErrorGuard({
      target,
      origin: "http://127.0.0.1:3000",
      isDesktop: true,
      onFriendlyError: () => { oldErrors += 1 },
    })
    const offNew = installFetchErrorGuard({
      target,
      origin: "http://127.0.0.1:3000",
      isDesktop: true,
      onFriendlyError: () => { newErrors += 1 },
      onLocalRecovery: () => { recoveries += 1 },
    })
    await assert.rejects(target.fetch("/api/health"), FriendlyNetworkError)
    assert.equal(oldErrors, 0)
    assert.equal(newErrors, 1)
    mode = "ok"
    const received = await target.fetch("/api/health")
    assert.equal(received, response)
    assert.equal(recoveries, 1)
    assert.deepEqual(await received.json(), { ok: true })
    offNew()
    offOld()
  })

  it("keeps a local incident through 503, handles its safe header, and clears only after 200", async () => {
    const responses: Array<Response | Error> = [
      new TypeError("Failed to fetch"),
      Response.json(
        { detail: { code: "FASTAPI_PROXY_FAILED" } },
        { status: 503, headers: { "X-Client-Service-Error": "local_service" } },
      ),
      Response.json({ ok: true }),
      new TypeError("Failed to fetch"),
    ]
    const target = {
      fetch: async () => {
        const next = responses.shift()!
        if (next instanceof Error) throw next
        return next
      },
    }
    const deduper = createRecoveryIncidentDeduper()
    let dialogs = 0
    let recoveries = 0
    let reports = 0
    const uninstall = installFetchErrorGuard({
      target,
      origin: "http://127.0.0.1:3000",
      isDesktop: true,
      onFriendlyError: (error) => {
        if (error.category === "local_service" && deduper.markIfNew("recovery:local_service")) {
          dialogs += 1
        }
      },
      onLocalRecovery: () => {
        recoveries += 1
        deduper.clear("recovery:local_service")
      },
      report: () => { reports += 1 },
    })

    await assert.rejects(target.fetch("/api/jobs"), FriendlyNetworkError)
    assert.equal(dialogs, 1)
    const unavailable = await target.fetch("/api/jobs")
    assert.equal(unavailable.status, 503)
    assert.equal(dialogs, 1)
    assert.equal(recoveries, 0)
    assert.equal(reports, 2)
    assert.deepEqual(await unavailable.json(), { detail: { code: "FASTAPI_PROXY_FAILED" } })

    assert.equal((await target.fetch("/api/health")).status, 200)
    assert.equal(recoveries, 1)
    await assert.rejects(target.fetch("/api/jobs"), FriendlyNetworkError)
    assert.equal(dialogs, 2)
    uninstall()
  })

  it("lets a resolved HTTP failure use only the caller toast while rejected fetch uses the global toast", async () => {
    const responses: Array<Response | Error> = [
      Response.json(
        { detail: { code: "FASTAPI_PROXY_FAILED" } },
        { status: 503, headers: { "X-Client-Service-Error": "local_service" } },
      ),
      new TypeError("Failed to fetch"),
    ]
    const target = {
      fetch: async () => {
        const next = responses.shift()!
        if (next instanceof Error) throw next
        return next
      },
    }
    let globalToasts = 0
    let callerToasts = 0
    const uninstall = installFetchErrorGuard({
      target,
      origin: "http://127.0.0.1:3000",
      isDesktop: true,
      onFriendlyError: (error) => {
        if (shouldShowGlobalNetworkErrorToast(error)) globalToasts += 1
      },
    })

    const resolved = await target.fetch("/api/auth/login", { method: "POST" })
    assert.equal(resolved.status, 503)
    callerToasts += 1
    assert.equal(globalToasts + callerToasts, 1)

    await assert.rejects(target.fetch("/api/auth/login", { method: "POST" }), FriendlyNetworkError)
    assert.equal(globalToasts, 1)
    uninstall()
  })

  it("coalesces one failed config version across runtime status, fetch, and caller notification", async () => {
    const deduper = createRecoveryIncidentDeduper()
    const version = "config-v9"
    let dialogs = 0
    let globalToasts = 0
    let callerToasts = 0
    const runtimeKey = getRecoveryIncidentKey("update_failed", version)
    assert.ok(runtimeKey)
    if (deduper.markIfNew(runtimeKey)) dialogs += 1

    let received: FriendlyNetworkError | undefined
    const target = {
      fetch: async () => Response.json(
        { detail: { code: "CONFIG_UPDATE_FAILED" } },
        { status: 503, headers: { "X-Client-Service-Error": "local_service" } },
      ),
    }
    const uninstall = installFetchErrorGuard({
      target,
      origin: "http://127.0.0.1:3000",
      isDesktop: true,
      getRuntimeState: () => "failed",
      onFriendlyError: (error) => {
        received = error
        if (shouldShowGlobalNetworkErrorToast(error)) globalToasts += 1
        const key = getRecoveryIncidentKey(error.category, version)
        if (key && deduper.markIfNew(key)) dialogs += 1
      },
    })
    const response = await target.fetch("/api/auth/login", { method: "POST" })
    assert.equal(response.status, 503)
    callerToasts += 1

    assert.equal(received?.category, "update_failed")
    assert.equal(received?.status, 503)
    assert.equal(globalToasts + callerToasts, 1)
    assert.equal(dialogs, 1)
    uninstall()
  })

  it("does not treat an unmarked 503 as recovery or show desktop recovery on web", async () => {
    let recoveries = 0
    const unmarkedTarget = { fetch: async () => new Response("unavailable", { status: 503 }) }
    const offUnmarked = installFetchErrorGuard({
      target: unmarkedTarget,
      origin: "http://127.0.0.1:3000",
      isDesktop: true,
      onLocalRecovery: () => { recoveries += 1 },
    })
    assert.equal((await unmarkedTarget.fetch("/api/health")).status, 503)
    assert.equal(recoveries, 0)
    offUnmarked()

    let webCategory = ""
    const webTarget = {
      fetch: async () => new Response("unavailable", {
        status: 503,
        headers: { "X-Client-Service-Error": "local_service" },
      }),
    }
    const offWeb = installFetchErrorGuard({
      target: webTarget,
      origin: "https://app.example.com",
      isDesktop: false,
      onFriendlyError: (error) => { webCategory = error.category },
    })
    await webTarget.fetch("/api/health")
    assert.equal(webCategory, "unknown")
    offWeb()
  })

  it("preserves intentional AbortError without reporting or notifying", async () => {
    const abort = new DOMException("The operation was aborted", "AbortError")
    let reports = 0
    let notifications = 0
    const target = { fetch: async () => { throw abort } }
    const uninstall = installFetchErrorGuard({
      target,
      report: () => { reports += 1 },
      onFriendlyError: () => { notifications += 1 },
    })
    await assert.rejects(target.fetch("/api/chat"), (error) => error === abort)
    assert.equal(reports, 0)
    assert.equal(notifications, 0)
    uninstall()
  })
})

describe("client diagnostics payload", () => {
  it("contains whitelist fields only and strips query data", () => {
    const payload = createClientErrorReport({
      category: "cloud_service",
      requestPath: "https://api.example.com/v1/chat?token=secret#fragment",
      status: 503,
    })
    assert.deepEqual(Object.keys(payload).sort(), ["category", "requestPath", "status", "timestamp"])
    assert.equal(payload.requestPath, "/v1/chat")
    assert.doesNotMatch(JSON.stringify(payload), /token|secret|cookie|body/i)
  })
})

describe("recovery incident dedupe", () => {
  it("suppresses one local incident until an explicit ready recovery clears it", () => {
    const deduper = createRecoveryIncidentDeduper()
    assert.equal(deduper.markIfNew("recovery:local_service"), true)
    assert.equal(deduper.markIfNew("recovery:local_service"), false)
    deduper.clear("recovery:local_service")
    assert.equal(deduper.markIfNew("recovery:local_service"), true)
  })

  it("allows a different failed config version while suppressing repeats of one version", () => {
    const deduper = createRecoveryIncidentDeduper()
    assert.equal(deduper.markIfNew("recovery:update_failed:v1"), true)
    assert.equal(deduper.markIfNew("recovery:update_failed:v1"), false)
    assert.equal(deduper.markIfNew("recovery:update_failed:v2"), true)
  })

  it("allows a new local incident only after a successful local response clears it", () => {
    const deduper = createRecoveryIncidentDeduper()
    let dialogs = 0
    const notifyFailure = () => {
      if (deduper.markIfNew("recovery:local_service")) dialogs += 1
    }
    notifyFailure()
    notifyFailure()
    assert.equal(dialogs, 1)
    deduper.clear("recovery:local_service")
    notifyFailure()
    assert.equal(dialogs, 2)
  })
})

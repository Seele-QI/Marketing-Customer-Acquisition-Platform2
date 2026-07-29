import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"

describe("service recovery UI wiring", () => {
  it("mounts the provider at the root and wires status, dialog, and restart controls", async () => {
    const [layout, provider, messages] = await Promise.all([
      readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../components/service-recovery-provider.tsx", import.meta.url), "utf8"),
      readFile(new URL("../lib/api/customer-network-error.ts", import.meta.url), "utf8"),
    ])
    assert.match(layout, /<ServiceRecoveryProvider>/)
    assert.match(provider, /getServiceRuntimeStatus/)
    assert.match(provider, /onServiceRuntimeStatus/)
    assert.match(provider, /CUSTOMER_ERROR_MESSAGES\.updating/)
    assert.match(messages, /正在应用最新模型配置/)
    assert.match(provider, /一键重启程序/)
    assert.match(provider, /暂不重启/)
    assert.match(provider, /restartApp/)
    assert.match(provider, /restartRequested\.current/)
    assert.match(provider, /seenRecoveryIncidents\.current/)
    assert.match(provider, /seenRecoveryIncidents\.current\.clear\("recovery:local_service"\)/)
    assert.doesNotMatch(provider, /showRecoveryOnce\([^)]*60_000/)
    assert.match(provider, /restartRequested\.current = false/)
    assert.match(provider, /latestAcceptedAt/)
    assert.match(provider, /eventSeen/)
    assert.match(provider, /isDesktop:\s*Boolean\(electronAPI\)/)
    assert.match(provider, /onLocalRecovery/)
    assert.match(provider, /shouldShowGlobalNetworkErrorToast\(error\)/)
    assert.match(
      provider,
      /useLayoutEffect\(\(\) => \{\s*return installFetchErrorGuard/,
      "the parent layout effect must install fetch protection before child passive effects",
    )
    assert.doesNotMatch(
      provider,
      /useEffect\(\(\) => \{\s*return installFetchErrorGuard/,
    )
    assert.doesNotMatch(
      provider,
      /runtimeStatus\.state === "failed"[\s\S]{0,240}showToastOnce/,
      "runtime failure owns the recovery dialog, not a duplicate toast",
    )
    assert.match(provider, /客户端服务暂时无法连接，请稍后重试；若持续失败，请刷新页面。/)
    assert.match(provider, /window\.electronAPI/)
    assert.match(provider, /AlertDialog/)
  })

  it("login catches friendly fetch failures without duplicating their toast", async () => {
    const source = await readFile(new URL("../components/auth/account-login-dialog.tsx", import.meta.url), "utf8")
    assert.match(source, /getCustomerFacingErrorMessage/)
    assert.match(source, /FriendlyNetworkError/)
    assert.doesNotMatch(source, /const message = e instanceof Error \? e\.message/)
  })

  it("positioning chat uses the shared response parser instead of displaying HTTP status", async () => {
    const source = await readFile(new URL("../components/positioning-chat-dialog.tsx", import.meta.url), "utf8")
    assert.match(source, /parseApiErrorResponse/)
    assert.match(source, /getCustomerFacingErrorMessage/)
    assert.doesNotMatch(source, /`HTTP \$\{response\.status\}`/)
  })

  it("does not ship the video workflow debug collector in the customer client", async () => {
    const source = await readFile(new URL("../components/dh-video-v2-workflow.tsx", import.meta.url), "utf8")
    assert.doesNotMatch(source, /127\.0\.0\.1:7359|#region agent log|X-Debug-Session-Id/)
  })
})

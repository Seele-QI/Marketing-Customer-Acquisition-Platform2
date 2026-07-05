import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { resolveBillingCost } from "@/lib/credit-pricing/registry"

/**
 * billingFor 逻辑与 article-generate 保持一致（单元测试镜像）
 */
function billingFor(params: {
  userId?: number
  cookieHeader?: string
  provider: string
  batchId: string
  jobId: string
}) {
  if (params.userId == null || !params.cookieHeader) return undefined
  return {
    userId: params.userId,
    cookieHeader: params.cookieHeader,
    refIdPrefix: `geo-article:${params.batchId}:${params.jobId}`,
    provider: params.provider,
  }
}

describe("geo article billing", () => {
  it("always passes provider for chargeBillingEvent", () => {
    const b = billingFor({
      userId: 1,
      cookieHeader: "session_id=x",
      provider: "gpt",
      batchId: "batch-1",
      jobId: "job-1",
    })
    assert.ok(b)
    assert.equal(b!.provider, "gpt")
    const resolved = resolveBillingCost("geo.article", { provider: b!.provider })
    assert.equal(resolved.cost, 30)
  })

  it("deepseek resolves to economy 10 credits", () => {
    const b = billingFor({
      userId: 1,
      cookieHeader: "session_id=x",
      provider: "deepseek",
      batchId: "batch-1",
      jobId: "job-1",
    })
    const resolved = resolveBillingCost("geo.article", { provider: b!.provider })
    assert.equal(resolved.cost, 10)
  })

  it("retry batch uses same per-article billing", () => {
    const b = billingFor({
      userId: 1,
      cookieHeader: "session_id=x",
      provider: "deepseek",
      batchId: "retry-abc",
      jobId: "job-1",
    })
    assert.ok(b)
    const resolved = resolveBillingCost("geo.article", { provider: b!.provider })
    assert.equal(resolved.cost, 10)
  })

  it("returns undefined without userId", () => {
    assert.equal(
      billingFor({
        provider: "deepseek",
        batchId: "batch-1",
        jobId: "job-1",
      }),
      undefined,
    )
  })
})

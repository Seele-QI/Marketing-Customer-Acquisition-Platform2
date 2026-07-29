import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  planAgentCollaboration,
  runAgentCollaboration,
} from "../lib/agents/orchestrator.ts"
import type { AgentCompletionResult } from "../lib/agents/model-router.ts"

describe("enterprise agent orchestration", () => {
  it("routes a cross-functional coordinator task to one primary and bounded cosigners", () => {
    const plan = planAgentCollaboration({
      selectedAgentId: "chief-coordinator",
      prompt: "评估这项合作的预算，并审阅合同里的数据使用条款",
    })
    assert.equal(plan.primaryAgentId, "strategy-management")
    assert.deepEqual(plan.cosignerAgentIds, ["finance-control", "legal-compliance"])
    assert.ok(plan.cosignerAgentIds.length <= 3)
  })

  it("keeps a directly selected specialist as primary", () => {
    const plan = planAgentCollaboration({
      selectedAgentId: "legal-compliance",
      prompt: "审阅这份供应商合同",
    })
    assert.equal(plan.primaryAgentId, "legal-compliance")
    assert.deepEqual(plan.cosignerAgentIds, [])
  })

  it("supports explicitly disabling cosigners for a single-department run", () => {
    const plan = planAgentCollaboration({
      selectedAgentId: "legal-compliance",
      prompt: "审查合同并核对预算与外发口径",
      collaboration: false,
    })
    assert.equal(plan.primaryAgentId, "legal-compliance")
    assert.deepEqual(plan.cosignerAgentIds, [])
  })

  it("returns partial when a cosigner fails but preserves the primary result", async () => {
    const complete = async ({ messages }: { messages: Array<{ content: unknown }> }) => {
      const system = String(messages[0]?.content ?? "")
      if (system.includes("财务内控部")) {
        return {
          ok: false,
          code: "CLOUD_MODEL_UNAVAILABLE",
          failures: [{ provider: "finance", model: "f", reason: "http_error", status: 503 }],
        } satisfies AgentCompletionResult
      }
      const text = system.includes("总协调办公室") ? "联合结论" : "主责结论"
      return {
        ok: true,
        text,
        route: {
          source: "cloud",
          providerName: "working",
          model: "cloud-model",
          selectedAt: 1,
          failuresBeforeSelection: 0,
        },
        failures: [],
      } satisfies AgentCompletionResult
    }

    const result = await runAgentCollaboration({
      selectedAgentId: "chief-coordinator",
      prompt: "评估合作预算",
      signal: new AbortController().signal,
      complete,
    })

    assert.equal(result.status, "partial")
    assert.equal(result.primary.status, "completed")
    assert.equal(result.cosigners[0]?.status, "failed")
    assert.match(result.finalText, /主责结论/)
    assert.ok(result.warnings.some((warning) => warning.includes("周谨")))
  })

  it("contains an unexpected cosigner exception as a partial result", async () => {
    const complete = async ({ messages }: { messages: Array<{ content: unknown }> }) => {
      const system = String(messages[0]?.content ?? "")
      if (system.includes("财务内控部")) throw new Error("upstream response parser exploded")
      return {
        ok: true,
        text: "主责结论",
        route: {
          source: "cloud",
          providerName: "working",
          model: "cloud-model",
          selectedAt: 1,
          failuresBeforeSelection: 0,
        },
        failures: [],
      } satisfies AgentCompletionResult
    }

    const result = await runAgentCollaboration({
      selectedAgentId: "chief-coordinator",
      prompt: "评估合作预算",
      signal: new AbortController().signal,
      complete,
    })

    assert.equal(result.status, "partial")
    assert.equal(result.primary.status, "completed")
    assert.equal(result.cosigners[0]?.status, "failed")
    assert.equal(result.cosigners[0]?.error, "INTERNAL_AGENT_ERROR")
  })

  it("preserves explicit cosigner conflicts in the final result", async () => {
    const complete = async ({ messages }: { messages: Array<{ content: unknown }> }) => {
      const system = String(messages[0]?.content ?? "")
      const text = system.includes("法务合规部")
        ? "阻断项：排他条款不可接受"
        : system.includes("总协调办公室")
          ? "有条件推进，同时保留法务阻断项"
          : "建议推进"
      return {
        ok: true,
        text,
        route: {
          source: "cloud",
          providerName: "working",
          model: "cloud-model",
          selectedAt: 1,
          failuresBeforeSelection: 0,
        },
        failures: [],
      } satisfies AgentCompletionResult
    }

    const result = await runAgentCollaboration({
      selectedAgentId: "chief-coordinator",
      prompt: "评估合作并审阅合同",
      signal: new AbortController().signal,
      complete,
    })
    assert.equal(result.status, "completed")
    assert.ok(result.conflicts.some((item) => item.includes("排他条款")))
    assert.match(result.finalText, /保留法务阻断项/)
  })

  it("passes ready image evidence as multimodal user content", async () => {
    const calls: Array<{ hasImages?: boolean; content: unknown }> = []
    const complete = async (input: {
      hasImages?: boolean
      messages: Array<{ content: unknown }>
    }) => {
      calls.push({ hasImages: input.hasImages, content: input.messages[1]?.content })
      return {
        ok: true,
        text: "图表复核完成",
        route: {
          source: "cloud",
          providerName: "vision",
          model: "vision-model",
          selectedAt: 1,
          failuresBeforeSelection: 0,
        },
        failures: [],
      } satisfies AgentCompletionResult
    }
    await runAgentCollaboration({
      selectedAgentId: "finance-control",
      prompt: "复核这张预算图表",
      images: [{ mimeType: "image/png", dataBase64: "aW1hZ2U=", source: "temporary:chart.png" }],
      signal: new AbortController().signal,
      complete,
    })
    assert.equal(calls[0]?.hasImages, true)
    assert.ok(Array.isArray(calls[0]?.content))
    assert.equal((calls[0]?.content as Array<{ type: string }>)[1]?.type, "image_url")
  })
})

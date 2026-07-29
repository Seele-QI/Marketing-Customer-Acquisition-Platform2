import assert from "node:assert/strict"
import test from "node:test"

import { buildPublicAgentCatalog, serializePublicAgentRun } from "../lib/agents/public.ts"
import { sanitizeAgentRunRequest } from "../lib/agents/run-request.ts"

test("public agent catalog exposes professional metadata but never system prompts", () => {
  const catalog = buildPublicAgentCatalog()
  assert.equal(catalog.length, 15)
  assert.equal(catalog[0]?.id, "chief-coordinator")
  for (const agent of catalog) {
    assert.ok(agent.name)
    assert.ok(agent.title)
    assert.ok(agent.avatar)
    assert.ok(Array.isArray(agent.skills))
    assert.equal("systemPrompt" in agent, false)
    assert.equal("instructions" in agent, false)
    assert.equal("modelId" in agent, false)
    assert.equal("knowledgeScopes" in agent, false)
    assert.ok(Array.isArray(agent.tools))
  }
})

test("run request accepts only server-known agents and strips client model selection", () => {
  const result = sanitizeAgentRunRequest({
    agentId: "legal-compliance",
    prompt: "审查这份合作合同",
    modelId: "forged-client-model",
    collaboration: true,
    evidence: [{ source: "合同.docx", text: "付款后不得退款" }],
  })

  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.agentId, "legal-compliance")
  assert.equal(result.value.collaboration, true)
  assert.equal(result.value.evidence.length, 1)
  assert.deepEqual(result.value.images, [])
  assert.equal("modelId" in result.value, false)
})

test("run request enforces size, evidence, and agent boundaries", () => {
  assert.deepEqual(sanitizeAgentRunRequest({ agentId: "unknown", prompt: "test" }), {
    ok: false,
    status: 400,
    detail: "未知智能体",
  })
  assert.equal(sanitizeAgentRunRequest({ agentId: "legal-compliance", prompt: "" }).ok, false)
  assert.equal(
    sanitizeAgentRunRequest({
      agentId: "legal-compliance",
      prompt: "a".repeat(40_001),
    }).ok,
    false,
  )
})

test("public run serialization hides provider and model routing details", () => {
  const serialized = serializePublicAgentRun({
    status: "completed",
    plan: { primaryAgentId: "legal-compliance", cosignerAgentIds: [], reason: "direct" },
    primary: {
      agentId: "legal-compliance",
      name: "顾正",
      title: "法务合规负责人",
      role: "primary",
      status: "completed",
      text: "完成",
      activeSkillIds: ["contract-review-cn"],
      route: {
        source: "cloud",
        providerName: "secret-provider",
        model: "secret-model",
        selectedAt: 1,
        failuresBeforeSelection: 0,
      },
    },
    cosigners: [],
    finalText: "完成",
    conflicts: [],
    routeSnapshots: [
      {
        source: "cloud",
        providerName: "secret-provider",
        model: "secret-model",
        selectedAt: 1,
        failuresBeforeSelection: 0,
      },
    ],
    activeSkillIds: ["contract-review-cn"],
    warnings: [],
  })
  const json = JSON.stringify(serialized)
  assert.ok(!json.includes("secret-provider"))
  assert.ok(!json.includes("secret-model"))
  assert.deepEqual(serialized.modelRouting, { source: "server", successfulCalls: 1 })
})

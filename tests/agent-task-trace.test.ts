import assert from "node:assert/strict"
import test from "node:test"

import {
  buildCompletedAgentTrace,
  buildPlannedAgentTrace,
} from "../lib/agents/task-trace.ts"
import type { AgentRunResult, CollaborationPlan } from "../lib/agents/orchestrator.ts"

const plan: CollaborationPlan = {
  primaryAgentId: "strategy-management",
  cosignerAgentIds: ["finance-control", "legal-compliance"],
  reason: "总协调官完成跨部门分诊",
}

function result(overrides: Partial<AgentRunResult> = {}): AgentRunResult {
  return {
    status: "completed",
    plan,
    primary: {
      agentId: "strategy-management",
      name: "沈策",
      title: "战略管理负责人",
      role: "primary",
      status: "completed",
      text: "主责结论",
      activeSkillIds: [],
    },
    cosigners: [
      {
        agentId: "finance-control",
        name: "周谨",
        title: "财务内控负责人",
        role: "cosigner",
        status: "completed",
        text: "财务意见",
        activeSkillIds: [],
      },
      {
        agentId: "legal-compliance",
        name: "顾正",
        title: "法务合规负责人",
        role: "cosigner",
        status: "completed",
        text: "法务意见",
        activeSkillIds: [],
      },
    ],
    finalText: "联合结论",
    conflicts: [],
    routeSnapshots: [{
      source: "cloud",
      providerName: "secret-provider",
      model: "secret-model",
      selectedAt: 1,
      failuresBeforeSelection: 0,
    }],
    activeSkillIds: [],
    warnings: [],
    ...overrides,
  }
}

test("planned trace exposes real routing and marks parallel work active", () => {
  const trace = buildPlannedAgentTrace(plan)
  assert.deepEqual(trace.map((step) => step.status), [
    "completed",
    "completed",
    "active",
    "active",
    "active",
    "queued",
    "queued",
  ])
  assert.match(trace[1]?.detail ?? "", /战略管理部/)
  assert.match(trace[3]?.label ?? "", /周谨/)
})

test("completed trace maps failed cosigners and partial completion honestly", () => {
  const partial = result({
    status: "partial",
    cosigners: [
      result().cosigners[0]!,
      {
        ...result().cosigners[1]!,
        status: "failed",
        text: "",
        error: "CLOUD_MODEL_UNAVAILABLE",
      },
    ],
    warnings: ["顾正会签未完成：CLOUD_MODEL_UNAVAILABLE"],
  })
  const trace = buildCompletedAgentTrace(partial)
  assert.equal(trace.find((step) => step.agentId === "legal-compliance")?.status, "failed")
  assert.equal(trace.at(-1)?.status, "completed")
  assert.match(trace.at(-1)?.detail ?? "", /部分完成/)
  assert.ok(!JSON.stringify(trace).includes("secret-provider"))
  assert.ok(!JSON.stringify(trace).includes("secret-model"))
})

test("single-department trace skips cosign and synthesis without fake work", () => {
  const singlePlan = { ...plan, cosignerAgentIds: [] }
  const single = result({
    plan: singlePlan,
    cosigners: [],
    routeSnapshots: [],
  })
  const trace = buildCompletedAgentTrace(single)
  assert.equal(trace.find((step) => step.id === "cosign:none")?.status, "skipped")
  assert.equal(trace.find((step) => step.id === "synthesis")?.status, "skipped")
})

test("synthesis failure remains visible even when primary work is usable", () => {
  const trace = buildCompletedAgentTrace(result({
    status: "partial",
    warnings: ["总协调汇总未完成：INTERNAL_AGENT_ERROR"],
  }))
  assert.equal(trace.find((step) => step.id === "synthesis")?.status, "failed")
})

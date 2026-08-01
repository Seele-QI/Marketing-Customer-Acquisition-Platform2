import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

import { buildPublicAgentPlan } from "../lib/agents/plan.ts"

test("public agent planning ignores forged models and returns a real operational trace", () => {
  const result = buildPublicAgentPlan({
    agentId: "chief-coordinator",
    prompt: "评估合作预算并审查合同",
    collaboration: true,
    modelId: "forged-client-model",
  })
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.value.plan.primaryAgentId, "strategy-management")
  assert.deepEqual(result.value.plan.cosignerAgentIds, [
    "finance-control",
    "legal-compliance",
  ])
  assert.ok(result.value.trace.some((step) => step.status === "active"))
  assert.equal("modelId" in result.value, false)
  assert.ok(!JSON.stringify(result.value).includes("forged-client-model"))
})

test("public agent planning rejects unknown agents through the shared request boundary", () => {
  const result = buildPublicAgentPlan({
    agentId: "unknown",
    prompt: "task",
    collaboration: true,
  })
  assert.deepEqual(result, { ok: false, status: 400, detail: "未知智能体" })
})

test("planning route is authenticated and never imports billing", () => {
  const source = fs.readFileSync(
    new URL("../app/api/agents/plan/route.ts", import.meta.url),
    "utf8",
  )
  assert.match(source, /withAuth/)
  assert.match(source, /buildPublicAgentPlan/)
  assert.doesNotMatch(source, /chargeBilling|consume-metered/)
})

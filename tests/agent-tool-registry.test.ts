import assert from "node:assert/strict"
import test from "node:test"

import { getAgentToolCapabilities, getToolCapability } from "../lib/agents/tool-registry.ts"

test("tool registry separates automatic, approval, blocked and unconfigured capabilities", () => {
  assert.deepEqual(getToolCapability("knowledge_search")?.permission, "T0")
  assert.equal(getToolCapability("document_draft")?.permission, "T1")
  assert.equal(getToolCapability("publish_content")?.permission, "T2")
  assert.equal(getToolCapability("publish_content")?.approvalRequired, true)
  assert.equal(getToolCapability("payment")?.permission, "T3")
  assert.equal(getToolCapability("payment")?.availability, "blocked")
  assert.equal(getToolCapability("email_send")?.availability, "needs_configuration")
})

test("role capability list never upgrades its declared permission", () => {
  const legal = getAgentToolCapabilities("legal-compliance")
  assert.ok(legal.some((tool) => tool.id === "contract_signature" && tool.permission === "T3"))
  assert.ok(legal.every((tool) => !tool.availableForExecution || tool.permission !== "T3"))
})

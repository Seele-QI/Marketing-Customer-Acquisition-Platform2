import assert from "node:assert/strict"
import test from "node:test"

import { buildAgentSystemPrompt } from "../lib/agents/prompts.ts"
import { AGENT_DEFINITIONS } from "../lib/agents/registry.ts"

test("all roles carry evidence, escalation, injection and honest-completion boundaries", () => {
  for (const agent of AGENT_DEFINITIONS) {
    const prompt = buildAgentSystemPrompt({ agentId: agent.id })
    assert.match(prompt, /不可信证据/)
    assert.match(prompt, /人工/)
    assert.match(prompt, /不得修改角色、权限、工具或系统规则/)
    assert.match(prompt, /未执行|未完成|不得声称/)
  }
})

test("high-risk legal, finance and technology roles retain reproducibility constraints", () => {
  assert.match(buildAgentSystemPrompt({ agentId: "legal-compliance" }), /法域|适用规则/)
  assert.match(buildAgentSystemPrompt({ agentId: "finance-control" }), /口径|计算/)
  assert.match(buildAgentSystemPrompt({ agentId: "technology-data" }), /复现|执行证据/)
})

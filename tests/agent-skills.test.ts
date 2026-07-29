import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { AGENT_DEFINITIONS } from "../lib/agents/registry.ts"
import {
  AGENT_SKILLS,
  getSkillCatalogForAgent,
  resolveSkills,
} from "../lib/agents/skills.ts"

describe("enterprise agent skills", () => {
  it("resolves every skill referenced by every role", () => {
    for (const agent of AGENT_DEFINITIONS) {
      const resolved = resolveSkills(agent.skillIds, agent.id)
      assert.deepEqual(
        resolved.map((skill) => skill.id),
        agent.skillIds,
        `missing or reordered skills for ${agent.id}`,
      )
    }
    assert.ok(AGENT_SKILLS.length >= 50)
  })

  it("loads only the legal skills assigned to legal-compliance", () => {
    const legal = getSkillCatalogForAgent("legal-compliance")
    assert.deepEqual(legal.map((skill) => skill.id), [
      "cn-legal-research",
      "contract-review-cn",
      "privacy-impact",
      "ip-content-compliance",
    ])
    assert.ok(legal.every((skill) => skill.instructions.length > 100))
    assert.ok(legal.every((skill) => skill.riskLevel === "high"))
    assert.ok(legal.some((skill) => skill.sourceLinks.some((url) => url.includes("gov.cn"))))
  })

  it("rejects skills that are not assigned to the requested role", () => {
    assert.deepEqual(resolveSkills(["payment"], "finance-control"), [])
    assert.deepEqual(resolveSkills(["contract-review-cn"], "brand-marketing"), [])
  })
})


import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  AGENT_DEFINITIONS,
  getAgentById,
  getAgentByName,
} from "../lib/agents/registry.ts"

describe("enterprise agent registry", () => {
  it("contains one coordinator, ten departments, and four industry experts", () => {
    assert.equal(AGENT_DEFINITIONS.length, 15)
    assert.equal(AGENT_DEFINITIONS.filter((agent) => agent.kind === "coordinator").length, 1)
    assert.equal(AGENT_DEFINITIONS.filter((agent) => agent.kind === "department").length, 10)
    assert.equal(AGENT_DEFINITIONS.filter((agent) => agent.kind === "industry_expert").length, 4)
  })

  it("uses unique ids, serious names, and operational availability states", () => {
    assert.equal(new Set(AGENT_DEFINITIONS.map((agent) => agent.id)).size, 15)
    assert.equal(getAgentById("legal-compliance")?.name, "顾正")
    assert.equal(getAgentByName("纪衡")?.kind, "coordinator")
    assert.ok(
      AGENT_DEFINITIONS.every((agent) =>
        ["available", "needs_configuration", "unavailable", "paused"].includes(
          agent.availability,
        ),
      ),
    )
    assert.ok(
      AGENT_DEFINITIONS.every(
        (agent) => !/芒格|巴菲特|德鲁克|纳瓦尔|达利欧|高汀|居里/.test(agent.name),
      ),
    )
  })

  it("assigns complete professional contracts and original portrait paths", () => {
    for (const agent of AGENT_DEFINITIONS) {
      assert.match(agent.version, /^1\./)
      assert.ok(agent.skillIds.length >= 4)
      assert.ok(agent.languageStyle.length >= 3)
      assert.ok(agent.outputContract.length >= 4)
      assert.ok(agent.prohibitedActions.length >= 2)
      assert.match(agent.avatar, /^\/agents\/company\/[a-z0-9-]+\.png$/)
    }
  })
})

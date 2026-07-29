import assert from "node:assert/strict"
import test from "node:test"

import {
  generateEnterpriseSkillContent,
  type EnterpriseSkillCompletion,
} from "../lib/geo/enterprise-skill-generation.ts"
import { ENTERPRISE_SKILL_REQUIRED_SECTIONS } from "../lib/geo/enterprise-skill-quality.ts"

const contact = {
  contactName: "张经理",
  primary: { type: "phone" as const, value: "13800000000" },
}

function validDraft(): string {
  const sections = ENTERPRISE_SKILL_REQUIRED_SECTIONS.map((heading) => {
    if (heading === "FAQ") {
      return `## FAQ\n\n${Array.from(
        { length: 8 },
        (_, index) => `### Q${index + 1}：问题 ${index + 1}？\n\n答：待补充。`,
      ).join("\n\n")}`
    }
    if (heading === "官方联系方式") return "## 官方联系方式\n\n模型可能改写"
    return `## ${heading}\n\n待补充。`
  }).join("\n\n")
  return `---\nname: example-kb\ndescription: Use when creating content about this enterprise.\n---\n\n${sections}`
}

test("skips repair for a valid draft and preserves exact contact", async () => {
  let calls = 0
  const complete: EnterpriseSkillCompletion = async () => {
    calls += 1
    return validDraft()
  }
  const result = await generateEnterpriseSkillContent({
    complete,
    system: "system",
    user: "user",
    contact,
  })
  assert.equal(calls, 1)
  assert.equal(result.quality.passed, true)
  assert.equal(result.quality.repaired, false)
  assert.match(result.content, /联系人：张经理/)
  assert.match(result.content, /手机：13800000000/)
  assert.doesNotMatch(result.content, /模型可能改写/)
})

test("repairs an invalid first draft once and applies deterministic fallback", async () => {
  const prompts: string[] = []
  const complete: EnterpriseSkillCompletion = async (input) => {
    prompts.push(input.user)
    return prompts.length === 1
      ? "```markdown\n## Overview\n已为100家客户节省30%成本。\n```"
      : "## Overview\n修复后的定位。"
  }
  const result = await generateEnterpriseSkillContent({
    complete,
    system: "system",
    user: "initial user",
    contact,
  })
  assert.equal(prompts.length, 2)
  assert.match(prompts[1], /质量检查问题/)
  assert.equal(result.quality.passed, true)
  assert.equal(result.quality.repaired, true)
  assert.equal(result.quality.score, 100)
  assert.match(result.content, /## 资料来源与待补充项/)
  assert.equal((result.content.match(/^### Q\d+[：:]/gm) ?? []).length, 8)
})

test("falls back safely when the optional repair call fails", async () => {
  let calls = 0
  const complete: EnterpriseSkillCompletion = async () => {
    calls += 1
    if (calls === 2) throw new Error("repair provider unavailable")
    return "## Overview\n仅有企业定位。"
  }
  const result = await generateEnterpriseSkillContent({
    complete,
    system: "system",
    user: "user",
    contact,
  })
  assert.equal(calls, 2)
  assert.equal(result.quality.passed, true)
  assert.equal(result.quality.repaired, true)
  assert.match(result.content, /现有资料未提供，待补充/)
})

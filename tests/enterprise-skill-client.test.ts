import assert from "node:assert/strict"
import test from "node:test"

import { generateEnterpriseSkill } from "../lib/geo/enterprise-skill-client.ts"

const input = { skillName: "测试知识库", entity: {} as never, documents: [] }

test("enterprise skill client returns skill and surfaces auth errors", async () => {
  const skill = await generateEnterpriseSkill(input, async () => Response.json({ skill: { id: "1", label: "测试", description: "", content: "正文", provider: "cloud", createdAt: "2026-07-22" } }) as never)
  assert.equal(skill.id, "1")
  await assert.rejects(
    () => generateEnterpriseSkill(input, async () => Response.json({ error: "unauthorized" }, { status: 401 }) as never),
    /请先登录后再生成 Skill/,
  )
})

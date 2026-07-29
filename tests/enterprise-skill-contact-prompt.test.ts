import assert from "node:assert/strict"
import test from "node:test"

import {
  buildEnterpriseSkillSystemPrompt,
  buildEnterpriseSkillUserPrompt,
} from "../lib/geo/enterprise-skill-prompt.ts"

const entity = {
  companyName: "财赋财税",
  industry: "财税服务",
  coreProduct: "代理记账",
  authorityLinks: [],
  authorityPages: [],
  faqs: [],
  officialContact: {
    contactName: "张三",
    primary: { type: "wechat" as const, value: "caifu-service" },
  },
}

test("requires an official contact section without rewriting values", () => {
  const system = buildEnterpriseSkillSystemPrompt()
  assert.match(system, /官方联系方式/)
  assert.match(system, /逐字保留/)
  assert.match(system, /不得主动插入普通内容/)
})

test("injects only the sanitized official contact block", () => {
  const user = buildEnterpriseSkillUserPrompt("财赋财税 GEO 知识库", entity, [])
  assert.match(user, /联系人：张三/)
  assert.match(user, /微信：caifu-service/)
  assert.doesNotMatch(user, /CRM|客户线索/)
})

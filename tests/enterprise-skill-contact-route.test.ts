import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { sanitizeEntity } from "../app/api/geo/enterprise-skill/generate/route.ts"

test("sanitizes the official contact into the shared entity shape", () => {
  const entity = sanitizeEntity({
    companyName: " 财赋财税 ",
    officialContact: {
      contactName: " 张三 ",
      primary: { type: "email", value: " service@example.com " },
    },
  })
  assert.equal(entity.officialContact.contactName, "张三")
  assert.equal(entity.officialContact.primary.value, "service@example.com")
})

test("validates contact before charging or calling the model", async () => {
  const source = await readFile(
    new URL("../app/api/geo/enterprise-skill/generate/route.ts", import.meta.url),
    "utf8",
  )
  const validationIndex = source.indexOf("const contactIssue = validateOfficialContact")
  const billingIndex = source.indexOf("await chargeCredit")
  const completionIndex = source.indexOf("await generateEnterpriseSkillContent")
  assert.ok(validationIndex >= 0)
  assert.ok(validationIndex < billingIndex)
  assert.ok(validationIndex < completionIndex)
  assert.match(source, /status:\s*400/)
})

test("repairs the contact section before returning the skill", async () => {
  const routeSource = await readFile(
    new URL("../app/api/geo/enterprise-skill/generate/route.ts", import.meta.url),
    "utf8",
  )
  const flowSource = await readFile(
    new URL("../lib/geo/enterprise-skill-generation.ts", import.meta.url),
    "utf8",
  )
  assert.match(routeSource, /generateEnterpriseSkillContent/)
  assert.match(flowSource, /ensureOfficialContactSection/)
  assert.match(flowSource, /ensureEnterpriseSkillSections/)
})

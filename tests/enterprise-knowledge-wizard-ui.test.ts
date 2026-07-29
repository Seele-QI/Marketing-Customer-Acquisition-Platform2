import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8")

test("enterprise knowledge page uses the approved four-step wizard", async () => {
  const [view, wizard, nav] = await Promise.all([
    read("../components/geo-knowledge-base-view.tsx"),
    read("../components/geo/knowledge/geo-knowledge-wizard.tsx"),
    read("../components/geo/knowledge/geo-knowledge-step-nav.tsx"),
  ])
  assert.match(view, /GeoKnowledgeWizard/)
  assert.match(nav, /导入企业资料/)
  assert.match(nav, /确认企业信息/)
  assert.match(nav, /官方联系方式/)
  assert.match(nav, /预览并生成/)
  assert.match(wizard, /loadEnterpriseWizardDraft/)
  assert.match(wizard, /useLoginRequired/)
  assert.match(wizard, /authResolved/)
  assert.match(wizard, /\[accountScope, authResolved\]/)
  assert.match(wizard, /accountScopeRef\.current !== accountScope/)
  assert.match(wizard, /hydratedScope !== accountScope/)
  assert.match(wizard, /if \(!hydrated \|\|/)
  assert.match(wizard, /lg:hidden/)
  assert.match(wizard, /Promise\.allSettled/)
  assert.doesNotMatch(wizard, /clearEnterpriseDocuments/)
  assert.doesNotMatch(wizard, /模型选择|modelId|provider:/)
})

test("document upload commits one awaited batch instead of racing stale props", async () => {
  const upload = await read("../components/geo/geo-doc-upload-panel.tsx")
  assert.match(upload, /onChange: \(docs: GeoUploadedDoc\[\]\) => Promise<void> \| void/)
  assert.match(upload, /await onChange\(/)
  assert.match(upload, /const removeDoc = async[\s\S]*?await onChange\(/)
  assert.match(upload, /disabled=\{Boolean\(busyName\)\}/)
  assert.doesNotMatch(upload, /Array\.from\(files\)\.forEach/)
})

test("generation route validates every required company field before billing", async () => {
  const source = await read("../app/api/geo/enterprise-skill/generate/route.ts")
  const requiredIndex = source.indexOf("requiredEnterpriseFields")
  const billingIndex = source.indexOf("await chargeCredit")
  assert.ok(requiredIndex >= 0)
  assert.ok(requiredIndex < billingIndex)
})

test("saved skills panel offers explicit legacy recovery instead of silent ownership", async () => {
  const source = await read("../components/geo/knowledge/geo-saved-skills-panel.tsx")
  assert.match(source, /listLegacyEnterpriseSkills/)
  assert.match(source, /claimLegacyEnterpriseSkills/)
  assert.match(source, /旧版知识库/)
  assert.match(source, /window\.confirm/)
})

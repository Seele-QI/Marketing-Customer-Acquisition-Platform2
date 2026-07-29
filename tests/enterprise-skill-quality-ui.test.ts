import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8")

test("legacy generator retains quality review and invalidates edited quality", async () => {
  const source = await read("../components/geo/geo-skill-generator-panel.tsx")
  assert.match(source, /quality\.issues/)
  assert.match(source, /content: e\.target\.value, quality: undefined/)
})

test("editing stored content invalidates stale quality metadata", async () => {
  const source = await read("../lib/geo/enterprise-skills-store.ts")
  assert.match(source, /contentChanged/)
  assert.match(source, /quality: contentChanged \? undefined : current\.quality/)
})

test("upload panel promises automatic extraction and safe missing-value handling", async () => {
  const source = await read("../components/geo/geo-doc-upload-panel.tsx")
  assert.match(source, /自动提取/)
  assert.match(source, /待补充/)
})

test("guided page keeps only the minimum required enterprise input", async () => {
  const source = await read("../components/geo/knowledge/geo-knowledge-wizard.tsx")
  assert.match(source, /companyName/)
  assert.match(source, /industry/)
  assert.match(source, /coreProduct/)
  assert.match(source, /只需联系人姓名和一种联系方式/)
  assert.doesNotMatch(source, /geo-(?:team|price|case|qualification)/)
})

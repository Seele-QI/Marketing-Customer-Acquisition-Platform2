import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8")

test("legacy entity panel still supports one primary and optional backup contact", async () => {
  const source = await read("../components/geo/geo-entity-panel.tsx")
  assert.match(source, /geo-contact-name/)
  assert.match(source, /geo-contact-primary-value/)
  assert.match(source, /backup/)
})

test("legacy generator keeps contact validation for compatibility", async () => {
  const source = await read("../components/geo/geo-skill-generator-panel.tsx")
  assert.match(source, /firstOfficialContactIssue/)
  assert.match(source, /document\.getElementById\(contactIssue\.fieldId\)/)
})

test("new wizard validates and focuses the first contact error", async () => {
  const source = await read("../components/geo/knowledge/geo-knowledge-wizard.tsx")
  assert.match(source, /validateOfficialContact/)
  assert.match(source, /document\.getElementById\(issue\.fieldId\)/)
  assert.match(source, /geo-contact-name/)
  assert.match(source, /geo-contact-primary-value/)
})

import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8")

test("prefill route uses cloud candidates and strict validation", async () => {
  const source = await read("../app/api/geo/enterprise-skill/prefill/route.ts")
  assert.match(source, /candidate\.source === "cloud"/)
  assert.match(source, /parseEnterprisePrefill/)
  assert.match(source, /validateText/)
  assert.match(source, /documentNames/)
  assert.match(source, /parseEnterprisePrefill\(text, documentNames\)/)
  assert.doesNotMatch(source, /body\.provider|body\.model/)
  assert.match(source, /CLOUD_MODEL_NOT_READY/)
  assert.match(source, /CLOUD_MODEL_UNAVAILABLE/)
})

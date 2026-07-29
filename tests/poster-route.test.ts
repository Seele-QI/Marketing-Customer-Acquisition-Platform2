import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("poster generate route authenticates, charges, and proxies to FastAPI", () => {
  const route = readFileSync("app/api/poster/generate/route.ts", "utf8")
  assert.match(route, /withAuth/)
  assert.match(route, /parsePosterGenerationRequest/)
  assert.match(route, /chargeCredit/)
  assert.ok(
    route.lastIndexOf("parsePosterGenerationRequest") < route.indexOf("await chargeCredit"),
    "poster contract must be parsed before charging credit",
  )
  assert.match(route, /scene:\s*"poster_image"/)
  assert.match(route, /\/api\/poster\/generate/)
  assert.doesNotMatch(route, /ARK_/)
})

test("poster status route authenticates without charging again", () => {
  const route = readFileSync("app/api/poster/status/route.ts", "utf8")
  assert.match(route, /withAuth/)
  assert.match(route, /fastapiPathWithQuery/)
  assert.match(route, /\/api\/poster\/status/)
  assert.doesNotMatch(route, /chargeCredit/)
  assert.doesNotMatch(route, /ARK_/)
})

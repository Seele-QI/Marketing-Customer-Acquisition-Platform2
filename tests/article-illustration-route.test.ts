import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("generate route validates ownership, plans server prompts, and charges stable image refs", () => {
  const route = readFileSync(
    "app/api/geo/article-illustrations/generate/route.ts",
    "utf8",
  )
  assert.match(route, /withAuth/)
  assert.match(route, /parseArticleIllustrationGenerateRequest/)
  assert.match(route, /fetchOwnedMatrixProject/)
  assert.ok(
    route.lastIndexOf("fetchOwnedMatrixProject") < route.lastIndexOf("chargeCredit"),
  )
  assert.match(route, /planArticleIllustrations/)
  assert.match(route, /scene:\s*"image_creation"/)
  assert.match(route, /geo-article-illustration/)
  assert.doesNotMatch(route, /randomBytes|randomUUID/)
  assert.doesNotMatch(route, /RUNNINGHUB|workflowId|modelId/)
})

test("status route authenticates project scope without charging", () => {
  const route = readFileSync(
    "app/api/geo/article-illustrations/status/route.ts",
    "utf8",
  )
  assert.match(route, /withAuth/)
  assert.match(route, /fetchOwnedMatrixProject/)
  assert.match(route, /userId/)
  assert.doesNotMatch(route, /chargeCredit/)
})

test("retry route accepts failed ids only and reuses stable billing refs", () => {
  const route = readFileSync(
    "app/api/geo/article-illustrations/retry/route.ts",
    "utf8",
  )
  assert.match(route, /withAuth/)
  assert.match(route, /fetchOwnedMatrixProject/)
  assert.match(route, /failedIllustrationIds/)
  assert.match(route, /geo-article-illustration/)
  assert.doesNotMatch(route, /randomBytes|randomUUID/)
  assert.doesNotMatch(route, /RUNNINGHUB|workflowId|modelId/)
})

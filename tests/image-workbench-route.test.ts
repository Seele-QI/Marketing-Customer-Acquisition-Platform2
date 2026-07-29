import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("image workbench generate route validates, charges by mode, and proxies", () => {
  const route = readFileSync("app/api/image-workbench/generate/route.ts", "utf8")
  assert.match(route, /withAuth/)
  assert.match(route, /parseImageWorkbenchRequest/)
  assert.ok(
    route.lastIndexOf("parseImageWorkbenchRequest") < route.indexOf("await chargeCredit"),
    "request must be parsed before charging credit",
  )
  assert.match(route, /poster_image/)
  assert.match(route, /image_creation/)
  assert.match(route, /IMAGE_WORKBENCH_STRATEGIES/)
  assert.match(route, /\/api\/image-workbench\/generate/)
  assert.doesNotMatch(route, /ARK_/)
})

test("image workbench status authenticates without another charge", () => {
  const route = readFileSync("app/api/image-workbench/status/route.ts", "utf8")
  assert.match(route, /withAuth/)
  assert.match(route, /fastapiPathWithQuery/)
  assert.match(route, /\/api\/image-workbench\/status/)
  assert.doesNotMatch(route, /chargeCredit/)
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const ROOT = process.cwd()

function source(relativePath: string): string {
  return readFileSync(path.join(ROOT, relativePath), "utf8")
}

test("identity positioning does not expose or submit a model choice", () => {
  const wizard = source("components/ip-positioning/positioning-intake-wizard.tsx")
  const page = source("components/account-positioning.tsx")
  const skill = source("lib/ip-positioning-skill.ts")

  assert.equal(wizard.includes("AiModelPicker"), false)
  assert.equal(wizard.includes("useAiModels"), false)
  assert.equal(wizard.includes("modelId"), false)
  assert.equal(page.includes("modelId:"), false)
  assert.equal(skill.includes("IP_POSITIONING_ALLOWED_MODELS"), false)
  assert.equal(skill.includes("IP_POSITIONING_FAILOVER_ORDER"), false)
  assert.equal(skill.includes("DEFAULT_IP_POSITIONING_MODEL"), false)
})

test("identity positioning route ignores legacy client model fields", () => {
  const route = source("app/api/ai/ip-positioning/route.ts")

  assert.equal(route.includes("body.modelId"), false)
  assert.equal(route.includes("resolveIpPositioningModel"), false)
  assert.match(route, /candidate\.source === ["']cloud["']/)
})

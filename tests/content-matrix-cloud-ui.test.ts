import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("content matrix uses the approved layered panel without a model selector", async () => {
  const [panel, view, grid] = await Promise.all([
    readFile(
      new URL("../components/geo/matrix/geo-matrix-config-panel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../components/geo-content-matrix-view.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../components/geo/matrix/geo-matrix-grid.tsx", import.meta.url),
      "utf8",
    ),
  ])

  assert.match(panel, /云端智能调度/)
  assert.match(panel, /内容策略（按需选择）/)
  assert.match(panel, /normalizedPlatforms\.length\s*\*\s*MATRIX_DAYS/)
  assert.match(panel, /准备生成/)
  assert.equal(panel.includes("GeoLlmProviderSelect"), false)
  assert.equal(panel.includes("onProviderChange"), false)
  assert.doesNotMatch(view, /useState<LlmProviderId>/)
  assert.doesNotMatch(view, /\bprovider\s*,\s*\n\s*platforms/)
  assert.match(view, /data-tutorial-id="geo-matrix-view"/)
  assert.equal(grid.includes("AI 引擎"), false)
})

test("matrix panel relocates platform selection and auto-loads platform skills", async () => {
  const [panel, registry] = await Promise.all([
    readFile(
      new URL("../components/geo/matrix/geo-matrix-config-panel.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/geo/skills-registry.ts", import.meta.url), "utf8"),
  ])

  assert.equal((panel.match(/发布平台（多选）/g) ?? []).length, 1)
  assert.match(panel, /目标优化模型/)
  assert.match(panel, /viralSkillIdsForPlatforms/)
  assert.match(panel, /normalizeMatrixPlatformSelection/)
  assert.match(panel, /getDefaultMatrixModelWeightSkill/)
  assert.doesNotMatch(panel, /平台爆款策略列表/)
  assert.doesNotMatch(panel, /listPlatformViralSkills/)
  assert.match(registry, /model-doubao/)
})

test("matrix generation route accepts only cloud-distributed models", async () => {
  const [route, types, api] = await Promise.all([
    readFile(
      new URL("../app/api/geo/matrix-projects/[id]/generate/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../lib/geo/matrix-types.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/geo/matrix-api.ts", import.meta.url), "utf8"),
  ])

  assert.match(route, /listCopywritingProviderCandidates\(\{\s*hasImages:\s*false\s*\}\)/)
  assert.match(route, /candidate\.source\s*===\s*["']cloud["']/)
  assert.match(route, /sanitizeMatrixPlatformIds\(body\.platforms\)/)
  assert.match(route, /CLOUD_MODEL_NOT_READY/)
  assert.match(route, /CLOUD_MODEL_UNAVAILABLE/)
  assert.match(route, /provider:\s*["']cloud-managed["']/)
  assert.match(route, /generatedAt:\s*new Date\(\)\.toISOString\(\)/)
  assert.equal(route.includes("VALID_PROVIDERS"), false)
  assert.doesNotMatch(route, /body\.provider/)
  assert.doesNotMatch(types, /GenerateMatrixRequest\s*=\s*\{[\s\S]*?provider:/)
  assert.doesNotMatch(api, /provider:\s*patch\.provider/)
})

test("GEO views stay mounted while navigation only changes visibility", async () => {
  const workspace = await readFile(
    new URL("../components/geo/geo-workspace.tsx", import.meta.url),
    "utf8",
  )

  assert.match(workspace, /panelClass\(activeView === GEO_VIEWS\.KNOWLEDGE_BASE\)/)
  assert.match(workspace, /panelClass\(activeView === GEO_VIEWS\.CONTENT_MATRIX\)/)
  assert.match(workspace, /panelClass\(activeView === GEO_VIEWS\.ARTICLE_EDITOR\)/)
  assert.doesNotMatch(
    workspace,
    /activeView === GEO_VIEWS\.[A-Z_]+ \? <Geo[A-Za-z]+View \/> : null/,
  )
})

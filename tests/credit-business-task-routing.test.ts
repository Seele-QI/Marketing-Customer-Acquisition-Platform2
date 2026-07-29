import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)

async function source(path: string): Promise<string> {
  return readFile(new URL(path, root), "utf8")
}

test("digital-human v2 reuses one business task across plan, generation, and retry", async () => {
  const [workflow, planRoute, videoRoute] = await Promise.all([
    source("components/dh-video-v2-workflow.tsx"),
    source("app/api/dh-video-v2/plan-script/route.ts"),
    source("routes/dh_video_v2_routes.py"),
  ])

  assert.match(workflow, /business_task_id:\s*businessTaskId/)
  assert.match(workflow, /clientTaskId:\s*businessTaskId/)
  assert.match(planRoute, /businessTaskId:\s*body\.business_task_id/)
  assert.match(planRoute, /businessType:\s*["']video_digital_human["']/)
  assert.match(planRoute, /billingStage:\s*["']script["']/)
  assert.match(videoRoute, /business_task_id=business_task_id/)
  assert.match(videoRoute, /business_type=["']video_digital_human["']/)
  assert.match(videoRoute, /billing_stage=["']video_generation["']/)
  assert.match(videoRoute, /billing_stage=["']video_retry["']/)
})

test("economy digital-human groups clone, generation, and retry under its server task", async () => {
  const videoRoute = await source("routes/dh_video_economy_routes.py")

  assert.ok((videoRoute.match(/business_task_id=task_id/g) || []).length >= 3)
  assert.match(videoRoute, /billing_stage=["']voice_clone["']/)
  assert.match(videoRoute, /billing_stage=["']video_generation["']/)
  assert.match(videoRoute, /billing_stage=["']video_retry["']/)
})

test("GEO article, matrix, and enterprise generation attach complete-task billing", async () => {
  const [article, router, matrix, enterprise] = await Promise.all([
    source("lib/geo/article-generate.ts"),
    source("lib/geo/llm/router.ts"),
    source("app/api/geo/matrix-projects/[id]/generate/route.ts"),
    source("app/api/geo/enterprise-skill/generate/route.ts"),
  ])

  assert.match(article, /businessTaskId:\s*params\.batchId/)
  assert.match(article, /businessType:\s*["']geo_article_batch["']/)
  assert.match(router, /businessTask:\s*billing\.businessTask/)
  assert.match(matrix, /businessType:\s*["']geo_matrix["']/)
  assert.match(enterprise, /businessType:\s*["']geo_enterprise_skill["']/)
  assert.match(matrix, /billingStage:\s*["']llm_generation["']/)
  assert.match(enterprise, /billingStage:\s*["']llm_generation["']/)
})

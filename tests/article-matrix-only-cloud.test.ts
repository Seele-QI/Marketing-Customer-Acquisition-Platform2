import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { completeCloudArticleText } from "../lib/geo/article-cloud-completion.ts"
import type { CopywritingProviderCandidate } from "../lib/llm/copywriting-router.ts"

const read = (path: string) => readFile(new URL(path, import.meta.url), "utf8")

test("article creation UI is matrix-only and has no user model or platform selectors", async () => {
  const [view, panel] = await Promise.all([
    read("../components/geo-article-editor-view.tsx"),
    read("../components/geo/article/geo-article-batch-panel.tsx"),
  ])

  assert.doesNotMatch(view, /GeoLlmProviderSelect/)
  assert.doesNotMatch(view, /ARTICLE_PROVIDER_KEY/)
  assert.doesNotMatch(view, /GeoSkillToolbar/)
  assert.match(view, /云端智能调度/)

  assert.doesNotMatch(panel, /自定义方向/)
  assert.doesNotMatch(panel, /创作方向/)
  assert.doesNotMatch(panel, /发布平台（多选）/)
  assert.doesNotMatch(panel, /MATRIX_PLATFORMS/)
  assert.doesNotMatch(panel, /togglePlatform/)
  assert.doesNotMatch(panel, /provider:/)
  assert.match(panel, /矩阵项目/)
  assert.match(panel, /发布日期（多选）/)
  assert.match(panel, /每组合篇数/)
  assert.match(panel, /projectDetail\?\.id\s*===\s*projectId/)
  assert.match(panel, /normalizeSelectedMatrixDates/)
  assert.match(panel, /result\.failCount/)
  assert.match(view, /snapshot\?\.mode/)
  assert.match(view, /activeArticle\?\.projectId/)
})

test("article routes ignore client model, platform and Skill overrides", async () => {
  const [batchRoute, retryRoute, scoreRoute, types] = await Promise.all([
    read("../app/api/geo/articles/batch-generate/route.ts"),
    read("../app/api/geo/articles/retry/route.ts"),
    read("../app/api/geo/articles/score/route.ts"),
    read("../lib/geo/article-types.ts"),
  ])

  for (const route of [batchRoute, retryRoute]) {
    assert.doesNotMatch(route, /body\.provider/)
    assert.doesNotMatch(route, /body\.platformIds/)
    assert.doesNotMatch(route, /body\.modelSkillId/)
    assert.doesNotMatch(route, /body\.viralSkillIds/)
    assert.doesNotMatch(route, /body\.enterpriseSnapshot/)
    assert.match(route, /source\s*===\s*["']cloud["']/)
    assert.match(route, /viralSkillIdsForPlatforms/)
  }

  assert.doesNotMatch(scoreRoute, /body\.provider/)
  assert.match(scoreRoute, /source\s*===\s*["']cloud["']/)
  assert.doesNotMatch(types, /BatchGenerateRequest\s*=\s*\{[\s\S]*?provider:/)
  assert.doesNotMatch(types, /RetryArticleRequest\s*=\s*\{[\s\S]*?provider:/)
})

test("article cloud routes expose stable unavailable error codes", async () => {
  const [batchRoute, retryRoute, scoreRoute] = await Promise.all([
    read("../app/api/geo/articles/batch-generate/route.ts"),
    read("../app/api/geo/articles/retry/route.ts"),
    read("../app/api/geo/articles/score/route.ts"),
  ])

  for (const route of [batchRoute, retryRoute, scoreRoute]) {
    assert.match(route, /CLOUD_MODEL_NOT_READY/)
    assert.match(route, /CLOUD_MODEL_UNAVAILABLE/)
  }
})

test("article cloud completion fails over and bills only the successful channel", async () => {
  const providers: CopywritingProviderCandidate[] = [
    {
      source: "cloud",
      name: "primary",
      adapter: "openai_chat",
      url: "https://primary.test/v1/chat/completions",
      apiKey: "secret-primary",
      model: "primary-model",
      timeoutMs: 1_000,
    },
    {
      source: "cloud",
      name: "backup",
      adapter: "openai_chat",
      url: "https://backup.test/v1/chat/completions",
      apiKey: "secret-backup",
      model: "backup-model",
      timeoutMs: 1_000,
    },
  ]
  const calls: string[] = []
  const billed: string[] = []
  const text = await completeCloudArticleText({
    providers,
    system: "system",
    user: "user",
    fetchImpl: async (input) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("primary")) return new Response("upstream", { status: 500 })
      return Response.json({ choices: [{ message: { content: "有效文章" } }] })
    },
    settleBilling: async (provider) => {
      billed.push(provider.model)
    },
  })

  assert.equal(text, "有效文章")
  assert.deepEqual(calls, [providers[0].url, providers[1].url])
  assert.deepEqual(billed, ["backup-model"])
})

test("article cloud completion retries the full cloud chain after transient saturation", async () => {
  const providers: CopywritingProviderCandidate[] = [
    {
      source: "cloud",
      name: "primary",
      adapter: "openai_chat",
      url: "https://primary.test/v1/chat/completions",
      apiKey: "secret-primary",
      model: "primary-model",
      timeoutMs: 1_000,
    },
    {
      source: "cloud",
      name: "backup",
      adapter: "openai_chat",
      url: "https://backup.test/v1/chat/completions",
      apiKey: "secret-backup",
      model: "backup-model",
      timeoutMs: 1_000,
    },
  ]
  const calls: string[] = []
  const text = await completeCloudArticleText({
    providers,
    system: "system",
    user: "user",
    retryDelayMs: 0,
    maxRounds: 2,
    fetchImpl: async (input) => {
      const url = String(input)
      calls.push(url)
      if (calls.length <= 2) {
        return Response.json({ error: { message: "busy" } }, { status: 503 })
      }
      return Response.json({ choices: [{ message: { content: "恢复后的有效文章" } }] })
    },
  })

  assert.equal(text, "恢复后的有效文章")
  assert.deepEqual(calls, [providers[0].url, providers[1].url, providers[0].url])
})

test("article routes use the exact cloud feature binding and bounded concurrency", async () => {
  const [batchRoute, retryRoute, scoreRoute] = await Promise.all([
    read("../app/api/geo/articles/batch-generate/route.ts"),
    read("../app/api/geo/articles/retry/route.ts"),
    read("../app/api/geo/articles/score/route.ts"),
  ])

  for (const route of [batchRoute, retryRoute, scoreRoute]) {
    assert.match(route, /featureId:\s*["']geo\.article\.generate["']/)
  }
  assert.match(batchRoute, /GEO_ARTICLE_GENERATION_CONCURRENCY/)
  assert.match(batchRoute, /GEO_ARTICLE_PROVIDER_TIMEOUT_MS/)
  assert.match(retryRoute, /GEO_ARTICLE_PROVIDER_TIMEOUT_MS/)
  assert.match(batchRoute, /:\s*keepalive\\n\\n/)
  assert.doesNotMatch(batchRoute, /concurrency:\s*20/)
})

test("article matrix UI retains the last valid project during transient refresh errors", async () => {
  const panel = await read("../components/geo/article/geo-article-batch-panel.tsx")
  assert.doesNotMatch(panel, /\.catch\(\(\) => \{\s*if \(!cancelled\) setProjects\(\[\]\)/)
  assert.doesNotMatch(panel, /\.catch\(\(\) => \{\s*if \(!cancelled\) setProjectDetail\(null\)/)
})

test("article cloud completion reports stable codes when cloud candidates are absent", async () => {
  await assert.rejects(
    () => completeCloudArticleText({ providers: [], system: "s", user: "u" }),
    (error: unknown) => {
      const actual = error as Error & { code?: string; statusCode?: number }
      assert.equal(actual.code, "CLOUD_MODEL_NOT_READY")
      assert.equal(actual.statusCode, 503)
      assert.doesNotMatch(actual.message, /CLOUD_MODEL_NOT_READY/)
      return true
    },
  )
})

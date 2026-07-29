import assert from "node:assert/strict"
import test from "node:test"

import { completeCloudCopywritingText } from "../lib/geo/cloud-copywriting-completion.ts"
import { generateMatrixConcurrent } from "../lib/geo/matrix-generate.ts"
import * as matrixPlatforms from "../lib/geo/matrix-platforms.ts"
import type { CopywritingProviderCandidate } from "../lib/llm/copywriting-router.ts"

function provider(name: string): CopywritingProviderCandidate {
  return {
    source: "cloud",
    name,
    adapter: "openai_chat",
    url: `https://${name}.example/v1/chat/completions`,
    apiKey: `${name}-secret`,
    model: `${name}-model`,
    timeoutMs: 1_000,
  }
}

test("validated cloud completion skips syntactically successful but unusable output", async () => {
  const attempted: string[] = []
  const result = await completeCloudCopywritingText({
    providers: [provider("primary"), provider("backup")],
    messages: [{ role: "user", content: "return JSON" }],
    validateText: (text) => {
      try {
        return Boolean((JSON.parse(text) as { ok?: boolean }).ok)
      } catch {
        return false
      }
    },
    fetchImpl: (async (url: string | URL | Request) => {
      const name = String(url).includes("primary") ? "primary" : "backup"
      attempted.push(name)
      return Response.json({
        choices: [{ message: { content: name === "primary" ? "not-json" : '{"ok":true}' } }],
      })
    }) as typeof fetch,
  })

  assert.equal(result.ok, true)
  assert.deepEqual(attempted, ["primary", "backup"])
  if (!result.ok) assert.fail("expected a successful backup completion")
  assert.equal(result.provider.name, "backup")
  assert.equal(result.failures[0]?.reason, "missing_body")
})

test("matrix generation rejects when cloud completion cannot produce platform content", async () => {
  await assert.rejects(
    () =>
      generateMatrixConcurrent({
        projectName: "精诚法税",
        platforms: ["xiaohongshu"],
        complete: async () => {
          throw Object.assign(new Error("all cloud channels failed"), {
            code: "CLOUD_MODEL_UNAVAILABLE",
          })
        },
      }),
    /all cloud channels failed|MATRIX_PLATFORM_INCOMPLETE/,
  )
})

test("matrix platform input is deduplicated and limited to the supported whitelist", () => {
  const sanitize = (
    matrixPlatforms as typeof matrixPlatforms & {
      sanitizeMatrixPlatformIds?: (raw: unknown) => string[]
    }
  ).sanitizeMatrixPlatformIds

  assert.equal(typeof sanitize, "function")
  if (!sanitize) return
  assert.deepEqual(
    sanitize([
      "xiaohongshu",
      "xiaohongshu",
      "unknown-platform",
      42,
      ...Array.from({ length: 100 }, () => "douyin"),
      "zhihu",
    ]),
    ["xiaohongshu", "douyin", "zhihu"],
  )
})

test("matrix generation rejects fourteen dated cells whose required content is empty", async () => {
  const startIso = matrixPlatforms.matrixStartDateIso()
  const emptyCells = matrixPlatforms.matrixDateRange(startIso).map((date) => ({ date }))
  const emptyMatrix = JSON.stringify({
    platforms: [{ platformId: "xiaohongshu", cells: emptyCells }],
  })

  await assert.rejects(
    () =>
      generateMatrixConcurrent({
        projectName: "精诚法税",
        platforms: ["xiaohongshu"],
        complete: async ({ maxTokens }) => {
          if (maxTokens < 8_000) throw new Error("use deterministic theme seed")
          return emptyMatrix
        },
      }),
    /MATRIX_PLATFORM_INCOMPLETE/,
  )
})

test("matrix generation discards an empty duplicate that precedes a usable cell", async () => {
  const startIso = matrixPlatforms.matrixStartDateIso()
  const cells = matrixPlatforms.matrixDateRange(startIso).flatMap((date, index) => [
    { date },
    {
      date,
      week: index < 7 ? 1 : 2,
      themeArc: "法税合规",
      title: `有效主题 ${index + 1}`,
      contentDirection: "讲清一个真实法税问题",
      format: "图文",
      geoIntent: "问题解答",
      platformNative: "小红书原生表达",
    },
  ])
  const response = JSON.stringify({
    platforms: [{ platformId: "xiaohongshu", cells }],
  })

  const matrix = await generateMatrixConcurrent({
    projectName: "精诚法税",
    platforms: ["xiaohongshu"],
    complete: async ({ maxTokens }) => {
      if (maxTokens < 8_000) throw new Error("use deterministic theme seed")
      return response
    },
  })

  assert.equal(matrix.platforms[0]?.cells.length, 14)
  assert.ok(
    matrix.platforms[0]?.cells.every((cell) => cell.title.startsWith("有效主题")),
  )
})

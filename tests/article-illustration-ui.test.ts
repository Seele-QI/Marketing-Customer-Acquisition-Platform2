import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("GEO batch panel exposes the approved zero-to-five illustration control", () => {
  const source = readFileSync(
    "components/geo/article/geo-article-batch-panel.tsx",
    "utf8",
  )
  assert.match(source, /每篇插图/)
  assert.match(source, /geo-article-illustrations-per-article/)
  assert.match(source, /min=\{0\}/)
  assert.match(source, /max=\{ARTICLE_ILLUSTRATIONS_MAX\}/)
  assert.match(source, /illustrationsPerArticle:\s*illustrationCount/)
  assert.match(source, /最多.*张插图/)
  assert.doesNotMatch(source, /图片模型|图片工作流|RunningHub/)
})

test("article callback carries illustration count exactly once", () => {
  const source = readFileSync(
    "components/geo/article/geo-article-batch-panel.tsx",
    "utf8",
  )
  assert.match(source, /onArticle\(event\.article,\s*\{\s*illustrationsPerArticle/)
  assert.doesNotMatch(source, /onArticle,\s*\n\s*\}/)
})

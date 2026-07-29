import assert from "node:assert/strict"
import test from "node:test"

import { parseArticleScorePayload } from "../lib/geo/article-score-parser.ts"

test("score parser rejects unrelated or incomplete JSON", () => {
  assert.equal(parseArticleScorePayload("{}"), null)
  assert.equal(parseArticleScorePayload('{"semanticClarity":80}'), null)
  assert.equal(
    parseArticleScorePayload(
      '{"semanticClarity":"bad","conversationalTone":80,"evidenceDensity":70,"structuredFaq":60}',
    ),
    null,
  )
})

test("score parser accepts all four finite scores and clamps the range", () => {
  const parsed = parseArticleScorePayload(
    '```json\n{"semanticClarity":120,"conversationalTone":80,"evidenceDensity":70,"structuredFaq":-5,"summary":"可用"}\n```',
  )
  assert.deepEqual(parsed?.scores, {
    semanticClarity: 100,
    conversationalTone: 80,
    evidenceDensity: 70,
    structuredFaq: 0,
  })
  assert.equal(parsed?.summary, "可用")
})

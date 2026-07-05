import assert from "node:assert/strict"
import test from "node:test"

import {
  displayRatesPer1M,
  perCallCredits,
  YUAN_TO_CREDIT,
} from "../lib/llm/model-registry.ts"
import {
  estimateInputTokens,
  estimateMaxCredits,
  parseOpenAiUsage,
  settleCredits,
  tokenCostYuan,
  yuanToCredits,
} from "../lib/llm/pricing.ts"

test("yuanToCredits applies 20% markup and ceil", () => {
  assert.equal(YUAN_TO_CREDIT, 120)
  assert.equal(yuanToCredits(0.25), 30)
  assert.equal(yuanToCredits(0.0051), 1) // ceil(0.612) = 1
  assert.equal(yuanToCredits(0.0875), 11) // ceil(10.5) = 11
  assert.equal(yuanToCredits(0), 1)
})

test("per_call aws claude costs 30 credits", () => {
  assert.equal(perCallCredits(0.25), 30)
  assert.equal(settleCredits("[aws]claude-opus-4-8--25", null), 30)
  assert.equal(settleCredits("[aws]claude-opus-4-7--25", null), 30)
})

test("gpt-5.4 token settle matches hand calculation", () => {
  // 2000 in + 800 out: cost = 0.0015 + 0.0036 = 0.0051 → 1 credit
  assert.equal(
    settleCredits("gpt-5.4", { promptTokens: 2000, completionTokens: 800 }),
    1,
  )
})

test("kiro claude token settle matches hand calculation", () => {
  // 10k in + 3k out: cost = 0.035 + 0.0525 = 0.0875 → 11 credits
  assert.equal(
    settleCredits("[kiro]claude-opus-4-7", {
      promptTokens: 10_000,
      completionTokens: 3_000,
    }),
    11,
  )
})

test("tokenCostYuan includes cache prices", () => {
  const yuan = tokenCostYuan(
    {
      promptTokens: 1_000_000,
      completionTokens: 0,
      cacheReadTokens: 1_000_000,
      cacheCreationTokens: 1_000_000,
    },
    { input: 3.5, output: 17.5, cacheRead: 0.35, cacheCreate: 2.0 },
  )
  assert.equal(yuan, 3.5 + 0.35 + 2.0)
  assert.equal(yuanToCredits(yuan), Math.ceil(5.85 * 120))
})

test("displayRatesPer1M includes profit", () => {
  const rates = displayRatesPer1M({ input: 0.75, output: 4.5, cacheRead: 0.075 })
  assert.equal(rates.inputPer1M, 90)
  assert.equal(rates.outputPer1M, 540)
  assert.equal(rates.cacheReadPer1M, 9)
})

test("estimateInputTokens treats CJK as one token", () => {
  assert.equal(estimateInputTokens("你好世界"), 4)
  assert.ok(estimateInputTokens("abcd") >= 1)
})

test("estimateMaxCredits for per_call is fixed", () => {
  assert.equal(estimateMaxCredits("[aws]claude-opus-4-8--25", "任意长文本"), 30)
})

test("estimateMaxCredits for token uses max_tokens ceiling", () => {
  const est = estimateMaxCredits("gpt-5.4", "短", 1000)
  assert.ok(est >= 1)
  // 1 prompt + 1000 completion on gpt-5.4: (1/1e6)*0.75 + (1000/1e6)*4.5 ≈ 0.0045 → 1
  assert.equal(est, 1)
})

test("parseOpenAiUsage reads standard and cache fields", () => {
  const u = parseOpenAiUsage({
    prompt_tokens: 100,
    completion_tokens: 50,
    cache_read_input_tokens: 10,
    cache_creation_input_tokens: 5,
  })
  assert.deepEqual(u, {
    promptTokens: 100,
    completionTokens: 50,
    cacheReadTokens: 10,
    cacheCreationTokens: 5,
  })
  assert.equal(parseOpenAiUsage(null), null)
})

test("settleCredits rejects unknown model", () => {
  assert.throws(() => settleCredits("no-such-model", null), /未知/)
})

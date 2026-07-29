import assert from "node:assert/strict"
import test from "node:test"

import { buildPosterPrompt } from "@/lib/poster/prompt"

test("poster prompt combines purpose, copy, style and ratio without an assistant", () => {
  const prompt = buildPosterPrompt({
    purpose: "新品首发",
    headline: "夏日轻盈上新",
    body: "到店体验",
    style: "高级简约",
    aspectRatio: "4:3",
    orientation: "landscape",
  })

  assert.match(prompt, /新品首发/)
  assert.match(prompt, /夏日轻盈上新/)
  assert.match(prompt, /到店体验/)
  assert.match(prompt, /高级简约/)
  assert.match(prompt, /4:3/)
  assert.match(prompt, /横屏/)
  assert.match(prompt, /中文文字准确/)
  assert.match(prompt, /无二维码/)
  assert.doesNotMatch(prompt, /助理/)
})

test("poster prompt omits blank optional copy", () => {
  const prompt = buildPosterPrompt({
    purpose: "品牌宣传",
    headline: "新品上市",
    body: "   ",
    style: "清新自然",
    aspectRatio: "9:25",
    orientation: "portrait",
  })

  assert.match(prompt, /9:25/)
  assert.match(prompt, /竖屏/)
  assert.doesNotMatch(prompt, /辅助文案/)
})

import assert from "node:assert/strict"
import test from "node:test"

import { buildGeneralImagePrompt } from "@/lib/image-workbench/image-prompt"
import { buildPosterWorkbenchPrompt } from "@/lib/image-workbench/poster-prompt"

test("poster prompt explains reference roles in stable order", () => {
  const prompt = buildPosterWorkbenchPrompt({
    template: "品牌宣传",
    purpose: "门店引流",
    headline: "夏日上新",
    body: "到店体验",
    style: "高级简约",
    aspectRatio: "3:4",
    orientation: "portrait",
    referenceRoles: ["subject", "style"],
  })

  assert.match(prompt, /第 1 张参考图是商品或主体图/)
  assert.match(prompt, /第 2 张参考图是风格参考图/)
  assert.match(prompt, /不要复制参考图中的文字/)
  assert.match(prompt, /夏日上新/)
  assert.match(prompt, /3:4/)
})

test("poster prompt omits reference language without references", () => {
  const prompt = buildPosterWorkbenchPrompt({
    template: "知识海报",
    purpose: "知识分享",
    headline: "三个经营技巧",
    body: "",
    style: "清新自然",
    aspectRatio: "1:1",
    orientation: "landscape",
    referenceRoles: [],
  })
  assert.doesNotMatch(prompt, /第 1 张参考图/)
  assert.match(prompt, /方形构图/)
})

test("poster prompt includes the studio creative direction", () => {
  const prompt = buildPosterWorkbenchPrompt({
    template: "品牌宣传",
    purpose: "新品发布",
    headline: "轻盈新生",
    body: "限时上市",
    creativeDirection: "暖灰背景，产品居中，右侧留白",
    style: "高级简约",
    aspectRatio: "3:4",
    orientation: "portrait",
    referenceRoles: [],
  })
  assert.match(prompt, /画面创意：暖灰背景，产品居中，右侧留白/)
})

test("general image prompt maps preserve-subject reference mode", () => {
  const prompt = buildGeneralImagePrompt({
    template: "人物写真",
    description: "城市夜景中的女性半身照",
    requirements: "自然肤质",
    aspectRatio: "9:16",
    orientation: "portrait",
    referenceMode: "preserve_subject",
    referenceCount: 2,
  })

  assert.match(prompt, /保持参考图中的人物、商品或主体身份特征/)
  assert.match(prompt, /自然肤质/)
  assert.match(prompt, /摄影质感/)
})

test("general image prompt omits reference mode for text-to-image", () => {
  const prompt = buildGeneralImagePrompt({
    template: "自由创作",
    description: "漂浮在云海上的玻璃城市",
    requirements: "",
    aspectRatio: "16:9",
    orientation: "landscape",
    referenceMode: "style_only",
    referenceCount: 0,
  })
  assert.doesNotMatch(prompt, /参考图/)
  assert.match(prompt, /漂浮在云海上的玻璃城市/)
})

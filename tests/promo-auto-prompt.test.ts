import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  buildPromoAutoPromptRequest,
  generatePromoAutoPromptWithGpt,
  isPromoAutoPromptAvailable,
} from "@/lib/promo-video/auto-prompt-ai"
import {
  PROMO_SEEDANCE_PROMPT_SYSTEM,
  buildPromoAutoPromptUserMessage,
} from "@/lib/promo-video/prompt-system"

function setEnv(name: string, value: string | undefined): () => void {
  const previous = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  return () => {
    if (previous === undefined) delete process.env[name]
    else process.env[name] = previous
  }
}

describe("promo auto-prompt", () => {
  it("buildPromoAutoPromptRequest maps storyboard count and script", () => {
    const req = buildPromoAutoPromptRequest({
      promo_script: "  宣传口播  ",
      duration: 30,
      selected_count: 3,
      visual_style: "商业广告",
      has_audio_ref: true,
    })
    assert.equal(req.promo_script, "宣传口播")
    assert.equal(req.duration, 30)
    assert.equal(req.selected_count, 3)
    assert.equal(req.visual_style, "商业广告")
    assert.equal(req.has_audio_ref, true)

    const userMsg = buildPromoAutoPromptUserMessage(req)
    assert.match(userMsg, /故事性宣传片/)
    assert.match(userMsg, /分镜第 1 格/)
    assert.match(userMsg, /Image1.*Image2.*Image3/)
    assert.match(userMsg, /30 秒/)
    assert.match(userMsg, /勿默认每张都是产品主体/)
  })

  it("system prompt emphasizes narrative storyboard camera movement", () => {
    assert.match(PROMO_SEEDANCE_PROMPT_SYSTEM, /Seedance 2\.0/)
    assert.match(PROMO_SEEDANCE_PROMPT_SYSTEM, /叙事分镜/)
    assert.match(PROMO_SEEDANCE_PROMPT_SYSTEM, /并非每张都是主体/)
    assert.match(PROMO_SEEDANCE_PROMPT_SYSTEM, /【叙事弧线】/)
    assert.match(PROMO_SEEDANCE_PROMPT_SYSTEM, /运镜/)
  })

  it("rejects invalid duration without calling LLM", async () => {
    const restore = setEnv("SONETTO_GPT_API_KEY", "sk-test")
    try {
      const result = await generatePromoAutoPromptWithGpt({
        promo_script: "测试文案",
        duration: 20,
        selected_count: 2,
      })
      assert.equal(result.ok, false)
      if (result.ok) throw new Error("expected failure")
      assert.equal(result.status, 400)
      assert.match(result.detail, /15 秒/)
    } finally {
      restore()
    }
  })

  it("returns 503 when GPT key is missing", async () => {
    const restores = [
      setEnv("NEWAPI_KEY", undefined),
      setEnv("SONETTO_GPT_API_KEY", undefined),
    ]
    try {
      assert.equal(isPromoAutoPromptAvailable(), false)
      const result = await generatePromoAutoPromptWithGpt({
        promo_script: "测试",
        duration: 15,
        selected_count: 1,
      })
      assert.equal(result.ok, false)
      if (result.ok) throw new Error("expected failure")
      assert.equal(result.status, 503)
    } finally {
      for (const r of restores.reverse()) r()
    }
  })

  it("calls sonetto GPT with promo narrative storyboard system prompt", async () => {
    const restores = [
      setEnv("SONETTO_GPT_API_KEY", "sk-test"),
      setEnv("NEWAPI_GPT_MODEL", "gpt-5.5"),
    ]
    const originalFetch = globalThis.fetch
    let capturedBody: {
      model: string
      messages: Array<{ role: string; content: string }>
    } | null = null

    globalThis.fetch = (async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body)) as typeof capturedBody
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  "【主题】都市晨光中的从容开启\n【时间轴】0-5s：参考 @图1，环境空镜，slow dolly-in",
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }) as typeof fetch

    try {
      const result = await generatePromoAutoPromptWithGpt({
        promo_script: "完整宣传口播文案",
        duration: 15,
        selected_count: 2,
        has_audio_ref: false,
      })
      assert.equal(result.ok, true)
      if (!result.ok) throw new Error("expected success")
      assert.match(result.prompt, /时间轴/)

      assert.ok(capturedBody)
      assert.equal(capturedBody!.model, "gpt-5.5")
      assert.equal(capturedBody!.messages[0]?.role, "system")
      assert.equal(capturedBody!.messages[0]?.content, PROMO_SEEDANCE_PROMPT_SYSTEM)
      assert.match(capturedBody!.messages[1]?.content ?? "", /故事性宣传片/)
    } finally {
      globalThis.fetch = originalFetch
      for (const r of restores.reverse()) r()
    }
  })
})

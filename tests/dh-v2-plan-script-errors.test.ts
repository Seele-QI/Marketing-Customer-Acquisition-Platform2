import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { formatDhVideoV2Error } from "../lib/dh-video-v2/api.ts"

describe("dh-v2 plan-script error formatting", () => {
  it("preserves the cloud model binding error without replacing it with legacy env hints", () => {
    const msg = formatDhVideoV2Error("云端未给分镜功能下发可用模型", 503, {
      code: "PLAN_LLM_NOT_CONFIGURED",
      message: "云端未给分镜功能下发可用模型",
    })
    assert.match(msg, /云端/)
    assert.doesNotMatch(msg, /NEWAPI_KEY|DEEPSEEK_API_KEY/)
    assert.equal(msg.includes("引擎 API 密钥无效"), false)
  })

  it("does not flatten a cloud plan configuration failure", () => {
    const msg = formatDhVideoV2Error(
      "未配置分镜大模型：云端功能未绑定模型",
      503,
    )
    assert.equal(msg, "未配置分镜大模型：云端功能未绑定模型")
  })

  it("annotates provider network failures as local network or proxy issues", () => {
    const msg = formatDhVideoV2Error(
      "sonetto_gpt: NewAPI(primary) 报错: timeout；deepseek: 调用 AI 模型失败: fetch failed",
      502,
      { code: "PLAN_LLM_ALL_FAILED" },
    )
    assert.match(msg, /本机网络或代理连接异常/)
  })
})

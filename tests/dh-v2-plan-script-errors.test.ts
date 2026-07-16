import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { formatDhVideoV2Error } from "../lib/dh-video-v2/api.ts"

describe("dh-v2 plan-script error formatting", () => {
  it("preserves PLAN_LLM_NOT_CONFIGURED with actionable desktop hint", () => {
    const msg = formatDhVideoV2Error("未配置分镜大模型 API Key", 503, {
      code: "PLAN_LLM_NOT_CONFIGURED",
      message: "未配置分镜大模型 API Key",
    })
    assert.match(msg, /桌面安装包/)
    assert.match(msg, /NEWAPI_KEY|DEEPSEEK/)
    assert.equal(msg.includes("引擎 API 密钥无效"), false)
  })

  it("does not flatten generic API Key failures that mention 分镜", () => {
    const msg = formatDhVideoV2Error(
      "未配置分镜大模型 API Key，请配置 NEWAPI_KEY 或 DEEPSEEK_API_KEY",
      503,
    )
    assert.match(msg, /分镜/)
    assert.equal(msg, "未配置分镜大模型 API Key。桌面安装包请先登录并等待云端配置同步；开发机请配置 NEWAPI_KEY 或 DEEPSEEK_API_KEY。")
  })

  it("annotates 502 NewAPI / DeepSeek failures as egress/proxy issues", () => {
    const msg = formatDhVideoV2Error(
      "sonetto_gpt: NewAPI(primary) 报错: timeout；deepseek: 调用 AI 模型失败: fetch failed",
      502,
      { code: "PLAN_LLM_ALL_FAILED" },
    )
    assert.match(msg, /外网不通或代理干扰/)
  })
})

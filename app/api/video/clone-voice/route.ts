import { NextResponse } from "next/server"

export const maxDuration = 120

type Body = {
  audioBase64?: string
  script?: string
}

/**
 * 音色克隆 API（预留接口）
 *
 * 当前为 Mock 实现，后续接入 Gradio TTS / GPT-SoVITS / CosyVoice 等服务。
 * 正式接入时：上传参考音频 → 克隆音色 → 用克隆音色朗读 script → 返回音频 Base64
 */
export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : ""
  const script = typeof body.script === "string" ? body.script.trim() : ""

  if (!audioBase64 || !script) {
    return NextResponse.json(
      { detail: "缺少必填参数：audioBase64、script" },
      { status: 400 },
    )
  }

  // TODO: Replace with real voice cloning API call
  // const res = await fetch("http://127.0.0.1:7860/...", { ... })

  return NextResponse.json({
    audioBase64: "",
    message: "Mock: 音色克隆接口已预留。请接入 Gradio TTS 或 GPT-SoVITS 服务。",
  })
}

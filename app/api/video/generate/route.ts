import { NextResponse } from "next/server"

export const maxDuration = 300 // 5 min timeout, real generation takes 20-50 min (async)

type Body = {
  imageBase64?: string
  audioBase64?: string
  script?: string
  resolution?: string
  bgColor?: string
}

/**
 * 视频生成 API（预留接口）
 *
 * 当前为 Mock 实现，后续接入 RunningHub / HeyGen / D-ID 等数字人视频生成服务。
 * 正式接入时：提交异步任务 → 返回 taskId → 客户端轮询 /api/video/status
 */
export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : ""
  const audioBase64 = typeof body.audioBase64 === "string" ? body.audioBase64 : ""
  const script = typeof body.script === "string" ? body.script.trim() : ""

  if (!imageBase64 || !audioBase64 || !script) {
    return NextResponse.json(
      { detail: "缺少必填参数：imageBase64、audioBase64、script" },
      { status: 400 },
    )
  }

  // TODO: Replace with real RunningHub / HeyGen API call
  // const runningHubRes = await fetch("https://api.runninghub.com/...", { ... })

  const taskId = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  return NextResponse.json({
    taskId,
    status: "queued",
    estimatedMinutes: 30,
    message: "任务已提交，正在排队处理。预计 20-50 分钟完成。",
  })
}

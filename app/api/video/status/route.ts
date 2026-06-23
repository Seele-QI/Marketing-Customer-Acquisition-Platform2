import { NextResponse } from "next/server"

/**
 * 视频任务状态查询（预留接口）
 *
 * GET /api/video/status?taskId=xxx
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const taskId = url.searchParams.get("taskId")

  if (!taskId) {
    return NextResponse.json({ detail: "缺少 taskId 参数" }, { status: 400 })
  }

  // TODO: Query real task status from RunningHub / database
  return NextResponse.json({
    taskId,
    status: "processing",
    progress: 45,
    message: "Mock: 正在处理中...",
  })
}

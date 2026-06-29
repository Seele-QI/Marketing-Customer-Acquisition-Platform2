import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"
/** 后端同步等待音频克隆，最长约 10 分钟 */
export const maxDuration = 600

export async function POST(req: Request) {
  return proxyToFastapi(req, "/api/video/generate")
}

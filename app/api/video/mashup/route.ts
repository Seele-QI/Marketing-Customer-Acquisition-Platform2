import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"
/** 接收大 payload + 解码素材后快速返回 task_id */
export const maxDuration = 120

export async function POST(req: Request) {
  return proxyToFastapi(req, "/api/video/mashup")
}

import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"
/** 智凌 ASR / NLS 最长约 3 分钟，留足代理超时 */
export const maxDuration = 300

export async function POST(req: Request) {
  return proxyToFastapi(req, "/api/copywriting/extract")
}

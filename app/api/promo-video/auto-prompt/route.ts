import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(req: Request) {
  return proxyToFastapi(req, "/api/promo-video/auto-prompt")
}

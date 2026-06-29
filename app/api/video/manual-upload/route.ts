import { proxyMultipartToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(req: Request) {
  return proxyMultipartToFastapi(req, "/api/video/manual-upload")
}

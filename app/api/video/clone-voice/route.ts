import { proxyToFastapi } from "@/lib/fastapi-base"

export const maxDuration = 600

export async function POST(req: Request) {
  return proxyToFastapi(req, "/api/video/clone-voice")
}

import { fastapiPathWithQuery, proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function GET(req: Request) {
  return proxyToFastapi(req, fastapiPathWithQuery(req, "/api/dh-video-v2/status"))
}

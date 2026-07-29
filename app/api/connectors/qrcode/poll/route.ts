import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(req: Request) {
  return proxyToFastapi(req, "/api/connectors/qrcode/poll")
}

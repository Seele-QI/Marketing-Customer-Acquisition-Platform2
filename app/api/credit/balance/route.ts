import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function GET(req: Request) {
  return proxyToFastapi(req, "/api/credit/balance")
}

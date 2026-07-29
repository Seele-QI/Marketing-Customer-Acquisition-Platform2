import { proxyToFastapi, proxyToFastapiWithTimeout } from "@/lib/fastapi-base"

export const runtime = "nodejs"
export const maxDuration = 900

export async function GET(req: Request) {
  return proxyToFastapi(req, "/api/publish/accounts")
}

export async function POST(req: Request) {
  return proxyToFastapiWithTimeout(req, "/api/publish", 900_000)
}

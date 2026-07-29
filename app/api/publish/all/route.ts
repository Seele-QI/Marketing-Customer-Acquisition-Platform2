import { proxyToFastapiWithTimeout } from "@/lib/fastapi-base"

export const runtime = "nodejs"
export const maxDuration = 900

export async function POST(req: Request) {
  return proxyToFastapiWithTimeout(req, "/api/publish/all", 900_000)
}

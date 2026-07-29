import { proxyToFastapiWithTimeout } from "@/lib/fastapi-base"

export const runtime = "nodejs"
export const maxDuration = 120

export async function POST(req: Request) {
  return proxyToFastapiWithTimeout(req, "/api/connectors/browser/start", 120_000)
}

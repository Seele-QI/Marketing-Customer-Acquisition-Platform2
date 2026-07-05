import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function GET(req: Request) {
  return proxyToFastapi(req, "/api/geo/matrix-projects")
}

export async function POST(req: Request) {
  return proxyToFastapi(req, "/api/geo/matrix-projects")
}

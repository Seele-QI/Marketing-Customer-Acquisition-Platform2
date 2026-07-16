import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const { search } = new URL(req.url)
  return proxyToFastapi(req, `/api/geo/matrix-projects${search}`)
}

export async function POST(req: Request) {
  return proxyToFastapi(req, "/api/geo/matrix-projects")
}

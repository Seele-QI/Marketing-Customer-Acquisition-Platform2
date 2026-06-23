import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function POST(req: Request) {
  return proxyToFastapi(req, "/api/auth/login")
}

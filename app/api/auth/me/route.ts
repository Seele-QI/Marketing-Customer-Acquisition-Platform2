import { proxyToCloudApi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function GET(req: Request) {
  return proxyToCloudApi(req, "/api/auth/me")
}

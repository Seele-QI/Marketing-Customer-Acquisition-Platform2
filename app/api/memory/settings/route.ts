import { proxyMemoryApi } from "@/lib/memory/api-proxy"

export const runtime = "nodejs"

export async function GET(req: Request) {
  return proxyMemoryApi(req, "/api/memory/settings")
}

export async function PATCH(req: Request) {
  return proxyMemoryApi(req, "/api/memory/settings")
}

import { proxyMemoryApi } from "@/lib/memory/api-proxy"

export const runtime = "nodejs"

export async function POST(req: Request) {
  return proxyMemoryApi(req, "/api/memory/clear")
}

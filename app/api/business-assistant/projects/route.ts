import { proxyBusinessAssistantApi } from "@/lib/business-assistant/api-proxy"

export const runtime = "nodejs"

export async function GET(request: Request): Promise<Response> {
  return proxyBusinessAssistantApi(
    request,
    "/api/business-assistant/projects",
    true,
  )
}

export async function POST(request: Request): Promise<Response> {
  return proxyBusinessAssistantApi(
    request,
    "/api/business-assistant/projects",
  )
}

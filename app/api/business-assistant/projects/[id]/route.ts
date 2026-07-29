import { proxyBusinessAssistantApi } from "@/lib/business-assistant/api-proxy"

export const runtime = "nodejs"

type Context = { params: Promise<{ id: string }> }

export async function GET(
  request: Request,
  { params }: Context,
): Promise<Response> {
  const { id } = await params
  return proxyBusinessAssistantApi(
    request,
    `/api/business-assistant/projects/${encodeURIComponent(id)}`,
  )
}

export async function PATCH(
  request: Request,
  { params }: Context,
): Promise<Response> {
  const { id } = await params
  return proxyBusinessAssistantApi(
    request,
    `/api/business-assistant/projects/${encodeURIComponent(id)}`,
  )
}

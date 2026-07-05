import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(req: Request, context: RouteContext) {
  const { id } = await context.params
  return proxyToFastapi(req, `/api/geo/matrix-projects/${id}`)
}

export async function PATCH(req: Request, context: RouteContext) {
  const { id } = await context.params
  return proxyToFastapi(req, `/api/geo/matrix-projects/${id}`)
}

export async function DELETE(req: Request, context: RouteContext) {
  const { id } = await context.params
  return proxyToFastapi(req, `/api/geo/matrix-projects/${id}`)
}

import { proxyMemoryApi } from "@/lib/memory/api-proxy"

export const runtime = "nodejs"

type Context = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, context: Context) {
  const { id } = await context.params
  return proxyMemoryApi(req, `/api/memory/items/${encodeURIComponent(id)}`)
}

export async function DELETE(req: Request, context: Context) {
  const { id } = await context.params
  return proxyMemoryApi(req, `/api/memory/items/${encodeURIComponent(id)}`, true)
}

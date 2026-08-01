import { proxyMemoryApi } from "@/lib/memory/api-proxy"

export const runtime = "nodejs"

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  let body: { revision?: number; status?: string }
  try {
    body = await req.json() as { revision?: number; status?: string }
  } catch {
    return Response.json({ detail: { code: "INVALID_JSON", message: "请求体须为 JSON" } }, { status: 400 })
  }
  if (body.status !== "active" && body.status !== "disabled") {
    return Response.json({ detail: { code: "INVALID_MEMORY_STATUS", message: "记忆状态无效" } }, { status: 400 })
  }
  const action = body.status === "active" ? "restore" : "disable"
  const forwarded = new Request(req.url, {
    method: "POST",
    headers: req.headers,
    body: JSON.stringify({ revision: body.revision }),
  })
  return proxyMemoryApi(forwarded, `/api/memory/items/${encodeURIComponent(id)}/${action}`)
}

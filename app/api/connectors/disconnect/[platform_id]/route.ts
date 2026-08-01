import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function POST(req: Request, ctx: { params: Promise<{ platform_id: string }> }) {
  const { platform_id } = await ctx.params
  return proxyToFastapi(req, `/api/connectors/disconnect/${encodeURIComponent(platform_id)}`)
}

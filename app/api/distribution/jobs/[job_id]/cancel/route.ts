import { proxyToFastapi } from "@/lib/fastapi-base"
export async function POST(req: Request, context: { params: Promise<{ job_id: string }> }) { const { job_id } = await context.params; return proxyToFastapi(req, `/api/distribution/jobs/${encodeURIComponent(job_id)}/cancel`) }

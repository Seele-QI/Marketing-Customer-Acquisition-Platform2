import { proxyToFastapi } from "@/lib/fastapi-base"
export async function POST(req: Request) { return proxyToFastapi(req, "/api/distribution/jobs") }

import { proxyToCloudApi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function POST(req: Request) {
  return proxyToCloudApi(req, "/api/credit/redeem")
}

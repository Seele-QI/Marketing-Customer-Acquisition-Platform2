import { fastapiPathWithQuery, proxyToCloudApi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function GET(req: Request) {
  return proxyToCloudApi(req, fastapiPathWithQuery(req, "/api/credit/ledger"))
}

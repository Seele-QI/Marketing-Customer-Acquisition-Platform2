import { withAuth } from "@/lib/api/with-auth"
import { fastapiPathWithQuery, proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export const GET = withAuth(async (request) => {
  return proxyToFastapi(
    request,
    fastapiPathWithQuery(request, "/api/poster/status"),
  )
})

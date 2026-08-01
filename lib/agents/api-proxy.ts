import { fastapiPathWithQuery, proxyToCloudApi } from "@/lib/fastapi-base"

export function proxyAgentTeamApi(request: Request, path: string, includeQuery = false) {
  return proxyToCloudApi(request, includeQuery ? fastapiPathWithQuery(request, path) : path)
}


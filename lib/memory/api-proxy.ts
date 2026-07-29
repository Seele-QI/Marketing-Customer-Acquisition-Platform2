import { fastapiPathWithQuery, proxyToCloudApi } from "@/lib/fastapi-base"

export function proxyMemoryApi(req: Request, path: string, includeQuery = false): Promise<Response> {
  return proxyToCloudApi(req, includeQuery ? fastapiPathWithQuery(req, path) : path)
}

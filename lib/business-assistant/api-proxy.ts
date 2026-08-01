import {
  fastapiPathWithQuery,
  proxyToCloudApi,
} from "@/lib/fastapi-base"

export function proxyBusinessAssistantApi(
  request: Request,
  path: string,
  includeQuery = false,
): Promise<Response> {
  return proxyToCloudApi(
    request,
    includeQuery ? fastapiPathWithQuery(request, path) : path,
  )
}

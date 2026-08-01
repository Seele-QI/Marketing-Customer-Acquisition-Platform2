import { withAuth } from "@/lib/api/with-auth"
import { proxyToFastapi } from "@/lib/fastapi-base"
import { fetchOwnedMatrixProject } from "@/lib/geo/server-project"

export const runtime = "nodejs"

export const GET = withAuth(async (request, { userId, cookieHeader }) => {
  const url = new URL(request.url)
  const taskId = (url.searchParams.get("taskId") ?? "").trim()
  const projectId = (url.searchParams.get("projectId") ?? "").trim()
  const articleId = (url.searchParams.get("articleId") ?? "").trim()
  if (!taskId || !projectId || !articleId) {
    return Response.json({ detail: "图片任务信息不完整" }, { status: 400 })
  }
  if (!(await fetchOwnedMatrixProject(projectId, cookieHeader))) {
    return Response.json({ detail: "矩阵项目不存在" }, { status: 404 })
  }
  const query = new URLSearchParams({
    taskId,
    userId: String(userId),
    projectId,
    articleId,
  })
  const proxyRequest = new Request(request.url, {
    method: "GET",
    headers: request.headers,
  })
  return proxyToFastapi(
    proxyRequest,
    `/api/geo/article-illustrations/status?${query.toString()}`,
  )
})

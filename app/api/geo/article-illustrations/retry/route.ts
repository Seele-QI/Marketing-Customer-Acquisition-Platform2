import { chargeCredit, chargeErrorResponse, withAuth } from "@/lib/api/with-auth"
import { proxyToFastapi } from "@/lib/fastapi-base"
import { fetchScopedIllustrationStatus } from "@/lib/geo/article-illustration-server"
import { fetchOwnedMatrixProject } from "@/lib/geo/server-project"

export const runtime = "nodejs"
export const maxDuration = 120

export const POST = withAuth(async (request, { userId, cookieHeader }) => {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ detail: "请求体必须是 JSON" }, { status: 400 })
  }
  const projectId = String(body.projectId ?? "").trim()
  const articleId = String(body.articleId ?? "").trim()
  const taskId = String(body.taskId ?? "").trim()
  const failedIllustrationIds = Array.isArray(body.failedIllustrationIds)
    ? [...new Set(body.failedIllustrationIds.map(String).filter(Boolean))]
    : []
  if (!projectId || !articleId || !taskId || failedIllustrationIds.length === 0) {
    return Response.json({ detail: "请选择需要重试的插图" }, { status: 400 })
  }
  if (!(await fetchOwnedMatrixProject(projectId, cookieHeader))) {
    return Response.json({ detail: "矩阵项目不存在" }, { status: 404 })
  }

  let status
  try {
    status = await fetchScopedIllustrationStatus({
      taskId,
      userId,
      projectId,
      articleId,
    })
  } catch {
    return Response.json({ detail: "图片任务不存在" }, { status: 404 })
  }
  const failed = new Set(
    status.items
      .filter((item) => item.status === "failed")
      .map((item) => item.illustration_id),
  )
  if (failedIllustrationIds.some((id) => !failed.has(id))) {
    return Response.json({ detail: "仅可重试当前失败的插图" }, { status: 400 })
  }

  try {
    for (const illustrationId of failedIllustrationIds) {
      await chargeCredit({
        cookieHeader,
        scene: "image_creation",
        refId: [
          "geo-article-illustration",
          userId,
          projectId,
          articleId,
          illustrationId,
        ].join(":"),
      })
    }
  } catch (error) {
    return chargeErrorResponse(error)
  }

  const proxyRequest = new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      project_id: projectId,
      article_id: articleId,
      task_id: taskId,
      illustration_ids: failedIllustrationIds,
    }),
  })
  return proxyToFastapi(proxyRequest, "/api/geo/article-illustrations/retry")
})

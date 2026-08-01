import { chargeCredit, chargeErrorResponse, withAuth } from "@/lib/api/with-auth"
import { proxyToFastapi } from "@/lib/fastapi-base"
import { planArticleIllustrations } from "@/lib/geo/article-illustration-planner"
import { parseArticleIllustrationGenerateRequest } from "@/lib/geo/article-illustration-types"
import { fetchOwnedMatrixProject } from "@/lib/geo/server-project"

export const runtime = "nodejs"
export const maxDuration = 120

export const POST = withAuth(async (request, { userId, cookieHeader }) => {
  let input
  try {
    input = parseArticleIllustrationGenerateRequest(await request.json())
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "插图参数无效" },
      { status: 400 },
    )
  }

  const project = await fetchOwnedMatrixProject(input.projectId, cookieHeader)
  if (!project) {
    return Response.json({ detail: "矩阵项目不存在" }, { status: 404 })
  }
  const items = planArticleIllustrations({
    projectId: input.projectId,
    articleId: input.articleId,
    platformId: input.platformId,
    title: input.title,
    markdown: input.markdown,
    count: input.illustrationCount,
  })
  if (items.length === 0) {
    return Response.json({
      task_id: "",
      project_id: input.projectId,
      article_id: input.articleId,
      status: "success",
      items: [],
      warning: "正文暂无适合自动插图的位置",
      error: "",
    })
  }

  try {
    for (const item of items) {
      await chargeCredit({
        cookieHeader,
        scene: "image_creation",
        refId: [
          "geo-article-illustration",
          userId,
          input.projectId,
          input.articleId,
          item.illustrationId,
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
      project_id: input.projectId,
      article_id: input.articleId,
      items: items.map((item) => ({
        illustration_id: item.illustrationId,
        anchor_heading: item.anchorHeading,
        anchor_occurrence: item.anchorOccurrence,
        alt: item.alt,
        prompt: item.prompt,
        aspect_ratio: item.aspectRatio,
        resolution: item.resolution,
      })),
    }),
  })
  return proxyToFastapi(
    proxyRequest,
    "/api/geo/article-illustrations/generate",
  )
})

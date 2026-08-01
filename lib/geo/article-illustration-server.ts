import { getServerFastapiBase } from "@/lib/fastapi-base"

export type FastapiIllustrationStatus = {
  task_id: string
  project_id: string
  article_id: string
  status: string
  items: Array<{
    illustration_id: string
    status: string
    [key: string]: unknown
  }>
  [key: string]: unknown
}

export async function fetchScopedIllustrationStatus(input: {
  taskId: string
  userId: number
  projectId: string
  articleId: string
}): Promise<FastapiIllustrationStatus> {
  const base = getServerFastapiBase()
  if (!base) throw new Error("LOCAL_SERVICE_UNAVAILABLE")
  const query = new URLSearchParams({
    taskId: input.taskId,
    userId: String(input.userId),
    projectId: input.projectId,
    articleId: input.articleId,
  })
  const response = await fetch(
    `${base}/api/geo/article-illustrations/status?${query.toString()}`,
    { cache: "no-store", signal: AbortSignal.timeout(30_000) },
  )
  if (!response.ok) {
    throw new Error(response.status === 404 ? "TASK_NOT_FOUND" : "STATUS_FAILED")
  }
  return (await response.json()) as FastapiIllustrationStatus
}

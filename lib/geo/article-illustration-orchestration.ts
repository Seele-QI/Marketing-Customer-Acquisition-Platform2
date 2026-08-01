import type { ArticleIllustrationTaskSnapshot } from "@/lib/geo/article-illustration-types"

export function buildInitialIllustrationSnapshot(input: {
  projectId: string
  articleId: string
  count: number
  now?: number
}): ArticleIllustrationTaskSnapshot {
  return {
    taskId: "",
    projectId: input.projectId,
    articleId: input.articleId,
    requestedCount: input.count,
    completedCount: 0,
    failedCount: 0,
    status: "queued",
    items: [],
    updatedAt: input.now ?? Date.now(),
  }
}

export function failedArticleIllustrationIds(
  snapshot: ArticleIllustrationTaskSnapshot,
): string[] {
  return snapshot.items
    .filter((item) => item.status === "failed")
    .map((item) => item.illustrationId)
}

export function shouldResumeArticleIllustrations(
  snapshot: ArticleIllustrationTaskSnapshot | undefined,
): snapshot is ArticleIllustrationTaskSnapshot {
  return Boolean(
    snapshot?.taskId &&
      (snapshot.status === "queued" || snapshot.status === "running"),
  )
}


"use client"

import * as React from "react"
import {
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileText,
  Loader2,
  RotateCw,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { GeoArticlePreviewDialog } from "@/components/geo/article/geo-article-preview-dialog"
import { downloadArticleMarkdown, articleWordCount } from "@/lib/geo/article-export"
import { compareByArticleDate } from "@/lib/geo/article-doc-sort"
import {
  getMatrixPlatformLabel,
  MATRIX_PLATFORMS,
} from "@/lib/geo/matrix-platforms"
import type { GeneratedArticle } from "@/lib/geo/article-types"

const CARD_SHELL =
  "flex aspect-[210/297] w-full min-w-0 flex-col overflow-hidden rounded-md border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900"

export type DocGridItem =
  | {
      kind: "pending"
      jobId: string
      title: string
      platformId: string
      date?: string
    }
  | {
      kind: "article"
      article: GeneratedArticle
    }

type Props = {
  items: DocGridItem[]
  activeArticleId?: string | null
  retryingJobIds?: Set<string>
  onSelect: (article: GeneratedArticle) => void
  onRetry?: (article: GeneratedArticle) => void
  onRetryIllustrations?: (article: GeneratedArticle) => void
}

function itemPlatformId(item: DocGridItem): string {
  return item.kind === "pending" ? item.platformId : item.article.platformId
}

function docGridItemSortKey(item: DocGridItem): {
  date?: string
  platformId?: string
  createdAt?: number
} {
  if (item.kind === "pending") {
    return { date: item.date, platformId: item.platformId }
  }
  return {
    date: item.article.date,
    platformId: item.article.platformId,
    createdAt: item.article.createdAt,
  }
}

function platformOrderIndex(platformId: string): number {
  const idx = MATRIX_PLATFORMS.findIndex((p) => p.id === platformId)
  return idx >= 0 ? idx : 999
}

type PlatformGroup = {
  platformId: string
  label: string
  items: DocGridItem[]
}

function groupByPlatform(items: DocGridItem[]): PlatformGroup[] {
  const map = new Map<string, DocGridItem[]>()
  for (const item of items) {
    const pid = itemPlatformId(item) || "unknown"
    const list = map.get(pid)
    if (list) list.push(item)
    else map.set(pid, [item])
  }

  return [...map.entries()]
    .map(([platformId, groupItems]) => ({
      platformId,
      label: getMatrixPlatformLabel(platformId),
      items: [...groupItems].sort((a, b) =>
        compareByArticleDate(docGridItemSortKey(a), docGridItemSortKey(b)),
      ),
    }))
    .sort((a, b) => platformOrderIndex(a.platformId) - platformOrderIndex(b.platformId))
}

function ArticleCard({
  item,
  activeArticleId,
  retryingJobIds,
  onSelect,
  onRetry,
  onRetryIllustrations,
  onPreview,
  compact,
}: {
  item: DocGridItem
  activeArticleId?: string | null
  retryingJobIds?: Set<string>
  onSelect: (article: GeneratedArticle) => void
  onRetry?: (article: GeneratedArticle) => void
  onRetryIllustrations?: (article: GeneratedArticle) => void
  onPreview: (article: GeneratedArticle) => void
  compact?: boolean
}) {
  if (item.kind === "pending") {
    return (
      <div className={CARD_SHELL}>
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 dark:border-white/5 dark:bg-white/5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-500" />
          <span className="truncate text-[11px] font-medium text-slate-600 dark:text-slate-300">
            生成中…
          </span>
        </div>
        <div className="flex flex-1 animate-pulse flex-col gap-2 p-4">
          <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-white/10" />
          <div className="h-2 w-full rounded bg-slate-100 dark:bg-white/10" />
          <div className="h-2 w-full rounded bg-slate-100 dark:bg-white/10" />
          <div className="h-2 w-2/3 rounded bg-slate-100 dark:bg-white/10" />
        </div>
        <div className="border-t border-slate-100 px-3 py-1.5 dark:border-white/5">
          <span className="text-[10px] text-slate-400">
            {getMatrixPlatformLabel(item.platformId)}
            {item.date ? ` · ${item.date}` : ""}
          </span>
        </div>
      </div>
    )
  }

  const { article } = item
  const failed = article.status === "failed"
  const retrying = retryingJobIds?.has(article.jobId) ?? false
  const chars = articleWordCount(article.markdown)
  const isActive = activeArticleId === article.id
  const illustrationTask = article.illustrationTask
  const hasIllustrationTask = (article.illustrationsPerArticle ?? 0) > 0

  if (retrying) {
    return (
      <div className={CARD_SHELL}>
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 dark:border-white/5 dark:bg-white/5">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-500" />
          <span className="truncate text-[11px] font-medium text-slate-600 dark:text-slate-300">
            重试中…
          </span>
        </div>
        <div className="flex flex-1 animate-pulse flex-col gap-2 p-4">
          <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-white/10" />
          <div className="h-2 w-full rounded bg-slate-100 dark:bg-white/10" />
        </div>
        <div className="border-t border-slate-100 px-3 py-1.5 dark:border-white/5">
          <span className="text-[10px] text-slate-400">
            {getMatrixPlatformLabel(article.platformId)}
            {article.date ? ` · ${article.date}` : ""}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      role="button"
      tabIndex={failed ? -1 : 0}
      onClick={() => !failed && onSelect(article)}
      onKeyDown={(e) => {
        if (!failed && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault()
          onSelect(article)
        }
      }}
      className={cn(
        CARD_SHELL,
        "text-left transition-all",
        failed
          ? "cursor-not-allowed border-red-200/80 opacity-80 dark:border-red-500/30"
          : "cursor-pointer hover:border-cyan-300/80 hover:shadow-md dark:hover:border-cyan-500/30",
        isActive && "ring-2 ring-cyan-500/40",
        compact && "shadow-md",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 dark:border-white/5 dark:bg-white/5">
        <span className="truncate text-[11px] font-semibold text-slate-700 dark:text-slate-200">
          {article.title}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          {!failed && (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="预览正文"
                className="h-6 w-6 p-0 text-slate-400 hover:text-cyan-600"
                onClick={(e) => {
                  e.stopPropagation()
                  onPreview(article)
                }}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="导出文档"
                className="h-6 w-6 p-0 text-slate-400 hover:text-cyan-600"
                onClick={(e) => {
                  e.stopPropagation()
                  downloadArticleMarkdown({
                    title: article.title,
                    markdown: article.markdown,
                    platformId: article.platformId,
                    date: article.date,
                    createdAt: article.createdAt,
                  })
                }}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
          {failed && onRetry && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label="重试生成"
              className="h-6 w-6 p-0 text-red-500 hover:text-red-600"
              onClick={(e) => {
                e.stopPropagation()
                onRetry(article)
              }}
            >
              <RotateCw className="h-3.5 w-3.5" />
            </Button>
          )}
          {failed && !onRetry && (
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />
          )}
        </div>
      </div>
      <div className="flex-1 overflow-hidden p-3">
        {failed ? (
          <p className="text-[11px] leading-relaxed text-red-600 dark:text-red-400">
            {article.error ?? "生成失败"}
          </p>
        ) : (
          <p className="line-clamp-[6] text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
            {article.markdown.replace(/^#+\s*/gm, "").slice(0, 400)}
          </p>
        )}
      </div>
      {!failed && hasIllustrationTask && (
        <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-1.5 text-[10px] dark:border-white/5">
          <span className="inline-flex min-w-0 items-center gap-1 text-slate-500">
            {(illustrationTask?.status === "queued" ||
              illustrationTask?.status === "running") && (
              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-cyan-500" />
            )}
            {illustrationTask?.failedCount
              ? `${illustrationTask.completedCount} 张已插入，${illustrationTask.failedCount} 张待重试`
              : illustrationTask?.status === "success"
              ? `插图已完成 ${illustrationTask.completedCount}/${illustrationTask.requestedCount}`
              : illustrationTask?.status === "failed"
                ? `插图待重试 ${illustrationTask.failedCount}`
                : "插图生成中"}
          </span>
          {Boolean(illustrationTask?.failedCount) &&
            onRetryIllustrations && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 shrink-0 px-2 text-[10px] text-cyan-700"
                onClick={(event) => {
                  event.stopPropagation()
                  onRetryIllustrations(article)
                }}
              >
                <RotateCw className="mr-1 h-3 w-3" />
                重试插图
              </Button>
            )}
        </div>
      )}
      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5 dark:border-white/5">
        <span className="text-[10px] text-slate-400">
          {getMatrixPlatformLabel(article.platformId)}
          {article.date ? ` · ${article.date}` : ""}
        </span>
        {!failed && <span className="text-[10px] text-slate-400">{chars} 字</span>}
      </div>
    </div>
  )
}

function PlatformStackGroup({
  group,
  expanded,
  onToggle,
  activeArticleId,
  retryingJobIds,
  onSelect,
  onRetry,
  onRetryIllustrations,
  onPreview,
}: {
  group: PlatformGroup
  expanded: boolean
  onToggle: () => void
  activeArticleId?: string | null
  retryingJobIds?: Set<string>
  onSelect: (article: GeneratedArticle) => void
  onRetry?: (article: GeneratedArticle) => void
  onRetryIllustrations?: (article: GeneratedArticle) => void
  onPreview: (article: GeneratedArticle) => void
}) {
  const count = group.items.length
  const front = group.items[0]
  const stackDepth = Math.min(count - 1, 3)

  if (count === 1 && front) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
            {group.label}
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-white/10 dark:text-slate-400">
            1 篇
          </span>
        </div>
        <div className="max-w-[200px]">
          <ArticleCard
            item={front}
            activeArticleId={activeArticleId}
            retryingJobIds={retryingJobIds}
            onSelect={onSelect}
            onRetry={onRetry}
            onRetryIllustrations={onRetryIllustrations}
            onPreview={onPreview}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
          {group.label}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-white/10 dark:text-slate-400">
          {count} 篇
        </span>
      </div>

      {expanded ? (
        <div className="space-y-3">
          <button
            type="button"
            onClick={onToggle}
            className="inline-flex items-center gap-1.5 rounded-full bg-slate-800 px-3.5 py-1.5 text-[12px] font-medium text-white shadow-sm transition hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
          >
            <ChevronUp className="h-3.5 w-3.5" />
            收起
          </button>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-3">
            {group.items.map((item) => (
              <ArticleCard
                key={item.kind === "pending" ? `pending-${item.jobId}` : item.article.id}
                item={item}
                activeArticleId={activeArticleId}
                retryingJobIds={retryingJobIds}
                onSelect={onSelect}
                onRetry={onRetry}
                onRetryIllustrations={onRetryIllustrations}
                onPreview={onPreview}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={false}
            aria-label={`展开 ${group.label} 的 ${count} 篇文章`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-800 px-3.5 py-1.5 text-[12px] font-medium text-white shadow-sm transition hover:bg-slate-700 dark:bg-slate-200 dark:text-slate-900 dark:hover:bg-white"
          >
            <ChevronDown className="h-3.5 w-3.5" />
            展开 {count}
          </button>

          <div
            className="relative w-[180px] shrink-0 cursor-pointer"
            style={{ height: `calc(180px * 297 / 210 + ${stackDepth * 6}px)` }}
            onClick={onToggle}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onToggle()
              }
            }}
            aria-label={`展开 ${group.label}`}
          >
            {Array.from({ length: stackDepth }).map((_, i) => {
              const depth = stackDepth - i
              return (
                <div
                  key={`stack-bg-${depth}`}
                  aria-hidden
                  className="absolute inset-x-0 top-0 overflow-hidden rounded-md border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900"
                  style={{
                    aspectRatio: "210 / 297",
                    transform: `translate(${depth * 8}px, ${depth * 6}px)`,
                    zIndex: i,
                    opacity: 0.55 + i * 0.12,
                  }}
                >
                  <div className="h-full bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900" />
                </div>
              )
            })}
            <div
              className="absolute inset-x-0 top-0 z-10"
              style={{ aspectRatio: "210 / 297" }}
              onClick={(e) => e.stopPropagation()}
            >
              {front && (
                <ArticleCard
                  item={front}
                  activeArticleId={activeArticleId}
                  retryingJobIds={retryingJobIds}
                  onSelect={onSelect}
                  onRetry={onRetry}
                  onRetryIllustrations={onRetryIllustrations}
                  onPreview={onPreview}
                  compact
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function GeoArticleDocGrid({
  items,
  activeArticleId,
  retryingJobIds,
  onSelect,
  onRetry,
  onRetryIllustrations,
}: Props) {
  const [previewArticle, setPreviewArticle] = React.useState<GeneratedArticle | null>(null)
  const [expandedPlatforms, setExpandedPlatforms] = React.useState<Set<string>>(
    () => new Set(),
  )

  const groups = React.useMemo(() => groupByPlatform(items), [items])

  // 新平台默认折叠；若某平台仅剩 0 篇则清理展开态
  React.useEffect(() => {
    const ids = new Set(groups.map((g) => g.platformId))
    setExpandedPlatforms((prev) => {
      let changed = false
      const next = new Set<string>()
      for (const id of prev) {
        if (ids.has(id)) next.add(id)
        else changed = true
      }
      return changed ? next : prev
    })
  }, [groups])

  const togglePlatform = React.useCallback((platformId: string) => {
    setExpandedPlatforms((prev) => {
      const next = new Set(prev)
      if (next.has(platformId)) next.delete(platformId)
      else next.add(platformId)
      return next
    })
  }, [])

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/50 px-6 py-12 text-center dark:border-white/10 dark:bg-white/[0.02]">
        <FileText className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="text-[13px] text-slate-500">完成批量创作后，文章将按平台分类堆叠展示</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-8">
        {groups.map((group) => (
          <PlatformStackGroup
            key={group.platformId}
            group={group}
            expanded={expandedPlatforms.has(group.platformId)}
            onToggle={() => togglePlatform(group.platformId)}
            activeArticleId={activeArticleId}
            retryingJobIds={retryingJobIds}
            onSelect={onSelect}
            onRetry={onRetry}
            onRetryIllustrations={onRetryIllustrations}
            onPreview={setPreviewArticle}
          />
        ))}
      </div>

      <GeoArticlePreviewDialog
        open={!!previewArticle}
        onOpenChange={(open) => !open && setPreviewArticle(null)}
        title={previewArticle?.title ?? ""}
        markdown={previewArticle?.markdown ?? ""}
      />
    </>
  )
}

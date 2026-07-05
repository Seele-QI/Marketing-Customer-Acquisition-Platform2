"use client"

import * as React from "react"
import { AlertCircle, Download, Eye, FileText, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { GeoArticlePreviewDialog } from "@/components/geo/article/geo-article-preview-dialog"
import { downloadArticleMarkdown, articleWordCount } from "@/lib/geo/article-export"
import { getMatrixPlatformLabel } from "@/lib/geo/matrix-platforms"
import type { GeneratedArticle } from "@/lib/geo/article-types"

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
  onSelect: (article: GeneratedArticle) => void
}

export function GeoArticleDocGrid({ items, activeArticleId, onSelect }: Props) {
  const [previewArticle, setPreviewArticle] = React.useState<GeneratedArticle | null>(null)

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200/80 bg-slate-50/50 px-6 py-12 text-center dark:border-white/10 dark:bg-white/[0.02]">
        <FileText className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
        <p className="text-[13px] text-slate-500">完成批量创作后，文章将以文档卡片形式排列在此</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          if (item.kind === "pending") {
            return (
              <div
                key={`pending-${item.jobId}`}
                className="flex aspect-[210/297] max-h-[280px] flex-col overflow-hidden rounded-sm border border-slate-200/90 bg-white shadow-md dark:border-white/10 dark:bg-slate-900"
              >
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
          const chars = articleWordCount(article.markdown)
          const isActive = activeArticleId === article.id

          return (
            <div
              key={article.id}
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
                "group flex aspect-[210/297] max-h-[280px] flex-col overflow-hidden rounded-sm border text-left shadow-md transition-all",
                "bg-white dark:bg-slate-900",
                failed
                  ? "cursor-not-allowed border-red-200/80 opacity-80 dark:border-red-500/30"
                  : "cursor-pointer border-slate-200/90 hover:-translate-y-0.5 hover:shadow-lg dark:border-white/10",
                isActive && "ring-2 ring-cyan-500/40",
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
                        aria-label="Markdown 预览"
                        className="h-6 w-6 p-0 text-slate-400 hover:text-cyan-600"
                        onClick={(e) => {
                          e.stopPropagation()
                          setPreviewArticle(article)
                        }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label="导出 Markdown 文档"
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
                  {failed && <AlertCircle className="h-3.5 w-3.5 shrink-0 text-red-500" />}
                </div>
              </div>
              <div className="flex-1 overflow-hidden p-3">
                {failed ? (
                  <p className="text-[11px] leading-relaxed text-red-600 dark:text-red-400">
                    {article.error ?? "生成失败"}
                  </p>
                ) : (
                  <p className="line-clamp-[8] text-[11px] leading-relaxed text-slate-600 dark:text-slate-400">
                    {article.markdown.replace(/^#+\s*/gm, "").slice(0, 400)}
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 px-3 py-1.5 dark:border-white/5">
                <span className="text-[10px] text-slate-400">
                  {getMatrixPlatformLabel(article.platformId)}
                  {article.date ? ` · ${article.date}` : ""}
                </span>
                {!failed && <span className="text-[10px] text-slate-400">{chars} 字</span>}
              </div>
            </div>
          )
        })}
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

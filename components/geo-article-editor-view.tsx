"use client"

import * as React from "react"
import {
  ChevronRight,
  Download,
  Eye,
  ImagePlus,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  GeoWorkflowPage,
  GeoWorkflowHero,
  GeoWorkflowStepIndicator,
  buildGeoArticleSteps,
  type GeoWorkflowStepId,
} from "@/components/geo/geo-workflow-shell"
import { GeoScorePanel, type GeoScores } from "@/components/geo/geo-score-panel"
import { GeoLlmProviderSelect } from "@/components/geo/geo-llm-provider-select"
import { GeoSkillToolbar } from "@/components/geo/geo-knowledge-base-picker"
import { GeoArticleBatchPanel } from "@/components/geo/article/geo-article-batch-panel"
import {
  GeoArticleDocGrid,
  type DocGridItem,
} from "@/components/geo/article/geo-article-doc-grid"
import { GeoArticlePreviewDialog } from "@/components/geo/article/geo-article-preview-dialog"
import type { LlmProviderId } from "@/lib/geo/llm/router"
import { getEnterpriseSkillEntry } from "@/lib/geo/skills-registry"
import { downloadArticleMarkdown } from "@/lib/geo/article-export"
import { parseMarkdownOutline } from "@/lib/geo/markdown-outline"
import { scoreArticle } from "@/lib/geo/article-score-api"
import { retryArticleGenerate } from "@/lib/geo/article-batch-api"
import { buildRetryJob } from "@/lib/geo/article-batch-jobs"
import { getMatrixProject } from "@/lib/geo/matrix-api"
import { fileToBase64Parts } from "@/lib/image-base64"
import {
  getJobSnapshot,
  loadArticleBatch,
  mergeArticles,
  saveBatchConfig,
  upsertArticle,
  type ArticleBatchConfig,
} from "@/lib/geo/article-batch-store"
import type { ArticleJob, GeneratedArticle } from "@/lib/geo/article-types"
import { toast } from "@/hooks/use-toast"

const ARTICLE_PROVIDER_KEY = "geo-article-llm-provider"

function parseMarkdownTitle(markdown: string, fallback: string): string {
  const match = markdown.match(/^#\s+(.+)$/m)
  if (!match) return fallback
  return match[1]!.replace(/[#*_`[\]]/g, "").trim() || fallback
}

export function GeoArticleEditorView() {
  const [step, setStep] = React.useState<GeoWorkflowStepId>(2)
  const [markdown, setMarkdown] = React.useState("")
  const [activeArticleId, setActiveArticleId] = React.useState<string | null>(null)
  const [articles, setArticles] = React.useState<GeneratedArticle[]>([])
  const [gridItems, setGridItems] = React.useState<DocGridItem[]>([])
  const [batchGenerating, setBatchGenerating] = React.useState(false)
  const [batchProgress, setBatchProgress] = React.useState({ done: 0, total: 0 })
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [activeSection, setActiveSection] = React.useState("")
  const [modelSkillId, setModelSkillId] = React.useState<string | null>(null)
  const [viralSkillIds, setViralSkillIds] = React.useState<string[]>([])
  const [enterpriseSkillId, setEnterpriseSkillId] = React.useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [provider, setProvider] = React.useState<LlmProviderId>("deepseek")
  const [scores, setScores] = React.useState<GeoScores | null>(null)
  const [scoreSummary, setScoreSummary] = React.useState<string | null>(null)
  const [scoreLoading, setScoreLoading] = React.useState(false)
  const [retryingJobIds, setRetryingJobIds] = React.useState<Set<string>>(new Set())

  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const lastAutoScoredArticleIdRef = React.useRef<string | null>(null)

  const activeArticle = React.useMemo(
    () => articles.find((a) => a.id === activeArticleId) ?? null,
    [articles, activeArticleId],
  )

  const outline = React.useMemo(() => parseMarkdownOutline(markdown), [markdown])

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(ARTICLE_PROVIDER_KEY)
      if (
        stored === "deepseek" ||
        stored === "doubao" ||
        stored === "kimi" ||
        stored === "gpt" ||
        stored === "claude" ||
        stored === "gemini"
      ) {
        setProvider(stored)
      }
    } catch {
      /* ignore */
    }
    const batch = loadArticleBatch()
    if (batch.articles.length > 0) {
      setArticles(batch.articles)
      setGridItems(batch.articles.map((a) => ({ kind: "article", article: a })))
    }
  }, [])

  const handleProviderChange = React.useCallback((id: LlmProviderId) => {
    setProvider(id)
    try {
      localStorage.setItem(ARTICLE_PROVIDER_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  const enterpriseSnapshot = React.useMemo(
    () => getEnterpriseSkillEntry(enterpriseSkillId)?.content ?? null,
    [enterpriseSkillId],
  )

  const handleBatchStart = React.useCallback(
    (jobs: { jobId: string; title: string; platformId: string; date?: string }[]) => {
      setStep(2)
      setGridItems((prev) => {
        const existing = prev.filter((i) => i.kind === "article")
        return [
          ...existing,
          ...jobs.map((j) => ({
            kind: "pending" as const,
            jobId: j.jobId,
            title: j.title,
            platformId: j.platformId,
            date: j.date,
          })),
        ]
      })
    },
    [],
  )

  const handleArticleDone = React.useCallback((article: GeneratedArticle) => {
    setGridItems((prev) => {
      const withoutPending = prev.filter(
        (i) => !(i.kind === "pending" && i.jobId === article.jobId),
      )
      const withoutDup = withoutPending.filter(
        (i) => !(i.kind === "article" && i.article.jobId === article.jobId),
      )
      return [...withoutDup, { kind: "article", article }]
    })
    const next = mergeArticles([article])
    setArticles(next)
  }, [])

  const handleJobError = React.useCallback((jobId: string, error: string, meta?: Partial<GeneratedArticle>) => {
    setGridItems((prev) => {
      const pending = prev.find((i) => i.kind === "pending" && i.jobId === jobId)
      const fromArticle = prev.find(
        (i) => i.kind === "article" && i.article.jobId === jobId,
      )
      const base =
        pending && pending.kind === "pending"
          ? pending
          : fromArticle && fromArticle.kind === "article"
            ? fromArticle.article
            : null
      if (!base) return prev

      const failed: GeneratedArticle = {
        id: meta?.id ?? `failed-${jobId}`,
        jobId,
        mode: meta?.mode ?? (fromArticle?.kind === "article" ? fromArticle.article.mode : "direction"),
        platformId: meta?.platformId ?? ("platformId" in base ? base.platformId : ""),
        date: meta?.date ?? ("date" in base ? base.date : undefined),
        title: meta?.title ?? ("title" in base ? base.title : "生成失败"),
        markdown: "",
        status: "failed",
        error,
        createdAt: meta?.createdAt ?? Date.now(),
      }
      mergeArticles([failed])
      setArticles((a) => {
        const filtered = a.filter((x) => x.jobId !== jobId)
        return [...filtered, failed]
      })
      return [
        ...prev.filter(
          (i) =>
            !(i.kind === "pending" && i.jobId === jobId) &&
            !(i.kind === "article" && i.article.jobId === jobId),
        ),
        { kind: "article", article: failed },
      ]
    })
  }, [])

  const handleBatchComplete = React.useCallback((config: ArticleBatchConfig) => {
    saveBatchConfig(config)
  }, [])

  const resolveRetryJob = React.useCallback(
    async (article: GeneratedArticle): Promise<ArticleJob> => {
      const snapshot = getJobSnapshot(article.jobId)
      if (snapshot) return snapshot

      const { lastConfig } = loadArticleBatch()
      if (!lastConfig) {
        throw new Error("缺少批次配置，请重新发起批量创作")
      }

      let project = null
      if (lastConfig.mode === "matrix" && lastConfig.projectId) {
        project = await getMatrixProject(lastConfig.projectId)
      }

      return buildRetryJob({
        jobId: article.jobId,
        mode: article.mode,
        platformId: article.platformId,
        date: article.date,
        title: article.title,
        direction: lastConfig.direction,
        project,
      })
    },
    [],
  )

  const handleRetryArticle = React.useCallback(
    async (article: GeneratedArticle) => {
      if (retryingJobIds.has(article.jobId)) return

      let job: ArticleJob
      try {
        job = await resolveRetryJob(article)
      } catch (e) {
        toast({
          title: e instanceof Error ? e.message : "无法重试",
          variant: "destructive",
        })
        return
      }

      setRetryingJobIds((prev) => new Set(prev).add(article.jobId))

      try {
        const result = await retryArticleGenerate({
          provider,
          modelSkillId,
          viralSkillIds,
          enterpriseSnapshot,
          job,
        })

        if (result.status === "success") {
          handleArticleDone(result)
          toast({ title: "重试成功" })
        } else {
          handleJobError(result.jobId, result.error ?? "重试失败", result)
          toast({
            title: result.error ?? "重试失败",
            variant: "destructive",
          })
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "重试失败"
        handleJobError(article.jobId, message, article)
        toast({ title: message, variant: "destructive" })
      } finally {
        setRetryingJobIds((prev) => {
          const next = new Set(prev)
          next.delete(article.jobId)
          return next
        })
      }
    },
    [
      retryingJobIds,
      resolveRetryJob,
      provider,
      modelSkillId,
      viralSkillIds,
      enterpriseSnapshot,
      handleArticleDone,
      handleJobError,
    ],
  )

  const runScore = React.useCallback(async () => {
    if (!markdown.trim()) {
      toast({ title: "正文为空，无法评分", variant: "destructive" })
      return
    }
    setScoreLoading(true)
    try {
      const result = await scoreArticle({
        provider,
        markdown,
        modelSkillId,
        viralSkillIds,
        enterpriseSnapshot,
        platformId: activeArticle?.platformId ?? null,
      })
      setScores(result.scores)
      setScoreSummary(result.summary ?? null)
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "评分失败",
        variant: "destructive",
      })
    } finally {
      setScoreLoading(false)
    }
  }, [
    markdown,
    provider,
    modelSkillId,
    viralSkillIds,
    enterpriseSnapshot,
    activeArticle?.platformId,
  ])

  const handleSelectArticle = React.useCallback((article: GeneratedArticle) => {
    setActiveArticleId(article.id)
    setMarkdown(article.markdown)
    setScores(null)
    setScoreSummary(null)
    lastAutoScoredArticleIdRef.current = null
    setStep(3)
  }, [])

  React.useEffect(() => {
    if (step !== 3 || !activeArticleId || !markdown.trim()) return
    if (lastAutoScoredArticleIdRef.current === activeArticleId) return
    lastAutoScoredArticleIdRef.current = activeArticleId
    void runScore()
  }, [step, activeArticleId, markdown, runScore])

  React.useEffect(() => {
    if (!activeArticleId || step !== 3) return
    const timer = setTimeout(() => {
      const updated: GeneratedArticle = {
        ...(activeArticle ?? {
          id: activeArticleId,
          jobId: activeArticleId,
          mode: "direction" as const,
          platformId: "",
          title: parseMarkdownTitle(markdown, "未命名文章"),
          markdown: "",
          status: "success" as const,
          createdAt: Date.now(),
        }),
        markdown,
        title: parseMarkdownTitle(markdown, activeArticle?.title ?? "未命名文章"),
      }
      upsertArticle(updated)
      setArticles((prev) => {
        const idx = prev.findIndex((a) => a.id === activeArticleId)
        if (idx < 0) return [...prev, updated]
        return prev.map((a) => (a.id === activeArticleId ? updated : a))
      })
      setGridItems((prev) =>
        prev.map((item) =>
          item.kind === "article" && item.article.id === activeArticleId
            ? { kind: "article", article: { ...item.article, markdown, title: updated.title } }
            : item,
        ),
      )
    }, 500)
    return () => clearTimeout(timer)
  }, [markdown, activeArticleId, step, activeArticle])

  const handleExport = React.useCallback(() => {
    if (!markdown.trim()) {
      toast({ title: "正文为空，无法导出", variant: "destructive" })
      return
    }
    const title =
      activeArticle?.title ?? parseMarkdownTitle(markdown, "geo-article")
    downloadArticleMarkdown({
      title,
      markdown,
      platformId: activeArticle?.platformId,
      date: activeArticle?.date,
      createdAt: activeArticle?.createdAt,
    })
  }, [markdown, activeArticle])

  const handleImageSelect = React.useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      e.target.value = ""
      if (!file || !file.type.startsWith("image/")) return
      try {
        const { mimeType, dataBase64 } = await fileToBase64Parts(file)
        const dataUrl = `data:${mimeType};base64,${dataBase64}`
        const alt = file.name.replace(/[[\]]/g, "").slice(0, 40)
        const snippet = `\n![${alt}](${dataUrl})\n`
        const el = textareaRef.current
        if (!el) {
          setMarkdown((prev) => prev + snippet)
          return
        }
        const start = el.selectionStart
        const end = el.selectionEnd
        setMarkdown((prev) => prev.slice(0, start) + snippet + prev.slice(end))
        requestAnimationFrame(() => {
          el.focus()
          const pos = start + snippet.length
          el.setSelectionRange(pos, pos)
        })
      } catch {
        toast({ title: "图片插入失败", variant: "destructive" })
      }
    },
    [],
  )

  const editorTitle =
    activeArticle?.title ?? parseMarkdownTitle(markdown, "文章预览")

  const showBatchWorkspace = step === 1 || step === 2

  return (
    <GeoWorkflowPage>
      <GeoWorkflowHero
        title="深度优化"
        accentWord="文章创作"
        description="检索 → 起草 → GEO 四维优化 → 导出。语义、对话、证据、FAQ 缺一不可。"
      />

      <div className="mb-4">
        <GeoWorkflowStepIndicator
          steps={buildGeoArticleSteps(step, {
            loadingStep: batchGenerating ? 2 : undefined,
          })}
          onStepClick={setStep}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-end gap-2 sm:gap-3">
        <GeoLlmProviderSelect value={provider} onChange={handleProviderChange} showLabel />
        <GeoSkillToolbar
          modelSkillId={modelSkillId}
          viralSkillIds={viralSkillIds}
          enterpriseSkillId={enterpriseSkillId}
          onModelChange={setModelSkillId}
          onViralChange={setViralSkillIds}
          onEnterpriseChange={setEnterpriseSkillId}
        />
      </div>

      {batchGenerating && batchProgress.total > 0 && (
        <div className="mb-4">
          <div className="mb-1 flex justify-between text-[11px] text-slate-500">
            <span>批量创作进度</span>
            <span>
              {batchProgress.done} / {batchProgress.total}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
            <div
              className="h-full bg-cyan-500 transition-all duration-300"
              style={{
                width: `${Math.round((batchProgress.done / batchProgress.total) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {showBatchWorkspace ? (
        <div className="space-y-4">
          <GeoArticleBatchPanel
            provider={provider}
            modelSkillId={modelSkillId}
            viralSkillIds={viralSkillIds}
            enterpriseSnapshot={enterpriseSnapshot}
            generating={batchGenerating}
            onGeneratingChange={setBatchGenerating}
            onProgress={(done, total) => setBatchProgress({ done, total })}
            onBatchStart={handleBatchStart}
            onArticle={handleArticleDone}
            onJobError={handleJobError}
            onBatchComplete={handleBatchComplete}
          />
          <GeoArticleDocGrid
            items={gridItems}
            activeArticleId={activeArticleId}
            retryingJobIds={retryingJobIds}
            onSelect={handleSelectArticle}
            onRetry={(article) => void handleRetryArticle(article)}
          />
        </div>
      ) : step === 4 ? (
        <div className="rounded-xl border border-slate-200/80 bg-white p-8 text-center dark:border-white/10 dark:bg-white/[0.03]">
          <p className="text-[14px] text-slate-600 dark:text-slate-400">
            导出功能即将上线。当前可在 Step 3 使用「一键导出」下载 Markdown 文档。
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => setStep(3)}
          >
            返回编辑
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-12 lg:gap-4">
          <aside
            className={cn(
              "overflow-hidden rounded-xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-white/[0.03]",
              sidebarCollapsed ? "lg:col-span-1" : "lg:col-span-3",
            )}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5 dark:border-white/5">
              {!sidebarCollapsed && (
                <span className="px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  大纲
                </span>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
                aria-expanded={!sidebarCollapsed}
                className={cn("h-7 w-7 p-0", sidebarCollapsed && "mx-auto")}
                onClick={() => setSidebarCollapsed((c) => !c)}
              >
                {sidebarCollapsed ? (
                  <PanelLeft className="h-3.5 w-3.5" />
                ) : (
                  <PanelLeftClose className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            {!sidebarCollapsed && (
              <div className="p-3">
                {outline.length === 0 ? (
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    暂无标题，请用 # / ## 标记章节
                  </p>
                ) : (
                  <ul className="space-y-0.5" aria-label="文章大纲">
                    {outline.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          aria-current={activeSection === item.id ? "true" : undefined}
                          onClick={() => setActiveSection(item.id)}
                          className={cn(
                            "flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30",
                            activeSection === item.id
                              ? "bg-cyan-50 font-medium text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                              : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5",
                            item.level === 2 && "pl-4",
                            item.level === 3 && "pl-6",
                          )}
                        >
                          <ChevronRight
                            className={cn(
                              "h-3 w-3 shrink-0 transition-opacity",
                              activeSection === item.id ? "opacity-70" : "opacity-30",
                            )}
                            aria-hidden
                          />
                          <span className="truncate">{item.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </aside>

          <main
            className={cn(
              "flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-white/[0.03]",
              sidebarCollapsed ? "lg:col-span-7" : "lg:col-span-5",
            )}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-white/5">
              <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-200">
                正文
              </span>
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Markdown 格式预览"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => setPreviewOpen(true)}
                >
                  <Eye className="mr-1 h-3 w-3" aria-hidden />
                  预览
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="一键导出 Markdown 文档"
                  className="h-7 px-2 text-[11px]"
                  onClick={handleExport}
                >
                  <Download className="mr-1 h-3 w-3" aria-hidden />
                  导出
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="插入图片"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="mr-1 h-3 w-3" aria-hidden />
                  插图
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => void handleImageSelect(e)}
                />
              </div>
            </div>
            <Textarea
              ref={textareaRef}
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              aria-label="文章 Markdown 正文"
              className="min-h-[420px] flex-1 resize-none rounded-none border-0 bg-transparent text-[13px] leading-relaxed shadow-none focus-visible:ring-0"
              placeholder="在此撰写或优化 GEO 长文…"
            />
          </main>

          <aside className="space-y-3 lg:col-span-4">
            <GeoScorePanel
              scores={scores}
              summary={scoreSummary}
              loading={scoreLoading}
              onRefresh={() => void runScore()}
            />
          </aside>
        </div>
      )}

      <GeoArticlePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        title={editorTitle}
        markdown={markdown}
      />
    </GeoWorkflowPage>
  )
}

"use client"

import * as React from "react"
import { Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ARTICLE_BATCH_COPIES_PER_SLOT_MAX,
  clampCopiesPerSlot,
  alignJobSnapshots,
  expandMatrixJobs,
  listMatrixDates,
  normalizeSelectedMatrixDates,
} from "@/lib/geo/article-batch-jobs"
import { viralSkillIdsForPlatforms } from "@/lib/geo/matrix-platforms"
import { listMatrixProjects, getMatrixProject } from "@/lib/geo/matrix-api"
import type { MatrixProject } from "@/lib/geo/matrix-types"
import { getGeoSkillById } from "@/lib/geo/skills-registry"
import { startBatchGenerate } from "@/lib/geo/article-batch-api"
import {
  ARTICLE_ILLUSTRATIONS_MAX,
  clampIllustrationsPerArticle,
} from "@/lib/geo/article-illustration-types"
import {
  loadArticleBatch,
  saveBatchConfig,
  saveJobSnapshots,
  type ArticleBatchConfig,
} from "@/lib/geo/article-batch-store"
import type { ArticleJob, BatchGenerateEvent, GeneratedArticle } from "@/lib/geo/article-types"
import { toast } from "@/hooks/use-toast"

type Props = {
  generating: boolean
  onGeneratingChange: (v: boolean) => void
  onProgress: (completed: number, total: number) => void
  onBatchStart: (jobIds: { jobId: string; title: string; platformId: string; date?: string }[]) => void
  onArticle: (
    article: GeneratedArticle,
    options: { illustrationsPerArticle: number },
  ) => void
  onJobError: (jobId: string, error: string) => void
  onBatchComplete: (config: ArticleBatchConfig) => void
  onProjectChange: (project: MatrixProject | null) => void
}

export function GeoArticleBatchPanel({
  generating,
  onGeneratingChange,
  onProgress,
  onBatchStart,
  onArticle,
  onJobError,
  onBatchComplete,
  onProjectChange,
}: Props) {
  const [projects, setProjects] = React.useState<MatrixProject[]>([])
  const [projectDetail, setProjectDetail] = React.useState<MatrixProject | null>(null)
  const [projectsLoading, setProjectsLoading] = React.useState(false)
  const [projectId, setProjectId] = React.useState<string>("")
  const [selectedDates, setSelectedDates] = React.useState<string[]>([])
  const [copiesPerSlot, setCopiesPerSlot] = React.useState(1)
  const [illustrationsPerArticle, setIllustrationsPerArticle] = React.useState(0)
  const [previewCount, setPreviewCount] = React.useState<number | null>(null)
  const [previewSkipped, setPreviewSkipped] = React.useState(0)
  const [previewError, setPreviewError] = React.useState<string | null>(null)
  const localJobsRef = React.useRef<ArticleJob[]>([])
  const restoredConfigRef = React.useRef(false)
  const restoredProjectIdRef = React.useRef<string | null>(null)

  const selectedProject = React.useMemo(
    () =>
      projectDetail?.id === projectId
        ? projectDetail
        : projects.find((project) => project.id === projectId) ?? null,
    [projectDetail, projects, projectId],
  )

  const availableDates = React.useMemo(
    () => listMatrixDates(selectedProject),
    [selectedProject],
  )
  const platformIds = React.useMemo(
    () => [
      ...new Set(
        (selectedProject?.matrix?.platforms ?? [])
          .map((platform) => platform.platformId)
          .filter(Boolean),
      ),
    ],
    [selectedProject],
  )
  const mappedViralSkillIds = React.useMemo(
    () => viralSkillIdsForPlatforms(platformIds),
    [platformIds],
  )
  const selectedModelLabel = selectedProject?.modelSkillId
    ? getGeoSkillById(selectedProject.modelSkillId)?.label ?? "矩阵默认优化策略"
    : "通用 GEO 策略"

  React.useEffect(() => {
    if (restoredConfigRef.current) return
    restoredConfigRef.current = true
    const stored = loadArticleBatch().lastConfig
    if (!stored) return
    if (stored.projectId) setProjectId(stored.projectId)
    if (stored.dates?.length) setSelectedDates(stored.dates)
    if (stored.copiesPerSlot != null) {
      setCopiesPerSlot(clampCopiesPerSlot(stored.copiesPerSlot))
    }
    if (stored.illustrationsPerArticle != null) {
      setIllustrationsPerArticle(
        clampIllustrationsPerArticle(stored.illustrationsPerArticle),
      )
    }
  }, [])

  React.useEffect(() => {
    if (!projectId || restoredProjectIdRef.current === projectId) return
    restoredProjectIdRef.current = projectId
    const stored = loadArticleBatch(projectId).lastConfig
    setSelectedDates(stored?.dates ?? [])
    setCopiesPerSlot(clampCopiesPerSlot(stored?.copiesPerSlot ?? 1))
    setIllustrationsPerArticle(
      clampIllustrationsPerArticle(stored?.illustrationsPerArticle ?? 0),
    )
  }, [projectId])

  React.useEffect(() => {
    let cancelled = false
    setProjectsLoading(true)
    void listMatrixProjects()
      .then((list) => {
        if (cancelled) return
        setProjects(list)
        if (list.length > 0) {
          setProjectId((prev) => prev || list[0].id)
        }
      })
      .catch(() => {
        // Keep the last verified project list during a transient network
        // failure. Clearing it here made an in-flight batch lose its matrix
        // context and wiped the visible task cards.
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!projectId) {
      setProjectDetail(null)
      return
    }
    let cancelled = false
    void getMatrixProject(projectId)
      .then((p) => {
        if (!cancelled) setProjectDetail(p)
      })
      .catch(() => {
        // Retain the last loaded detail. The next successful refresh replaces
        // it; a temporary FastAPI timeout must not detach the active batch.
      })
    return () => {
      cancelled = true
    }
  }, [projectId])

  React.useEffect(() => {
    onProjectChange(selectedProject)
  }, [onProjectChange, selectedProject])

  React.useEffect(() => {
    const normalized = normalizeSelectedMatrixDates(availableDates, selectedDates)
    if (
      normalized.length !== selectedDates.length ||
      normalized.some((date, index) => date !== selectedDates[index])
    ) {
      setSelectedDates(normalized)
    }
  }, [availableDates, selectedDates])

  React.useEffect(() => {
    try {
      if (selectedProject) {
        const { jobs, skipped } = expandMatrixJobs({
          mode: "matrix",
          project: selectedProject,
          dates: selectedDates,
          copiesPerSlot,
        })
        setPreviewCount(jobs.length)
        setPreviewSkipped(skipped.length)
        setPreviewError(null)
      } else {
        setPreviewCount(null)
        setPreviewSkipped(0)
        setPreviewError(null)
      }
    } catch (e) {
      setPreviewCount(null)
      setPreviewSkipped(0)
      setPreviewError(e instanceof Error ? e.message : "无法预览任务数")
    }
  }, [selectedProject, selectedDates, copiesPerSlot])

  const toggleDate = (date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date],
    )
  }

  const handleCopiesChange = (raw: string) => {
    const n = Number.parseInt(raw, 10)
    if (!Number.isFinite(n)) {
      setCopiesPerSlot(1)
      return
    }
    setCopiesPerSlot(clampCopiesPerSlot(n))
  }

  const handleIllustrationsChange = (raw: string) => {
    setIllustrationsPerArticle(clampIllustrationsPerArticle(raw))
  }

  const handleStart = async () => {
    if (generating) return
    if (previewError || previewCount == null || previewCount < 1) {
      toast({ title: previewError ?? "请完善创作配置", variant: "destructive" })
      return
    }

    const copies = clampCopiesPerSlot(copiesPerSlot)
    const illustrationCount = clampIllustrationsPerArticle(
      illustrationsPerArticle,
    )
    const config: ArticleBatchConfig = {
      mode: "matrix",
      projectId,
      dates: selectedDates,
      copiesPerSlot: copies,
      illustrationsPerArticle: illustrationCount,
    }
    saveBatchConfig(config)

    let jobMetas: { jobId: string; title: string; platformId: string; date?: string }[] = []
    let expandedJobs: ArticleJob[] = []
    try {
      if (selectedProject) {
        const expanded = expandMatrixJobs({
          mode: "matrix",
          project: selectedProject,
          dates: selectedDates,
          copiesPerSlot: copies,
        })
        expandedJobs = expanded.jobs
        jobMetas = expanded.jobs.map((j) => ({
          jobId: j.jobId,
          title: j.title,
          platformId: j.platformId,
          date: j.date,
        }))
      }
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "任务展开失败",
        variant: "destructive",
      })
      return
    }

    localJobsRef.current = expandedJobs

    onGeneratingChange(true)
    onProgress(0, jobMetas.length)

    let total = jobMetas.length
    let completed = 0
    try {
      const result = await startBatchGenerate(
        {
          mode: "matrix",
          projectId,
          dates: selectedDates,
          copiesPerSlot: copies,
        },
        {
          onEvent: (event: BatchGenerateEvent) => {
            if (event.type === "batch_start") {
              onBatchStart(event.jobs)
              saveJobSnapshots(alignJobSnapshots(localJobsRef.current, event.jobs))
              total = event.total
              onProgress(0, total)
            }
            if (event.type === "job_done") {
              completed += 1
              onProgress(completed, total)
              onArticle(event.article, {
                illustrationsPerArticle: illustrationCount,
              })
            }
            if (event.type === "job_error" && event.jobId !== "batch") {
              completed += 1
              onProgress(completed, total)
              onJobError(event.jobId, event.error)
            }
          },
        },
      )
      if (result.failCount > 0) {
        toast({
          title: result.successCount > 0
            ? `已生成 ${result.successCount} 篇，${result.failCount} 篇失败，可在下方重试`
            : "本次文章生成全部失败，请稍后重试",
          variant: "destructive",
        })
      } else {
        onBatchComplete(config)
        toast({ title: `批量创作完成，共 ${result.successCount} 篇` })
      }
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "批量创作失败",
        variant: "destructive",
      })
    } finally {
      onGeneratingChange(false)
    }
  }

  return (
    <div
      className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
      data-tutorial-id="geo-article-config"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
          并发创作
        </h3>
        <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-medium text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
          仅从内容矩阵创作
        </span>
      </div>

      <div className="mb-3 space-y-3">
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-slate-500">
              矩阵项目
            </label>
            {projectsLoading ? (
              <p className="text-[12px] text-slate-400">加载项目…</p>
            ) : projects.length === 0 ? (
              <p className="text-[12px] text-amber-600">
                暂无矩阵项目，请先在「内容矩阵规划」中创建并生成矩阵
              </p>
            ) : (
              <Select
                value={projectId}
                onValueChange={setProjectId}
                disabled={generating}
              >
                <SelectTrigger size="sm" className="w-full max-w-md text-[12px]">
                  <SelectValue placeholder="选择项目" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id} className="text-[12px]">
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          {availableDates.length > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] font-medium text-slate-500">发布日期（多选）</p>
              <div className="flex flex-wrap gap-1.5">
                {availableDates.map((date) => {
                  const checked = selectedDates.includes(date)
                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={generating}
                      onClick={() => toggleDate(date)}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[11px] font-medium",
                        checked
                          ? "border-cyan-400 bg-cyan-50 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/15 dark:text-cyan-300"
                          : "border-slate-200 text-slate-500 dark:border-white/10",
                      )}
                    >
                      {date}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        {selectedProject && (
          <div className="grid gap-2 rounded-lg border border-cyan-100 bg-cyan-50/50 p-3 text-[11px] text-slate-600 dark:border-cyan-500/20 dark:bg-cyan-500/[0.08] dark:text-slate-300 sm:grid-cols-3">
            <span>目标优化：{selectedModelLabel}</span>
            <span>平台 Skill：已自动加载 {mappedViralSkillIds.length} 项</span>
            <span>企业知识库：{selectedProject.enterpriseSkillId ? "已继承" : "未配置"}</span>
          </div>
        )}
        </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div>
        <label
          htmlFor="geo-article-copies-per-slot"
          className="mb-1.5 block text-[11px] font-medium text-slate-500"
        >
          每组合篇数
          <span className="ml-1 font-normal text-slate-400">
            （同一天×同一渠道，1–{ARTICLE_BATCH_COPIES_PER_SLOT_MAX}）
          </span>
        </label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={generating || copiesPerSlot <= 1}
            onClick={() => setCopiesPerSlot((n) => clampCopiesPerSlot(n - 1))}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-[14px] text-slate-600 disabled:opacity-40 dark:border-white/10 dark:text-slate-300"
            aria-label="减少篇数"
          >
            −
          </button>
          <input
            id="geo-article-copies-per-slot"
            type="number"
            min={1}
            max={ARTICLE_BATCH_COPIES_PER_SLOT_MAX}
            value={copiesPerSlot}
            disabled={generating}
            onChange={(e) => handleCopiesChange(e.target.value)}
            className="h-8 w-16 rounded-md border border-slate-200 bg-white px-2 text-center text-[13px] tabular-nums text-slate-800 dark:border-white/10 dark:bg-transparent dark:text-slate-200"
          />
          <button
            type="button"
            disabled={generating || copiesPerSlot >= ARTICLE_BATCH_COPIES_PER_SLOT_MAX}
            onClick={() => setCopiesPerSlot((n) => clampCopiesPerSlot(n + 1))}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-[14px] text-slate-600 disabled:opacity-40 dark:border-white/10 dark:text-slate-300"
            aria-label="增加篇数"
          >
            +
          </button>
        </div>
        </div>
        <div>
          <label
            htmlFor="geo-article-illustrations-per-article"
            className="mb-1.5 block text-[11px] font-medium text-slate-500"
          >
            每篇插图
            <span className="ml-1 font-normal text-slate-400">
              （0–{ARTICLE_ILLUSTRATIONS_MAX} 张，文章完成后自动生成并插入）
            </span>
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={generating || illustrationsPerArticle <= 0}
              onClick={() =>
                setIllustrationsPerArticle((n) =>
                  clampIllustrationsPerArticle(n - 1),
                )
              }
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-[14px] text-slate-600 disabled:opacity-40 dark:border-white/10 dark:text-slate-300"
              aria-label="减少每篇插图数量"
            >
              −
            </button>
            <input
              id="geo-article-illustrations-per-article"
              type="number"
              min={0}
              max={ARTICLE_ILLUSTRATIONS_MAX}
              value={illustrationsPerArticle}
              disabled={generating}
              onChange={(e) => handleIllustrationsChange(e.target.value)}
              className="h-8 w-16 rounded-md border border-slate-200 bg-white px-2 text-center text-[13px] tabular-nums text-slate-800 dark:border-white/10 dark:bg-transparent dark:text-slate-200"
            />
            <button
              type="button"
              disabled={
                generating ||
                illustrationsPerArticle >= ARTICLE_ILLUSTRATIONS_MAX
              }
              onClick={() =>
                setIllustrationsPerArticle((n) =>
                  clampIllustrationsPerArticle(n + 1),
                )
              }
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-[14px] text-slate-600 disabled:opacity-40 dark:border-white/10 dark:text-slate-300"
              aria-label="增加每篇插图数量"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
        <p className="text-[12px] text-slate-500">
          {previewError ? (
            <span className="text-amber-600">{previewError}</span>
          ) : previewCount != null ? (
            <>
              将生成{" "}
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {previewCount}
              </span>{" "}
              篇
              <span className="text-slate-400">
                （矩阵内 {platformIds.length} 平台 × {selectedDates.length} 天 × {copiesPerSlot} 篇）
              </span>
              {illustrationsPerArticle > 0 && <span>，最多 {previewCount * illustrationsPerArticle} 张插图</span>}
              {previewSkipped > 0 && (
                <span className="ml-1 text-amber-600">
                  · {previewSkipped} 个组合无矩阵格已跳过
                </span>
              )}
            </>
          ) : (
            "配置完成后显示任务数"
          )}
        </p>
        <Button
          type="button"
          data-tutorial-id="geo-article-generate"
          size="sm"
          disabled={generating || !!previewError || !previewCount}
          onClick={() => void handleStart()}
          className="gap-1.5"
        >
          {generating ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              创作中…
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              开始创作
            </>
          )}
        </Button>
      </div>
    </div>
  )
}

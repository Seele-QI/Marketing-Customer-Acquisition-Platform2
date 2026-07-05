"use client"

import * as React from "react"
import { Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ARTICLE_BATCH_MAX_JOBS,
  alignJobSnapshots,
  expandDirectionJobs,
  expandMatrixJobs,
  listMatrixDates,
} from "@/lib/geo/article-batch-jobs"
import { MATRIX_PLATFORMS } from "@/lib/geo/matrix-platforms"
import { listMatrixProjects } from "@/lib/geo/matrix-api"
import type { MatrixProject } from "@/lib/geo/matrix-types"
import type { LlmProviderId } from "@/lib/geo/llm/router"
import { startBatchGenerate } from "@/lib/geo/article-batch-api"
import { saveJobSnapshots, type ArticleBatchConfig } from "@/lib/geo/article-batch-store"
import type { ArticleJob, BatchGenerateEvent, GeneratedArticle } from "@/lib/geo/article-types"
import { toast } from "@/hooks/use-toast"

type Props = {
  provider: LlmProviderId
  modelSkillId: string | null
  viralSkillIds: string[]
  enterpriseSnapshot: string | null
  generating: boolean
  onGeneratingChange: (v: boolean) => void
  onProgress: (completed: number, total: number) => void
  onBatchStart: (jobIds: { jobId: string; title: string; platformId: string; date?: string }[]) => void
  onArticle: (article: GeneratedArticle) => void
  onJobError: (jobId: string, error: string) => void
  onBatchComplete: (config: ArticleBatchConfig) => void
}

export function GeoArticleBatchPanel({
  provider,
  modelSkillId,
  viralSkillIds,
  enterpriseSnapshot,
  generating,
  onGeneratingChange,
  onProgress,
  onBatchStart,
  onArticle,
  onJobError,
  onBatchComplete,
}: Props) {
  const [mode, setMode] = React.useState<"direction" | "matrix">("direction")
  const [direction, setDirection] = React.useState("")
  const [platformIds, setPlatformIds] = React.useState<string[]>(["xiaohongshu", "zhihu"])
  const [projects, setProjects] = React.useState<MatrixProject[]>([])
  const [projectsLoading, setProjectsLoading] = React.useState(false)
  const [projectId, setProjectId] = React.useState<string>("")
  const [selectedDates, setSelectedDates] = React.useState<string[]>([])
  const [previewCount, setPreviewCount] = React.useState<number | null>(null)
  const [previewSkipped, setPreviewSkipped] = React.useState(0)
  const [previewError, setPreviewError] = React.useState<string | null>(null)
  const localJobsRef = React.useRef<ArticleJob[]>([])

  const selectedProject = React.useMemo(
    () => projects.find((p) => p.id === projectId) ?? null,
    [projects, projectId],
  )

  const availableDates = React.useMemo(
    () => listMatrixDates(selectedProject),
    [selectedProject],
  )

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
        if (!cancelled) setProjects([])
      })
      .finally(() => {
        if (!cancelled) setProjectsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (selectedProject?.platforms?.length) {
      setPlatformIds(selectedProject.platforms)
    }
  }, [selectedProject?.id])

  React.useEffect(() => {
    if (availableDates.length > 0 && selectedDates.length === 0) {
      setSelectedDates([availableDates[0]])
    }
  }, [availableDates, selectedDates.length])

  React.useEffect(() => {
    try {
      if (mode === "direction") {
        const { jobs } = expandDirectionJobs({
          mode: "direction",
          direction,
          platformIds,
        })
        setPreviewCount(jobs.length)
        setPreviewSkipped(0)
        setPreviewError(null)
      } else if (selectedProject) {
        const { jobs, skipped } = expandMatrixJobs({
          mode: "matrix",
          project: selectedProject,
          dates: selectedDates,
          platformIds,
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
  }, [mode, direction, platformIds, selectedProject, selectedDates])

  const togglePlatform = (id: string) => {
    setPlatformIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const toggleDate = (date: string) => {
    setSelectedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date],
    )
  }

  const handleStart = async () => {
    if (generating) return
    if (previewError || previewCount == null || previewCount < 1) {
      toast({ title: previewError ?? "请完善创作配置", variant: "destructive" })
      return
    }
    if (previewCount > ARTICLE_BATCH_MAX_JOBS) {
      toast({
        title: `单次最多 ${ARTICLE_BATCH_MAX_JOBS} 篇，当前 ${previewCount} 篇`,
        variant: "destructive",
      })
      return
    }

    const config: ArticleBatchConfig = {
      mode,
      direction: mode === "direction" ? direction.trim() : undefined,
      projectId: mode === "matrix" ? projectId : undefined,
      dates: mode === "matrix" ? selectedDates : undefined,
      platformIds,
    }

    let jobMetas: { jobId: string; title: string; platformId: string; date?: string }[] = []
    let expandedJobs: ArticleJob[] = []
    try {
      if (mode === "direction") {
        const expanded = expandDirectionJobs({
          mode: "direction",
          direction: direction.trim(),
          platformIds,
        })
        expandedJobs = expanded.jobs
        jobMetas = expanded.jobs.map((j) => ({
          jobId: j.jobId,
          title: j.title,
          platformId: j.platformId,
        }))
      } else if (selectedProject) {
        const expanded = expandMatrixJobs({
          mode: "matrix",
          project: selectedProject,
          dates: selectedDates,
          platformIds,
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
      await startBatchGenerate(
        {
          provider,
          modelSkillId,
          viralSkillIds,
          enterpriseSnapshot,
          mode,
          direction: config.direction,
          projectId: config.projectId,
          dates: config.dates,
          platformIds,
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
              onArticle(event.article)
            }
            if (event.type === "job_error" && event.jobId !== "batch") {
              completed += 1
              onProgress(completed, total)
              onJobError(event.jobId, event.error)
            }
          },
          onArticle,
        },
      )
      onBatchComplete(config)
      toast({ title: "批量创作完成" })
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
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
          并发创作
        </h3>
        <div className="flex rounded-lg border border-slate-200/80 p-0.5 dark:border-white/10">
          <button
            type="button"
            onClick={() => setMode("direction")}
            className={cn(
              "rounded-md px-3 py-1 text-[11px] font-medium transition-colors",
              mode === "direction"
                ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
            )}
          >
            自定义方向
          </button>
          <button
            type="button"
            onClick={() => setMode("matrix")}
            className={cn(
              "rounded-md px-3 py-1 text-[11px] font-medium transition-colors",
              mode === "matrix"
                ? "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
            )}
          >
            内容矩阵
          </button>
        </div>
      </div>

      {mode === "direction" ? (
        <div className="mb-3">
          <label className="mb-1.5 block text-[11px] font-medium text-slate-500">
            创作方向
          </label>
          <Textarea
            value={direction}
            onChange={(e) => setDirection(e.target.value)}
            rows={3}
            placeholder="例：AI 视频翻译完全指南，面向出海创作者…"
            className="text-[13px]"
            disabled={generating}
          />
        </div>
      ) : (
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
        </div>
      )}

      <div className="mb-3">
        <p className="mb-1.5 text-[11px] font-medium text-slate-500">发布平台（多选）</p>
        <div className="flex flex-wrap gap-1.5">
          {MATRIX_PLATFORMS.map((p) => {
            const checked = platformIds.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                disabled={generating}
                onClick={() => togglePlatform(p.id)}
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
                  checked
                    ? "border-cyan-400 bg-cyan-50 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/15 dark:text-cyan-300"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-white/10 dark:text-slate-400",
                )}
              >
                {p.label}
              </button>
            )
          })}
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
              {mode === "direction" ? (
                <span className="text-slate-400">
                  （已选 {platformIds.length} 个平台）
                </span>
              ) : (
                <span className="text-slate-400">
                  （{platformIds.length} 平台 × {selectedDates.length} 天）
                </span>
              )}
              {previewSkipped > 0 && (
                <span className="ml-1 text-amber-600">
                  · {previewSkipped} 个组合无矩阵格已跳过
                </span>
              )}
              {previewCount > ARTICLE_BATCH_MAX_JOBS && (
                <span className="ml-1 text-red-500">
                  （超过上限 {ARTICLE_BATCH_MAX_JOBS}）
                </span>
              )}
            </>
          ) : (
            "配置完成后显示任务数"
          )}
        </p>
        <Button
          type="button"
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

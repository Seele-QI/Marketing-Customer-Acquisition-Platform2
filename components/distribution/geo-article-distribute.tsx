"use client"

import * as React from "react"
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock3,
  FileText,
  Loader2,
  MapPin,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react"

import { GEO_VIEWS } from "@/lib/geo/workspace"
import { loadArticleBatch } from "@/lib/geo/article-batch-store"
import type { GeneratedArticle } from "@/lib/geo/article-types"
import { listMatrixProjects } from "@/lib/geo/matrix-api"
import type { MatrixProject } from "@/lib/geo/matrix-types"
import type { MainView } from "@/components/dashboard-sidebar"
import {
  DISTRIBUTION_ACCOUNTS_CHANGED_EVENT,
  getDistributionPlatformBrand,
  mergeDistributionPlatforms,
  readDistributionApiResponse,
  type DistributionPlatform,
} from "@/lib/distribution/platforms"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import {
  GEO_DISTRIBUTION_UNDATED,
  listGeoDistributionBatches,
  matchGeoArticlesByProjectDate,
} from "@/lib/distribution/geo-platform-articles"

type Adaptation = {
  platform: string
  articleId?: string
  title: string
  body: string
  tags: string[]
}
type JobItem = {
  platform: string
  status: string
  error?: string
  result?: { url?: string; metadata?: { state?: string } }
}
type Job = { jobId: string; status: string; items: JobItem[] }

const ACTIVE_JOB_STORAGE_KEY = "zhongtai.geo-distribution.active-job.v1"
const DISTRIBUTION_SELECTION_STORAGE_KEY = "zhongtai.geo-distribution.selection.v2"
const TERMINAL_JOB_STATUSES = new Set(["success", "failed", "cancelled", "waiting_user"])

const JOB_STATUS_LABELS: Record<string, string> = {
  queued: "排队中",
  running: "发布中",
  success: "已完成",
  failed: "发布失败",
  cancelled: "已停止",
  waiting_user: "等待处理",
}

function jobStatusLabel(status: string) {
  return JOB_STATUS_LABELS[status] || "处理中"
}

function platformName(platformId: string) {
  return getDistributionPlatformBrand(platformId)?.name || platformId
}

export function GeoArticleDistribute({
  onNavigate,
  onNavigateToBinding,
}: {
  onNavigate: (view: MainView) => void
  onNavigateToBinding: () => void
}) {
  const [articles, setArticles] = React.useState<GeneratedArticle[]>([])
  const [matrixProjects, setMatrixProjects] = React.useState<MatrixProject[]>([])
  const [projectId, setProjectId] = React.useState("")
  const [publishDate, setPublishDate] = React.useState("")
  const [accountPlatforms, setAccountPlatforms] = React.useState<DistributionPlatform[]>([])
  const [poiName, setPoiName] = React.useState("")
  const [city, setCity] = React.useState("")
  const [poiReference, setPoiReference] = React.useState("")
  const [previewToken, setPreviewToken] = React.useState("")
  const [adaptations, setAdaptations] = React.useState<Adaptation[]>([])
  const [job, setJob] = React.useState<Job | null>(null)
  const [pollError, setPollError] = React.useState("")
  const [retryingPlatform, setRetryingPlatform] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [accountsLoading, setAccountsLoading] = React.useState(false)
  const [submitMode, setSubmitMode] = React.useState<"manual_confirm" | "auto_submit">("manual_confirm")
  const publishInFlightRef = React.useRef(false)
  const expiredBindingsRef = React.useRef(new Set<string>())

  const loadAccounts = React.useCallback(async () => {
    setAccountsLoading(true)
    try {
      const response = await fetch("/api/connectors/platforms", {
        credentials: "include",
        cache: "no-store",
      })
      if (response.status === 401) {
        setAccountPlatforms(mergeDistributionPlatforms([], "geo_article", false))
        return
      }
      const result = await readDistributionApiResponse<{ platforms?: DistributionPlatform[] }>(
        response,
        "加载 GEO 平台账号失败",
      )
      if (!result.ok) throw new Error(result.message)
      const merged = mergeDistributionPlatforms(result.data?.platforms ?? [], "geo_article", false)
      setAccountPlatforms(merged)
    } catch (reason) {
      setAccountPlatforms(mergeDistributionPlatforms([], "geo_article", true))
      toast({
        title: "账号状态读取失败",
        description: reason instanceof Error ? reason.message : "请稍后重试",
        variant: "destructive",
      })
    } finally {
      setAccountsLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const expired = (job?.items ?? [])
      .filter((item) => item.result?.metadata?.state === "login_required")
      .map((item) => item.platform)
      .filter((platform) => !expiredBindingsRef.current.has(platform))
    if (!expired.length) return
    expired.forEach((platform) => expiredBindingsRef.current.add(platform))
    void loadAccounts()
  }, [job, loadAccounts])

  React.useEffect(() => {
    const list = loadArticleBatch().articles.filter((article) => article.status === "success")
    const articleTimer = window.setTimeout(() => setArticles(list), 0)
    void listMatrixProjects()
      .then(setMatrixProjects)
      .catch(() => setMatrixProjects([]))
    const accountTimer = window.setTimeout(() => void loadAccounts(), 0)
    const refresh = () => void loadAccounts()
    window.addEventListener(DISTRIBUTION_ACCOUNTS_CHANGED_EVENT, refresh)
    window.addEventListener("focus", refresh)
    return () => {
      window.clearTimeout(articleTimer)
      window.clearTimeout(accountTimer)
      window.removeEventListener(DISTRIBUTION_ACCOUNTS_CHANGED_EVENT, refresh)
      window.removeEventListener("focus", refresh)
    }
  }, [loadAccounts])

  React.useEffect(() => {
    const savedJobId = window.localStorage.getItem(ACTIVE_JOB_STORAGE_KEY)
    if (!savedJobId) return
    const controller = new AbortController()
    void fetch(`/api/distribution/jobs/${encodeURIComponent(savedJobId)}`, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("saved job is unavailable")
        setJob(await response.json() as Job)
      })
      .catch((reason) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return
        window.localStorage.removeItem(ACTIVE_JOB_STORAGE_KEY)
      })
    return () => controller.abort()
  }, [])

  React.useEffect(() => {
    if (!job?.jobId) return
    window.localStorage.setItem(ACTIVE_JOB_STORAGE_KEY, job.jobId)
  }, [job?.jobId])

  React.useEffect(() => {
    const jobId = job?.jobId
    if (!jobId || TERMINAL_JOB_STATUSES.has(job.status)) return

    let disposed = false
    let timer: number | undefined
    let consecutiveFailures = 0
    let activeController: AbortController | null = null

    const schedule = (delayMs: number) => {
      if (disposed) return
      timer = window.setTimeout(() => void poll(), delayMs)
    }
    const poll = async () => {
      activeController = new AbortController()
      try {
        const response = await fetch(`/api/distribution/jobs/${encodeURIComponent(jobId)}`, {
          credentials: "include",
          cache: "no-store",
          signal: activeController.signal,
        })
        if (!response.ok) throw new Error(`任务状态读取失败（${response.status}）`)
        const next = await response.json() as Job
        if (disposed) return
        consecutiveFailures = 0
        setPollError("")
        setJob(next)
        if (!TERMINAL_JOB_STATUSES.has(next.status)) schedule(2000)
      } catch (reason) {
        if (disposed || (reason instanceof DOMException && reason.name === "AbortError")) return
        consecutiveFailures += 1
        setPollError(reason instanceof Error ? reason.message : "任务状态读取失败")
        schedule(Math.min(30_000, 2_000 * (2 ** Math.min(consecutiveFailures - 1, 4))))
      }
    }

    schedule(500)
    return () => {
      disposed = true
      if (timer !== undefined) window.clearTimeout(timer)
      activeController?.abort()
    }
  }, [job?.jobId, job?.status])

  const batches = React.useMemo(() => listGeoDistributionBatches(articles), [articles])
  const projectOptions = React.useMemo(() => {
    const names = new Map(matrixProjects.map((project) => [project.id, project.name]))
    const latestByProject = new Map<string, number>()
    for (const batch of batches) {
      latestByProject.set(
        batch.projectId,
        Math.max(latestByProject.get(batch.projectId) ?? 0, batch.latestCreatedAt),
      )
    }
    return [...latestByProject.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => ({ id, name: names.get(id) || `矩阵项目 ${id.slice(-6)}` }))
  }, [batches, matrixProjects])
  const dateOptions = React.useMemo(
    () => batches.filter((batch) => batch.projectId === projectId),
    [batches, projectId],
  )
  const connectedPlatformIds = React.useMemo(
    () => accountPlatforms.filter((item) => item.connected).map((item) => item.platform_id),
    [accountPlatforms],
  )
  const platformArticleMatches = React.useMemo(
    () => matchGeoArticlesByProjectDate({
      articles,
      projectId,
      date: publishDate,
      connectedPlatforms: connectedPlatformIds,
    }),
    [articles, connectedPlatformIds, projectId, publishDate],
  )
  const platforms = React.useMemo(
    () => platformArticleMatches.matches.map(({ platform }) => platform),
    [platformArticleMatches.matches],
  )
  const selected = platformArticleMatches.matches[0]?.article
  const needsPoi = platforms.some((platform) => platform === "dianping" || platform === "ctrip")
  const connectedCount = accountPlatforms.filter((item) => item.connected).length

  React.useEffect(() => {
    if (!batches.length) return
    let saved: { projectId?: string; publishDate?: string } = {}
    try {
      saved = JSON.parse(window.localStorage.getItem(DISTRIBUTION_SELECTION_STORAGE_KEY) || "{}")
    } catch {
      // Ignore a corrupt legacy selection and fall back to the newest batch.
    }
    const preferred = batches.find(
      (batch) => batch.projectId === saved.projectId && batch.date === saved.publishDate,
    ) || batches[0]
    const timer = window.setTimeout(() => {
      setProjectId((current) => current || preferred.projectId)
      setPublishDate((current) => current || preferred.date)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [batches])

  React.useEffect(() => {
    if (!projectId) return
    const validDates = batches.filter((batch) => batch.projectId === projectId)
    if (!validDates.length) return
    if (!validDates.some((batch) => batch.date === publishDate)) {
      const timer = window.setTimeout(() => setPublishDate(validDates[0].date), 0)
      return () => window.clearTimeout(timer)
    }
    window.localStorage.setItem(
      DISTRIBUTION_SELECTION_STORAGE_KEY,
      JSON.stringify({ projectId, publishDate }),
    )
  }, [batches, projectId, publishDate])

  const resetPreview = () => {
    setPreviewToken("")
    setAdaptations([])
  }

  const createPreview = async () => {
    if (!projectId || !publishDate) {
      toast({ title: "请选择项目和发布日期", variant: "destructive" })
      return
    }
    if (!selected || !platforms.length) {
      toast({
        title: "当前日期没有可发布的平台文章",
        description: platformArticleMatches.unbound.length
          ? `对应文章已生成，但账号尚未绑定：${platformArticleMatches.unbound.map(platformName).join("、")}`
          : "请先在内容矩阵生成文章，或检查平台账号绑定状态",
        variant: "destructive",
      })
      return
    }
    if (needsPoi && (!poiName.trim() || !city.trim() || !poiReference.trim())) {
      toast({ title: "点评/携程需要真实门店或目的地信息", variant: "destructive" })
      return
    }
    setBusy(true)
    try {
      const response = await fetch("/api/distribution/adapt", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentType: "geo_article",
          platforms,
          source: {
            articleId: selected.id,
            title: selected.title,
            markdown: selected.markdown,
            media: [],
            projectId: selected.projectId,
            date: selected.date,
            platformArticles: platformArticleMatches.matches.map(({ platform, article }) => ({
              platform,
              articleId: article.id,
              projectId: article.projectId,
              date: article.date,
              title: article.title,
              markdown: article.markdown,
              media: [],
            })),
            poiName,
            cityOrDestination: city,
            poiReference,
          },
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(String(data.detail?.message || data.detail || "生成预览失败"))
      setPreviewToken(data.previewToken)
      setAdaptations(data.adaptations)
    } catch (reason) {
      toast({
        title: "生成平台预览失败",
        description: reason instanceof Error ? reason.message : "请稍后重试",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const publish = async () => {
    if (publishInFlightRef.current || !previewToken || !confirm("已检查各平台适配内容，确认开始顺序发布？")) return
    publishInFlightRef.current = true
    setBusy(true)
    try {
      const response = await fetch("/api/distribution/jobs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          previewToken,
          idempotencyKey: `geo:${previewToken}:${submitMode}`,
          confirmed: true,
          submitMode,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(String(data.detail?.message || data.detail || "创建发布任务失败"))
      setPollError("")
      setJob(data)
    } catch (reason) {
      toast({
        title: "创建发布任务失败",
        description: reason instanceof Error ? reason.message : "请稍后重试",
        variant: "destructive",
      })
    } finally {
      publishInFlightRef.current = false
      setBusy(false)
    }
  }

  const retry = async (platform: string) => {
    if (!job || retryingPlatform) return
    setRetryingPlatform(platform)
    try {
      const response = await fetch(`/api/distribution/jobs/${encodeURIComponent(job.jobId)}/items/${encodeURIComponent(platform)}/retry`, {
        method: "POST",
        credentials: "include",
      })
      const data = await response.json().catch(() => null) as Job | { detail?: { message?: string } } | null
      if (!response.ok) throw new Error((data as { detail?: { message?: string } } | null)?.detail?.message || "重试任务提交失败")
      setPollError("")
      setJob(data as Job)
    } catch (reason) {
      toast({
        title: `${platformName(platform)}重试失败`,
        description: reason instanceof Error ? reason.message : "请稍后重试",
        variant: "destructive",
      })
    } finally {
      setRetryingPlatform("")
    }
  }

  const cancelJob = async () => {
    if (!job || TERMINAL_JOB_STATUSES.has(job.status) || !confirm("确认停止尚未开始的平台发布？当前正在提交的平台可能仍会完成。")) return
    try {
      const response = await fetch(`/api/distribution/jobs/${encodeURIComponent(job.jobId)}/cancel`, {
        method: "POST",
        credentials: "include",
      })
      const data = await response.json().catch(() => null) as Job | { detail?: { message?: string } } | null
      if (!response.ok) throw new Error((data as { detail?: { message?: string } } | null)?.detail?.message || "取消任务失败")
      setJob(data as Job)
    } catch (reason) {
      toast({
        title: "取消任务失败",
        description: reason instanceof Error ? reason.message : "请稍后重试",
        variant: "destructive",
      })
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[#fafaf8] text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-3 h-1 w-12 rounded-full bg-cyan-500" />
            <h1 className="text-4xl font-bold tracking-tight">GEO 文章<span className="text-cyan-600">一键分发</span></h1>
            <p className="mt-2 text-sm text-slate-500">选择矩阵项目和发布日期，系统自动匹配当天各平台文章并生成发布计划。</p>
          </div>
          <button
            type="button"
            onClick={() => void loadAccounts()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm"
          >
            <RefreshCw className={cn("h-4 w-4", accountsLoading && "animate-spin")} />
            已连接 {connectedCount}/8
          </button>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="space-y-5 rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">1. 选择矩阵项目</h2>
                <span className="text-xs text-slate-400">{projectOptions.length} 个可分发项目</span>
              </div>
              {projectOptions.length ? (
                <select
                  value={projectId}
                  onChange={(event) => {
                    const nextProjectId = event.target.value
                    const firstDate = batches.find((batch) => batch.projectId === nextProjectId)?.date || ""
                    setProjectId(nextProjectId)
                    setPublishDate(firstDate)
                    resetPreview()
                  }}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium outline-none transition focus:border-cyan-400 focus:ring-4 focus:ring-cyan-50"
                >
                  {projectOptions.map((project) => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-200 p-6 text-center">
                  <FileText className="mx-auto h-8 w-8 text-slate-300" />
                  <p className="mt-3 text-sm">暂无已完成文章的矩阵项目</p>
                  <button onClick={() => onNavigate(GEO_VIEWS.ARTICLE_EDITOR)} className="mt-4 rounded-xl bg-cyan-700 px-4 py-2 text-sm text-white">
                    前往 GEO 文章创作 <ArrowRight className="inline h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {projectOptions.length ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">2. 选择发布日期</h2>
                  <span className="text-xs text-slate-400">仅显示该项目已有文章的日期</span>
                </div>
                <div className="flex max-h-32 flex-wrap gap-2 overflow-y-auto pr-1">
                  {dateOptions.map((batch) => {
                    const active = publishDate === batch.date
                    return (
                      <button
                        key={batch.date}
                        type="button"
                        onClick={() => {
                          setPublishDate(batch.date)
                          resetPreview()
                        }}
                        className={cn(
                          "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm transition",
                          active
                            ? "border-cyan-400 bg-cyan-50 font-semibold text-cyan-800"
                            : "border-slate-200 bg-white text-slate-600 hover:border-cyan-200",
                        )}
                      >
                        {active ? <Check className="h-3.5 w-3.5" /> : null}
                        {batch.date === GEO_DISTRIBUTION_UNDATED ? "未标注日期" : batch.date}
                        <span className="text-[10px] text-slate-400">{batch.platformIds.length} 平台</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : null}

            {projectId && publishDate ? (
              <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">已自动匹配 {platforms.length} 个发布平台</h2>
                    <p className="mt-1 text-xs leading-5 text-slate-500">每个平台使用本项目、本日期下自己的矩阵文章，不会跨平台复用。</p>
                  </div>
                  {connectedCount === 0 ? (
                    <button type="button" onClick={onNavigateToBinding} className="shrink-0 text-xs font-medium text-cyan-700">绑定账号</button>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {platformArticleMatches.matches.map(({ platform }) => (
                    <span key={platform} className="rounded-full border border-cyan-200 bg-white px-3 py-1.5 text-xs font-medium text-cyan-800">
                      {platformName(platform)} · 已匹配
                    </span>
                  ))}
                  {platformArticleMatches.unbound.map((platform) => (
                    <button key={platform} type="button" onClick={onNavigateToBinding} className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-700">
                      {platformName(platform)} · 待绑定
                    </button>
                  ))}
                </div>
                {!platforms.length && !platformArticleMatches.unbound.length ? (
                  <p className="mt-3 text-xs text-amber-700">该项目在此日期下尚无可分发的成功文章。</p>
                ) : null}
              </div>
            ) : null}

            {needsPoi ? (
              <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-amber-900">
                  <MapPin className="h-4 w-4" />点评与携程仅发布真实门店或目的地攻略
                </p>
                <input value={poiName} onChange={(event) => setPoiName(event.target.value)} placeholder="真实门店或目的地名称" className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" />
                <input value={city} onChange={(event) => setCity(event.target.value)} placeholder="城市或目的地" className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" />
                <input value={poiReference} onChange={(event) => setPoiReference(event.target.value)} placeholder="真实 POI 链接或平台 ID" className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm" />
              </div>
            ) : null}

            <button
              disabled={busy || !selected || !platforms.length}
              onClick={createPreview}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 py-3 text-sm font-semibold text-white disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              生成 {platforms.length || "当前"} 平台发布计划
            </button>
          </section>

          <section className="rounded-3xl border border-slate-200/70 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">3. 平台发布计划</h2>
              <span className="text-xs text-slate-400">{adaptations.length ? `${adaptations.length} 个平台` : "等待生成"}</span>
            </div>
            {!adaptations.length ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center text-center text-sm text-slate-400">
                <Sparkles className="mb-3 h-8 w-8 text-cyan-200" />
                <p>生成预览后在这里检查各平台标题和正文</p>
                <p className="mt-1 text-xs">内容不会在未经确认时自动发布</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="grid max-h-[430px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
                  {adaptations.map((adaptation) => (
                    <article key={adaptation.platform} className="rounded-2xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between">
                        <strong className="text-sm">{platformName(adaptation.platform)}</strong>
                        <span className="rounded-full bg-cyan-50 px-2 py-1 text-[10px] text-cyan-700">待确认</span>
                      </div>
                      <p className="mt-2 text-[10px] font-medium text-emerald-600">
                        已匹配该平台的矩阵原文
                      </p>
                      <h3 className="mt-3 text-sm font-semibold">{adaptation.title}</h3>
                      <p className="mt-2 line-clamp-5 whitespace-pre-wrap text-xs leading-5 text-slate-500">{adaptation.body}</p>
                    </article>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-1.5">
                  <button type="button" onClick={() => setSubmitMode("manual_confirm")} className={cn("rounded-lg px-3 py-2 text-left text-xs", submitMode === "manual_confirm" ? "bg-white font-semibold shadow-sm ring-1 ring-cyan-200" : "text-slate-500")}>
                    人工确认（推荐）
                    <span className="mt-1 block text-[10px] font-normal">自动填充，您最终点击发布</span>
                  </button>
                  <button type="button" onClick={() => setSubmitMode("auto_submit")} className={cn("rounded-lg px-3 py-2 text-left text-xs", submitMode === "auto_submit" ? "bg-white font-semibold shadow-sm ring-1 ring-cyan-200" : "text-slate-500")}>
                    自动提交
                    <span className="mt-1 block text-[10px] font-normal">程序尝试点击最终发布</span>
                  </button>
                </div>
                <button disabled={busy} onClick={publish} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white">
                  <Send className="h-4 w-4" />
                  {submitMode === "manual_confirm" ? "确认并开始半自动推送" : "确认并自动顺序推送"}
                </button>
              </div>
            )}
          </section>
        </div>

        {job ? (
          <section className="mt-5 rounded-3xl border border-slate-200/70 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">发布任务</h2>
              <div className="flex items-center gap-2">
                {pollError ? <span className="text-xs text-amber-600">网络波动，自动重试中</span> : null}
                {!TERMINAL_JOB_STATUSES.has(job.status) ? (
                  <button type="button" onClick={cancelJob} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-600">
                    停止后续发布
                  </button>
                ) : null}
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{jobStatusLabel(job.status)}</span>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {job.items.map((item) => (
                <div key={item.platform} className="rounded-2xl border p-4">
                  <div className="flex items-center gap-2">
                    {item.status === "success" ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Clock3 className="h-4 w-4 text-amber-600" />}
                    <strong className="text-sm">{platformName(item.platform)}</strong>
                    <span className="ml-auto text-xs">{jobStatusLabel(item.status)}</span>
                  </div>
                  {item.error ? <p className="mt-2 text-xs text-red-600">{item.error}</p> : null}
                  {["failed", "waiting_user"].includes(item.status) ? (
                    <button disabled={Boolean(retryingPlatform)} onClick={() => retry(item.platform)} className="mt-3 rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50">
                      {retryingPlatform === item.platform ? "重新定位中…" : "重新尝试发布"}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  )
}

"use client"

import * as React from "react"
import {
  Sprout,
  TrendingUp,
  Gem,
  Sparkles,
  Target,
  ChevronRight,
  Check,
  Lightbulb,
  BarChart3,
  Zap,
  Loader2,
  Upload,
  FileText,
  X,
  Briefcase,
  User,
  MapPin,
  Globe,
  DollarSign,
  MessageSquare,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"

/* ------------------------------------------------------------------ */
/*  Types & Mock Data                                                  */
/* ------------------------------------------------------------------ */

type StageId = "novice" | "growth" | "mature"

type TrackRecommendation = {
  id: string
  name: string
  matchScore: number
  tagline: string
  why: string
  contentPillars: string[]
  audience: string
  platforms: string[]
  monetization: string
  difficulty: "low" | "medium" | "high"
  growthPotential: "low" | "medium" | "high"
}

type UploadedFile = {
  name: string
  size: number
  type: string
  base64: string
}

const STAGES = [
  { id: "novice" as const, title: "新手探索期", desc: "刚起步，寻找方向", icon: Sprout },
  { id: "growth" as const, title: "稳定成长期", desc: "有基础，寻求破圈", icon: TrendingUp },
  { id: "mature" as const, title: "成熟变现期", desc: "成熟 IP，放大收入", icon: Gem },
]

const STAGE_HINTS: Record<StageId, string> = {
  novice: "侧重定位梳理与起步路径，帮你找到差异化的切入口。",
  growth: "侧重选题破圈与转化闭环，帮你放大现有优势。",
  mature: "侧重商业变现与矩阵扩张，帮你深化 IP 护城河。",
}

const ACCEPTED_FILES = ".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md"
const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB
const MAX_FILES = 5

/* ------------------------------------------------------------------ */
/*  Mock data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_TRACKS: Record<string, TrackRecommendation[]> = {
  novice: [
    {
      id: "workplace-empathy",
      name: "职场共情型口播",
      matchScore: 87,
      tagline: "用真实职场故事建立情感连接",
      why: "你描述的创业+管理复合背景天然适合「过来人」人设，口播门槛低、起号快。",
      contentPillars: ["打工人的100个真相", "管理者的第一视角", "面试/跳槽干货"],
      audience: "25-35 岁职场人，一二线城市",
      platforms: ["抖音", "小红书", "视频号"],
      monetization: "职场课程 + 1v1 咨询 + 企业内训",
      difficulty: "low",
      growthPotential: "high",
    },
    {
      id: "industry-deepdive",
      name: "行业深潜型分析",
      matchScore: 72,
      tagline: "成为你所在赛道的「行业词典」",
      why: "你在特定行业的积累可以转化为稀缺的深度内容，吸引高净值精准粉丝。",
      contentPillars: ["行业底层逻辑", "数据解读", "趋势预判"],
      audience: "28-40 岁行业从业者、投资人",
      platforms: ["B站", "公众号", "抖音"],
      monetization: "行业报告 + 企业咨询 + 知识付费",
      difficulty: "medium",
      growthPotential: "medium",
    },
    {
      id: "skill-vlog",
      name: "技能展示型 Vlog",
      matchScore: 65,
      tagline: "用专业技能的过程感吸引同频人",
      why: "你有可展示的硬技能，过程即内容。适合用「制作过程」类内容建立专业信任。",
      contentPillars: ["工作日常", "技能拆解", "工具推荐"],
      audience: "22-30 岁新入行者、转行者",
      platforms: ["小红书", "B站", "抖音"],
      monetization: "技能课程 + 工具带货 + 社群",
      difficulty: "low",
      growthPotential: "high",
    },
  ],
  growth: [
    {
      id: "personal-ip-scale",
      name: "个人 IP 矩阵化",
      matchScore: 84,
      tagline: "从单账号单平台到多账号多平台的 IP 矩阵",
      why: "你已有基础粉丝和内容能力，现在需要系统化的矩阵策略来突破增长天花板。",
      contentPillars: ["主账号深度内容", "子账号流量内容", "跨平台二创分发"],
      audience: "现有粉丝 + 平台推荐流量",
      platforms: ["抖音", "小红书", "B站", "视频号"],
      monetization: "品牌合作 + 自有产品 + 社群会员",
      difficulty: "medium",
      growthPotential: "high",
    },
    {
      id: "community-driven",
      name: "社群驱动型 IP",
      matchScore: 71,
      tagline: "用高粘性社群构建护城河",
      why: "你的粉丝粘性高，适合从「内容创作者」升级为「社群运营者」，提升 LTV。",
      contentPillars: ["圈层话题", "成员故事", "UGC 共创"],
      audience: "现有粉丝 + 圈层兴趣人群",
      platforms: ["微信生态", "抖音", "小红书"],
      monetization: "付费社群 + 线下活动 + 联名产品",
      difficulty: "high",
      growthPotential: "high",
    },
  ],
  mature: [
    {
      id: "ip-products",
      name: "IP 产品化",
      matchScore: 89,
      tagline: "将 IP 影响力转化为可复购的产品矩阵",
      why: "你的 IP 已成熟，核心是将认知资产产品化，从「卖时间」升级为「卖产品」。",
      contentPillars: ["产品故事", "用户案例", "行业标准定义"],
      audience: "现有客群 + 渠道合作伙伴",
      platforms: ["全平台分发", "线下活动", "行业大会"],
      monetization: "SaaS / 课程 / 书籍 / 加盟",
      difficulty: "medium",
      growthPotential: "high",
    },
  ],
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result
      if (typeof r !== "string") return reject(new Error("读取失败"))
      const comma = r.indexOf(",")
      resolve(comma >= 0 ? r.slice(comma + 1) : r)
    }
    reader.onerror = () => reject(reader.error ?? new Error("读取失败"))
    reader.readAsDataURL(file)
  })
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function StageCard({
  stage,
  selected,
  onSelect,
}: {
  stage: (typeof STAGES)[number]
  selected: boolean
  onSelect: () => void
}) {
  const Icon = stage.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex flex-col items-center gap-3 rounded-2xl border p-5 text-center transition-all duration-300",
        selected
          ? "border-amber-400/60 bg-amber-50/50 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10"
          : "border-slate-200/60 bg-white hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20",
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
      <span
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110",
          selected ? "bg-amber-100 dark:bg-amber-500/20" : "bg-slate-50 dark:bg-white/5",
        )}
      >
        <Icon className={cn("h-6 w-6 transition-colors", selected ? "text-amber-600 dark:text-amber-400" : "text-slate-400 dark:text-slate-500")} />
      </span>
      <div>
        <p className={cn("text-[14px] font-semibold", selected ? "text-amber-800 dark:text-amber-300" : "text-slate-700 dark:text-slate-300")}>
          {stage.title}
        </p>
        <p className="mt-0.5 text-[12px] text-slate-400">{stage.desc}</p>
      </div>
    </button>
  )
}

function FormField({
  label,
  required,
  icon: Icon,
  children,
}: {
  label: string
  required?: boolean
  icon?: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        {Icon && <Icon className="h-3.5 w-3.5 text-slate-400" />}
        <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
          {label}
          {required ? (
            <span className="ml-1 text-rose-500">*</span>
          ) : (
            <span className="ml-1 text-[11px] font-normal text-slate-400">选填</span>
          )}
        </label>
      </div>
      {children}
    </div>
  )
}

function FileChip({
  file,
  onRemove,
}: {
  file: UploadedFile
  onRemove: () => void
}) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5 text-[12px] shadow-sm dark:border-white/10 dark:bg-white/5">
      <FileText className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      <span className="max-w-[140px] truncate text-slate-600 dark:text-slate-400">{file.name}</span>
      <span className="text-[10px] text-slate-400">{formatFileSize(file.size)}</span>
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-rose-500 dark:hover:bg-white/10"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  )
}

function TrackCard({
  track,
  rank,
  expanded,
  onToggle,
}: {
  track: TrackRecommendation
  rank: number
  expanded: boolean
  onToggle: () => void
}) {
  const scoreColor =
    track.matchScore >= 85
      ? "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10"
      : track.matchScore >= 70
        ? "text-amber-600 bg-amber-50 dark:text-amber-400 dark:bg-amber-500/10"
        : "text-slate-500 bg-slate-50 dark:text-slate-400 dark:bg-white/5"

  const difficultyLabel = { low: "起步容易", medium: "需要积累", high: "挑战较大" }[track.difficulty]
  const growthLabel = { low: "稳健增长", medium: "加速增长", high: "爆发增长" }[track.growthPotential]

  return (
    <div
      className={cn(
        "rounded-2xl border transition-all duration-300",
        expanded
          ? "border-amber-300/60 bg-white shadow-md dark:border-amber-500/30 dark:bg-card"
          : "border-slate-200/60 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20",
      )}
    >
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-4 p-5 text-left">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold", rank === 1 ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500 dark:bg-white/10")}>
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-semibold text-slate-800 dark:text-slate-100">{track.name}</h3>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold", scoreColor)}>
              {track.matchScore}% 匹配
            </span>
          </div>
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{track.tagline}</p>
        </div>
        <ChevronRight className={cn("h-5 w-5 shrink-0 text-slate-300 transition-transform duration-200", expanded && "rotate-90")} />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 dark:border-white/10">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-amber-50/50 p-4 dark:bg-amber-500/5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">为什么推荐</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{track.why}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">目标人群</p>
              <p className="mt-1 text-[13px] leading-relaxed text-slate-600 dark:text-slate-400">{track.audience}</p>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">内容支柱</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {track.contentPillars.map((p) => (
                  <span key={p} className="rounded-full border border-slate-200/60 bg-white px-2.5 py-0.5 text-[11px] text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">{p}</span>
                ))}
              </div>
            </div>
            <div className="rounded-xl bg-slate-50 p-4 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">推荐平台</p>
                  <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">{track.platforms.join(" · ")}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">变现路径</p>
                  <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-400">{track.monetization}</p>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 px-2.5 py-1 text-[11px] text-slate-500 dark:border-white/10">
              <BarChart3 className="h-3 w-3" />难度：{difficultyLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-slate-200/60 px-2.5 py-1 text-[11px] text-slate-500 dark:border-white/10">
              <Zap className="h-3 w-3" />增长：{growthLabel}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function AccountPositioning() {
  const [stage, setStage] = React.useState<StageId | null>(null)

  // Form state
  const [industry, setIndustry] = React.useState("")
  const [background, setBackground] = React.useState("")
  const [skills, setSkills] = React.useState("")
  const [extraInfo, setExtraInfo] = React.useState("")
  const [files, setFiles] = React.useState<UploadedFile[]>([])

  // Analysis state
  const [analyzing, setAnalyzing] = React.useState(false)
  const [tracks, setTracks] = React.useState<TrackRecommendation[] | null>(null)
  const [expandedTrack, setExpandedTrack] = React.useState<string | null>(null)

  const fileInputRef = React.useRef<HTMLInputElement>(null)

  const canSubmit = industry.trim() && background.trim() && skills.trim()

  const handleFileUpload = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    const valid: UploadedFile[] = []

    for (const file of selected) {
      if (file.size > MAX_FILE_SIZE) continue
      try {
        const base64 = await fileToBase64(file)
        valid.push({ name: file.name, size: file.size, type: file.type, base64 })
      } catch {
        // skip unreadable files
      }
    }

    setFiles((prev) => {
      const merged = [...prev, ...valid]
      return merged.slice(0, MAX_FILES)
    })

    // Reset input so the same file can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const removeFile = React.useCallback((name: string) => {
    setFiles((prev) => prev.filter((f) => f.name !== name))
  }, [])

  const handleAnalyze = React.useCallback(async () => {
    if (!canSubmit) return
    setAnalyzing(true)
    setTracks(null)

    try {
      const res = await fetch("/api/ai/ip-positioning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: stage ? STAGES.find((s) => s.id === stage)?.title ?? null : null,
          stageHint: stage ? STAGE_HINTS[stage] : "",
          industry: industry.trim(),
          background: background.trim(),
          skills: skills.trim(),
          extraInfo: extraInfo.trim(),
          files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : "分析失败")
      }

      // Map API response to TrackRecommendation
      const mapped: TrackRecommendation[] = (Array.isArray(data.tracks) ? data.tracks : [])
        .filter((t: unknown) => t && typeof t === "object")
        .map((t: Record<string, unknown>) => ({
          id: (typeof t.name === "string" ? t.name : "unknown").replace(/\s+/g, "-").toLowerCase(),
          name: typeof t.name === "string" ? t.name : "",
          matchScore: typeof t.matchScore === "number" ? t.matchScore : 0,
          tagline: typeof t.tagline === "string" ? t.tagline : "",
          why: typeof t.why === "string" ? t.why : "",
          contentPillars: Array.isArray(t.contentPillars) ? t.contentPillars.filter((p): p is string => typeof p === "string") : [],
          audience: typeof t.audience === "string" ? t.audience : "",
          platforms: Array.isArray(t.platforms) ? t.platforms.filter((p): p is string => typeof p === "string") : [],
          monetization: typeof t.monetization === "string" ? t.monetization : "",
          difficulty: (typeof t.difficulty === "string" && ["low", "medium", "high"].includes(t.difficulty)) ? t.difficulty as "low" | "medium" | "high" : "medium",
          growthPotential: (typeof t.growthPotential === "string" && ["low", "medium", "high"].includes(t.growthPotential)) ? t.growthPotential as "low" | "medium" | "high" : "medium",
        }))

      setTracks(mapped)
      setExpandedTrack(mapped[0]?.id ?? null)

      // Log cost info from API metadata
      if (data._meta) {
        console.log(
          `[IP Positioning] Model: ${data._meta.model} | ` +
          `${data._meta.durationMs}ms | ` +
          `~${data._meta.estimatedPromptTokens}+${data._meta.estimatedCompletionTokens} tokens | ` +
          `$${data._meta.estimatedCostUSD}`,
        )
      }
    } catch (e) {
      console.error("[IP Positioning] Error:", e)
    } finally {
      setAnalyzing(false)
    }
  }, [canSubmit, stage, industry, background, skills, extraInfo, files])

  const selectedStage = stage ? STAGES.find((s) => s.id === stage) ?? null : null

  return (
    <div className="h-full overflow-y-auto bg-[#fafaf8] dark:bg-slate-950">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">

        {/* ================================================================ */}
        {/*  Hero                                                             */}
        {/* ================================================================ */}
        <header className="mb-10">
          <div className="mb-4 h-1 w-12 rounded-full bg-amber-500/60" />
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[34px] dark:text-slate-50">
            发现你的
            <span className="text-amber-600 dark:text-amber-400"> IP 定位</span>
          </h1>
          <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
            只需 3 步：选择阶段 → 填写背景 → AI 推荐最适合你的短视频赛道
          </p>
        </header>

        {/* ================================================================ */}
        {/*  Step 1 — Stage                                                  */}
        {/* ================================================================ */}
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">1</span>
            <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">你现在处于哪个阶段？</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {STAGES.map((s) => (
              <StageCard key={s.id} stage={s} selected={stage === s.id} onSelect={() => setStage(s.id)} />
            ))}
          </div>
          {selectedStage && (
            <p className="mt-3 rounded-xl border border-amber-200/60 bg-amber-50/50 px-4 py-2.5 text-[13px] text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/5 dark:text-amber-300">
              <Lightbulb className="mr-1.5 inline-block h-3.5 w-3.5" />
              {STAGE_HINTS[stage!]}
            </p>
          )}
        </section>

        {/* ================================================================ */}
        {/*  Step 2 — Structured Form                                        */}
        {/* ================================================================ */}
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700 dark:bg-amber-500/20 dark:text-amber-400">2</span>
            <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">填写你的信息</h2>
            <span className="text-[11px] text-slate-400">
              <span className="text-rose-500">*</span> 为必填项
            </span>
          </div>

          <div className="space-y-5 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-6">
            {/* --- Required fields --- */}

            {/* Industry */}
            <FormField label="行业 / 赛道" required icon={Briefcase}>
              <input
                type="text"
                className="w-full rounded-xl border border-slate-200/60 bg-white px-4 py-2.5 text-[14px] text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/15 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:placeholder:text-slate-500"
                placeholder="例如：互联网运营、教育培训、医美健康、餐饮连锁…"
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </FormField>

            {/* Background */}
            <FormField label="核心背景" required icon={User}>
              <textarea
                className="w-full resize-none rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-[14px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/15 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:placeholder:text-slate-500"
                rows={3}
                placeholder="你的工作经历、创业经历、学历、人脉等核心背景…&#10;例如：5年互联网运营总监，带过20人团队，从0到1做过3个百万用户项目。"
                value={background}
                onChange={(e) => setBackground(e.target.value)}
              />
            </FormField>

            {/* Skills */}
            <FormField label="已有技能 / 资源" required icon={Zap}>
              <textarea
                className="w-full resize-none rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-[14px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/15 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:placeholder:text-slate-500"
                rows={2}
                placeholder="你擅长什么？有什么资源？&#10;例如：数据分析、公开演讲、摄影剪辑、行业人脉、供应链资源…"
                value={skills}
                onChange={(e) => setSkills(e.target.value)}
              />
            </FormField>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-100 dark:bg-white/5" />
              <span className="text-[11px] text-slate-400">以下为选填信息</span>
              <div className="h-px flex-1 bg-slate-100 dark:bg-white/5" />
            </div>

            {/* --- Optional fields --- */}

            <FormField label="补充说明" icon={MessageSquare}>
              <textarea
                className="w-full resize-none rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-[14px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/15 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:placeholder:text-slate-500"
                rows={2}
                placeholder="目标平台、变现预期、已有粉丝基础、内容产出频率…"
                value={extraInfo}
                onChange={(e) => setExtraInfo(e.target.value)}
              />
            </FormField>

            {/* File Upload */}
            <div>
              <div className="mb-1.5 flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5 text-slate-400" />
                <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                  上传资料
                  <span className="ml-1 text-[11px] font-normal text-slate-400">选填</span>
                </label>
                <span className="text-[11px] text-slate-400">
                  · 支持 PPT、Word、Excel、PDF、TXT · 单文件 ≤ 20MB · 最多 {MAX_FILES} 个
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Upload button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={files.length >= MAX_FILES}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-[13px] font-medium text-slate-500 transition-colors hover:border-amber-400 hover:text-amber-600 disabled:pointer-events-none disabled:opacity-40 dark:border-white/10 dark:text-slate-400 dark:hover:border-amber-500/40 dark:hover:text-amber-400"
                >
                  <Upload className="h-4 w-4" />
                  选择文件
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_FILES}
                  multiple
                  className="hidden"
                  onChange={(e) => { void handleFileUpload(e) }}
                />

                {/* File chips */}
                {files.map((f) => (
                  <FileChip key={f.name} file={f} onRemove={() => removeFile(f.name)} />
                ))}

                {files.length === 0 && (
                  <span className="text-[12px] text-slate-400">
                    可上传简历、作品集、已有账号截图等参考资料
                  </span>
                )}
              </div>
            </div>

            {/* Submit */}
            <div className="flex items-center justify-between border-t border-slate-100 pt-5 dark:border-white/5">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIndustry("互联网运营")
                    setBackground("5年互联网运营总监，带过20人团队，从0到1做过3个百万用户级项目，擅长用户增长和数据分析")
                    setSkills("数据分析、用户增长策略、团队管理、公开演讲")
                    setExtraInfo("目标平台：抖音和小红书，希望做知识付费方向")
                    toast({ title: "已填充示例数据" })
                  }}
                  className="rounded-lg border border-slate-200/60 px-3 py-1.5 text-[12px] text-slate-500 transition-colors hover:border-amber-300 hover:text-amber-600 dark:border-white/10 dark:hover:border-amber-500/30"
                >
                  ✨ 试试示例
                </button>
                {!canSubmit ? (
                  <p className="text-[12px] text-slate-400">
                    请填写所有必填项（<span className="text-rose-500">*</span>）后开始分析
                  </p>
                ) : (
                  <p className="flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
                    <Check className="h-3.5 w-3.5" />
                    信息已完善，可以开始分析
                  </p>
                )}
              </div>
              <Button
                onClick={handleAnalyze}
                disabled={!canSubmit || analyzing}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-6 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-all duration-200 hover:bg-amber-600 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
              >
                {analyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    分析中…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    开始分析
                  </>
                )}
              </Button>
            </div>
          </div>
        </section>

        {/* ================================================================ */}
        {/*  Step 3 — Results                                                */}
        {/* ================================================================ */}
        {analyzing && (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <div className="relative">
              <div className="h-16 w-16 rounded-full border-4 border-amber-200 border-t-amber-500 animate-spin" />
              <Target className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-amber-500" />
            </div>
            <p className="text-[14px] text-slate-500">AI 正在分析你的最佳赛道…</p>
          </div>
        )}

        {tracks && !analyzing && (
          <section className="space-y-4">
            <div className="mb-1 flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400">3</span>
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">推荐赛道</h2>
              <span className="text-[12px] text-slate-400">· 共 {tracks.length} 个方向</span>
            </div>

            {tracks.map((track, i) => (
              <TrackCard
                key={track.id}
                track={track}
                rank={i + 1}
                expanded={expandedTrack === track.id}
                onToggle={() => setExpandedTrack(expandedTrack === track.id ? null : track.id)}
              />
            ))}

            <div className="flex items-center justify-between rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-5 py-4 dark:border-white/10 dark:bg-white/5">
              <div>
                <p className="text-[14px] font-medium text-slate-700 dark:text-slate-300">没有找到完全匹配的赛道？</p>
                <p className="text-[12px] text-slate-400">修改补充信息后重新分析，或联系 IP 顾问进行 1v1 诊断。</p>
              </div>
              <button
                type="button"
                onClick={() => { setTracks(null); setExpandedTrack(null) }}
                className="shrink-0 rounded-xl border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
              >
                重新分析
              </button>
            </div>
          </section>
        )}

        {/* Empty state */}
        {!tracks && !analyzing && (
          <div className="mt-4 flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 py-16 dark:border-white/10">
            <Target className="h-12 w-12 text-slate-300 dark:text-slate-600" />
            <p className="mt-4 text-[14px] text-slate-400 dark:text-slate-500">
              选择阶段并填写信息，AI 将为你推荐最佳赛道
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

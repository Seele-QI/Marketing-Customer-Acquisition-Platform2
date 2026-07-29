"use client"

import {
  ArrowRight,
  Bot,
  Brush,
  CheckCircle2,
  Clapperboard,
  Clock3,
  Crosshair,
  Globe2,
  Play,
  Sparkles,
  Target,
} from "lucide-react"

import { TopBanner } from "@/components/top-banner"
import { ModuleTutorialButton } from "@/components/tutorial/module-tutorial-button"
import { useBusinessAssistant } from "@/lib/business-assistant/context"
import { GEO_VIEWS } from "@/lib/geo/workspace"
import { DEFAULT_VIDEO_VIEW } from "@/lib/video/workspace"
import { cn } from "@/lib/utils"

export type OpenAgentMeta = { avatarUrl?: string; role?: string }

type Props = {
  onOpenAgent?: (agentName: string, meta?: OpenAgentMeta) => void
  onNavigate?: (view: string) => void
}

const directions = [
  {
    id: "video",
    title: "视频创作",
    eyebrow: "VIDEO STUDIO",
    description: "从选题脚本、素材准备到生成质检，完整推进一条可发布视频。",
    action: "开始视频创作",
    view: DEFAULT_VIDEO_VIEW,
    icon: Clapperboard,
    accent: "from-blue-600 to-indigo-600",
    surface: "from-blue-50 to-indigo-50/70",
    assistant: true,
  },
  {
    id: "geo",
    title: "GEO 创作",
    eyebrow: "GEO GROWTH",
    description: "沉淀企业知识、规划内容矩阵，创作更容易被 AI 引用的内容。",
    action: "进入 GEO 工作流",
    view: GEO_VIEWS.KNOWLEDGE_BASE,
    icon: Globe2,
    accent: "from-cyan-600 to-blue-600",
    surface: "from-cyan-50 to-sky-50/70",
    assistant: true,
  },
  {
    id: "poster",
    title: "图片工作台",
    eyebrow: "IMAGE STUDIO",
    description: "创作营销海报与通用图片，支持多图参考、专业画布和横竖构图。",
    action: "开始创作",
    view: "图片工作台",
    icon: Brush,
    accent: "from-violet-600 to-fuchsia-600",
    surface: "from-violet-50 to-fuchsia-50/70",
    assistant: false,
  },
  {
    id: "positioning",
    title: "身份定位",
    eyebrow: "BRAND PROFILE",
    description: "统一品牌、受众和表达档案，供视频与 GEO 助理共同复用。",
    action: "完善基础档案",
    view: "身份定位",
    icon: Target,
    accent: "from-rose-500 to-orange-500",
    surface: "from-rose-50 to-orange-50/70",
    assistant: false,
  },
  {
    id: "douyin",
    title: "抖音截流",
    eyebrow: "LEAD CAPTURE",
    description: "线索发现、复核、触达与跟进流程正在建设中。",
    action: "能力预留",
    view: "",
    icon: Crosshair,
    accent: "from-slate-500 to-slate-700",
    surface: "from-slate-50 to-slate-100/70",
    assistant: false,
    reserved: true,
  },
] as const

export function DashboardView({ onNavigate }: Props) {
  const assistant = useBusinessAssistant()
  const recent = [...assistant.projects]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 4)
  const current = recent.find((project) => project.status === "active")

  const openAssistant = (kind: "video" | "geo") => {
    onNavigate?.(
      kind === "video" ? DEFAULT_VIDEO_VIEW : GEO_VIEWS.KNOWLEDGE_BASE,
    )
    assistant.setOpen(true)
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top_left,rgba(219,234,254,.65),transparent_34%),linear-gradient(135deg,#f8fafc_0%,#fff_48%,#f1f5f9_100%)] px-4 py-5 sm:px-6 sm:py-6 dark:bg-slate-950">
      <div className="mx-auto max-w-[1440px]">
        <div className="mb-3 flex justify-end">
          <ModuleTutorialButton view="工作台" />
        </div>

        {/* 用户确认保留的顶部营销与北京时间板块 */}
        <TopBanner />

        <section className="mt-5 overflow-hidden rounded-3xl border border-white/80 bg-white/90 p-5 shadow-[0_18px_55px_rgba(15,23,42,.07)] backdrop-blur sm:p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-blue-600">
                TODAY&apos;S START
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
                {current ? `继续「${current.title}」` : "选择方向，助理在页面内带你操作"}
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
                {current
                  ? `当前推进到「${current.currentStage}」。助理会保留计划、对话和业务记忆，换页后仍能接着做。`
                  : "进入视频或 GEO 页面后，悬浮助理会识别当前界面，告诉你准备什么、点击哪里以及怎样算完成。"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {current ? (
                <>
                  <button
                    type="button"
                    onClick={() =>
                      onNavigate?.(
                        current.kind === "video"
                          ? DEFAULT_VIDEO_VIEW
                          : GEO_VIEWS.KNOWLEDGE_BASE,
                      )
                    }
                    className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    <Play className="h-4 w-4" />
                    继续创作
                  </button>
                  <button
                    type="button"
                    onClick={() => openAssistant(current.kind)}
                    className="inline-flex items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <Bot className="h-4 w-4" />
                    打开操作指南
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openAssistant("video")}
                    className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    视频创作指南
                  </button>
                  <button
                    type="button"
                    onClick={() => openAssistant("geo")}
                    className="rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-semibold hover:border-blue-300 hover:text-blue-700"
                  >
                    GEO 创作指南
                  </button>
                </>
              )}
            </div>
          </div>
        </section>

        <section className="mt-8">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[.2em] text-slate-400">
                CREATION DIRECTIONS
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                选择今天要推进的业务
              </h2>
            </div>
            <p className="hidden text-sm text-slate-400 md:block">
              大方向入口，不再堆叠零散小工具
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
            {directions.map((direction, index) => {
              const Icon = direction.icon
              const wide = index < 2
              return (
                <article
                  key={direction.id}
                  className={cn(
                    "group relative overflow-hidden rounded-3xl border border-white bg-gradient-to-br p-5 shadow-[0_14px_40px_rgba(15,23,42,.07)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_20px_55px_rgba(37,99,235,.13)]",
                    direction.surface,
                    wide ? "xl:col-span-3" : "xl:col-span-2",
                    "reserved" in direction && direction.reserved && "opacity-75",
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <span
                      className={cn(
                        "flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg",
                        direction.accent,
                      )}
                    >
                      <Icon className="h-5 w-5" />
                    </span>
                    {direction.assistant && (
                      <span className="rounded-full border border-blue-200 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                        专属助理
                      </span>
                    )}
                    {"reserved" in direction && direction.reserved && (
                      <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-500">
                        即将开放
                      </span>
                    )}
                  </div>
                  <p className="mt-6 text-[10px] font-bold tracking-[.22em] text-slate-400">
                    {direction.eyebrow}
                  </p>
                  <h3 className="mt-1 text-xl font-semibold text-slate-950">
                    {direction.title}
                  </h3>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-slate-500">
                    {direction.description}
                  </p>
                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={"reserved" in direction && direction.reserved}
                      onClick={() => direction.view && onNavigate?.(direction.view)}
                      className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 transition group-hover:text-blue-700 disabled:cursor-not-allowed disabled:text-slate-400"
                    >
                      {direction.action}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                    {direction.assistant && (
                      <button
                        type="button"
                        onClick={() =>
                          openAssistant(direction.id as "video" | "geo")
                        }
                        className="ml-auto rounded-full bg-white/85 px-3 py-1.5 text-xs font-medium text-blue-700 shadow-sm hover:bg-white"
                      >
                        打开操作指南
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        </section>

        <section className="mt-8 pb-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-950">最近项目</h2>
            <span className="text-xs text-slate-400">项目级持续跟进</span>
          </div>
          {recent.length ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {recent.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  onClick={() => void assistant.openProject(project.id)}
                  className="rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md"
                >
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-[10px] font-semibold uppercase text-blue-700">
                      {project.kind === "video" ? "视频" : "GEO"}
                    </span>
                    <Clock3 className="h-4 w-4 text-slate-300" />
                  </div>
                  <h3 className="mt-3 truncate text-sm font-semibold text-slate-900">
                    {project.title}
                  </h3>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {project.currentStage}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-5 py-6 text-sm text-slate-500">
              <CheckCircle2 className="h-5 w-5 text-slate-300" />
              暂无项目。可从上方视频创作或 GEO 创作开始。
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

"use client"

import * as React from "react"
import { useLoginRequired } from "@/components/auth/login-required-provider"
import {
  Brain,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Cloud,
  LayoutGrid,
  Loader2,
  Wand2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import {
  MATRIX_DAYS,
  MATRIX_PLATFORMS,
  normalizeMatrixPlatformSelection,
  viralSkillIdsForPlatforms,
} from "@/lib/geo/matrix-platforms"
import { showSwitchNotice } from "@/hooks/use-geo-switch-flash"
import {
  getDefaultMatrixModelWeightSkill,
  listEnterpriseSkills,
  listModelWeightSkills,
  type GeoSkillEntry,
} from "@/lib/geo/skills-registry"

type Props = {
  selectedPlatforms: string[]
  onPlatformsChange: (ids: string[]) => void
  modelSkillId: string | null
  onModelChange: (id: string | null) => void
  viralSkillIds: string[]
  onViralChange: (ids: string[]) => void
  enterpriseSkillId: string | null
  onEnterpriseChange: (id: string | null) => void
  onGenerate: () => void
  generating?: boolean
  disabled?: boolean
}

export function GeoMatrixConfigPanel({
  selectedPlatforms,
  onPlatformsChange,
  modelSkillId,
  onModelChange,
  viralSkillIds,
  onViralChange,
  enterpriseSkillId,
  onEnterpriseChange,
  onGenerate,
  generating,
  disabled,
}: Props) {
  const { me } = useLoginRequired()
  const accountScope = me ? `user-${me.user.id}` : null
  const modelSkills = React.useMemo(() => listModelWeightSkills(), [])
  const [enterpriseSkills, setEnterpriseSkills] = React.useState<GeoSkillEntry[]>([])
  const [modelOpen, setModelOpen] = React.useState(false)
  const [platformOpen, setPlatformOpen] = React.useState(false)
  const [entOpen, setEntOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)
  const normalizedPlatforms = React.useMemo(
    () => normalizeMatrixPlatformSelection(selectedPlatforms),
    [selectedPlatforms],
  )

  React.useEffect(() => {
    const refresh = () => setEnterpriseSkills(accountScope ? listEnterpriseSkills(accountScope) : [])
    refresh()
    window.addEventListener("geo-enterprise-skills-changed", refresh)
    return () => window.removeEventListener("geo-enterprise-skills-changed", refresh)
  }, [accountScope])

  React.useEffect(() => {
    if (modelSkillId !== null) return
    const defaultSkill = getDefaultMatrixModelWeightSkill()
    if (defaultSkill) onModelChange(defaultSkill.id)
  }, [modelSkillId, onModelChange])

  React.useEffect(() => {
    if (
      normalizedPlatforms.length !== selectedPlatforms.length ||
      normalizedPlatforms.some((id, index) => id !== selectedPlatforms[index])
    ) {
      onPlatformsChange(normalizedPlatforms)
    }
  }, [normalizedPlatforms, onPlatformsChange, selectedPlatforms])

  React.useEffect(() => {
    const mappedIds = viralSkillIdsForPlatforms(normalizedPlatforms)
    if (
      mappedIds.length !== viralSkillIds.length ||
      mappedIds.some((id, index) => id !== viralSkillIds[index])
    ) {
      onViralChange(mappedIds)
    }
  }, [normalizedPlatforms, onViralChange, viralSkillIds])

  React.useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setModelOpen(false)
        setPlatformOpen(false)
        setEntOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  const togglePlatform = (id: string) => {
    let next: string[]
    if (normalizedPlatforms.includes(id)) {
      if (normalizedPlatforms.length <= 1) return
      next = normalizedPlatforms.filter((item) => item !== id)
    } else {
      next = [...normalizedPlatforms, id]
    }
    onPlatformsChange(next)
    onViralChange(viralSkillIdsForPlatforms(next))
  }

  const selectedModel = modelSkills.find((skill) => skill.id === modelSkillId)
  const selectedEnterprise = enterpriseSkills.find(
    (skill) => skill.id === enterpriseSkillId,
  )
  const expectedTopics = normalizedPlatforms.length * MATRIX_DAYS
  const strategySummary = [
    selectedModel ? "目标模型优化" : null,
    viralSkillIds.length > 0 ? `平台 Skill ${viralSkillIds.length} 项` : null,
    selectedEnterprise ? "企业知识库" : null,
  ].filter(Boolean)

  const closeOtherMenus = (keep: "model" | "platform" | "enterprise") => {
    if (keep !== "model") setModelOpen(false)
    if (keep !== "platform") setPlatformOpen(false)
    if (keep !== "enterprise") setEntOpen(false)
  }

  const handleModelChange = (id: string) => {
    if (id !== modelSkillId) {
      const label = modelSkills.find((skill) => skill.id === id)?.label ?? id
      showSwitchNotice("modelSkill", label)
    }
    onModelChange(id)
    setModelOpen(false)
  }

  const handleEnterpriseChange = (id: string | null) => {
    if (id !== enterpriseSkillId) {
      if (id) {
        const skill = enterpriseSkills.find((item) => item.id === id)
        showSwitchNotice("enterprise", skill?.label ?? id)
      } else {
        showSwitchNotice("enterprise", "")
      }
    }
    onEnterpriseChange(id)
    setEntOpen(false)
  }

  const controlClass = cn(
    "flex min-h-14 w-full items-center gap-3 rounded-xl border border-slate-200/90 bg-white px-3 py-2.5 text-left",
    "transition-colors hover:border-slate-300 hover:bg-slate-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30",
    "disabled:cursor-not-allowed disabled:opacity-60 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.06]",
  )

  return (
    <div
      ref={containerRef}
      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm shadow-slate-200/30 dark:border-white/10 dark:bg-white/[0.03] dark:shadow-none sm:p-5"
      data-tutorial-id="geo-matrix-config"
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
            规划配置
          </h3>
          <p className="mt-1 text-[11px] text-slate-400">
            选择发布平台和内容策略，系统自动完成两周规划
          </p>
        </div>
        <div
          className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/80 bg-cyan-50/70 px-2.5 py-1 text-[10px] font-medium text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300"
          aria-label="模型由云端自动调度"
        >
          <Cloud className="h-3.5 w-3.5" aria-hidden />
          云端智能调度
        </div>
      </div>

      <section aria-labelledby="matrix-strategy-heading">
        <p
          id="matrix-strategy-heading"
          className="mb-2.5 text-[11px] font-medium text-slate-500"
        >
          内容策略（按需选择）
        </p>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <div className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={modelOpen}
              disabled={disabled || generating}
              onClick={() => {
                setModelOpen((open) => !open)
                closeOtherMenus("model")
              }}
              className={controlClass}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300">
                <Brain className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] text-slate-400">目标优化模型</span>
                <span className="mt-0.5 block truncate text-[12px] font-medium text-slate-700 dark:text-slate-200">
                  {selectedModel?.label ?? "使用默认推荐策略"}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            </button>
            {modelOpen && (
              <ul
                aria-label="目标优化模型列表"
                className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900"
              >
                {modelSkills.map((skill) => (
                  <li key={skill.id}>
                    <button
                      type="button"
                      aria-pressed={modelSkillId === skill.id}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-violet-50 dark:hover:bg-violet-500/10"
                      onClick={() => handleModelChange(skill.id)}
                    >
                      <span className="truncate">{skill.label}</span>
                      {modelSkillId === skill.id && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={platformOpen}
              disabled={disabled || generating}
              onClick={() => {
                setPlatformOpen((open) => !open)
                closeOtherMenus("platform")
              }}
              className={controlClass}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300">
                <LayoutGrid className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] text-slate-400">发布平台（多选）</span>
                <span className="mt-0.5 block truncate text-[12px] font-medium text-slate-700 dark:text-slate-200">
                  已选择 {normalizedPlatforms.length} 个平台
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            </button>
            {platformOpen && (
              <ul
                aria-label="发布平台列表"
                className="absolute left-0 right-0 z-30 mt-1.5 max-h-72 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900"
              >
                {MATRIX_PLATFORMS.map((platform) => {
                  const checked = normalizedPlatforms.includes(platform.id)
                  return (
                    <li key={platform.id}>
                      <button
                        type="button"
                        aria-pressed={checked}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-cyan-50 dark:hover:bg-cyan-500/10"
                        onClick={() => togglePlatform(platform.id)}
                      >
                        <span className="truncate">{platform.label}</span>
                        {checked && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-cyan-600" />
                        )}
                      </button>
                    </li>
                  )
                })}
                <li className="border-t border-slate-100 px-3 py-2 text-[10px] text-slate-400 dark:border-white/10">
                  已自动加载所选平台对应的知识库 Skill
                </li>
              </ul>
            )}
          </div>

          <div className="relative md:col-span-2 xl:col-span-1">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={entOpen}
              disabled={disabled || generating}
              onClick={() => {
                setEntOpen((open) => !open)
                closeOtherMenus("enterprise")
              }}
              className={controlClass}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300">
                <Building2 className="h-4 w-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[10px] text-slate-400">企业知识库</span>
                <span className="mt-0.5 block truncate text-[12px] font-medium text-slate-700 dark:text-slate-200">
                  {selectedEnterprise?.label ?? "暂不引用"}
                </span>
              </span>
              <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
            </button>
            {entOpen && (
              <ul
                aria-label="企业知识库列表"
                className="absolute left-0 right-0 z-30 mt-1.5 max-h-64 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900"
              >
                <li>
                  <button
                    type="button"
                    aria-pressed={enterpriseSkillId === null}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5"
                    onClick={() => handleEnterpriseChange(null)}
                  >
                    暂不引用企业知识库
                    {enterpriseSkillId === null && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    )}
                  </button>
                </li>
                {enterpriseSkills.map((skill) => (
                  <li key={skill.id}>
                    <button
                      type="button"
                      aria-pressed={enterpriseSkillId === skill.id}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                      onClick={() => handleEnterpriseChange(skill.id)}
                    >
                      <span className="truncate">{skill.label}</span>
                      {enterpriseSkillId === skill.id && (
                        <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      <div
        className="mt-4 flex flex-col gap-3 rounded-xl border border-cyan-100 bg-cyan-50/55 p-3.5 dark:border-cyan-500/20 dark:bg-cyan-500/[0.08] sm:flex-row sm:items-center"
        aria-live="polite"
      >
        <CheckCircle2 className="h-5 w-5 shrink-0 text-cyan-600" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">
            准备生成 {normalizedPlatforms.length} 个平台的两周内容矩阵
          </p>
          <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
            预计 {expectedTopics} 条内容主题
            {strategySummary.length > 0 ? `，已启用${strategySummary.join("、")}` : ""}
          </p>
        </div>
      </div>

      <button
        type="button"
        data-tutorial-id="geo-matrix-generate"
        disabled={disabled || generating || normalizedPlatforms.length < 1}
        onClick={onGenerate}
        className={cn(
          "mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-[13px] font-medium text-white",
          "hover:bg-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className="h-4 w-4" />
        )}
        {generating ? "正在生成完整矩阵…" : "生成两周矩阵"}
      </button>
      <p className="mt-2 text-center text-[10px] text-slate-400">
        生成后可按平台查看，并逐条调整内容方向
      </p>
    </div>
  )
}

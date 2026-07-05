"use client"

import * as React from "react"
import { Brain, Building2, Check, ChevronDown, Layers, Loader2, Wand2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { GeoLlmProviderSelect } from "@/components/geo/geo-llm-provider-select"
import { MATRIX_PLATFORMS } from "@/lib/geo/matrix-platforms"
import type { LlmProviderId } from "@/lib/geo/llm/router"
import { showSwitchNotice } from "@/hooks/use-geo-switch-flash"
import {
  getDefaultModelWeightSkill,
  listEnterpriseSkills,
  listModelWeightSkills,
  listPlatformViralSkills,
  type GeoSkillEntry,
} from "@/lib/geo/skills-registry"

type Props = {
  selectedPlatforms: string[]
  onPlatformsChange: (ids: string[]) => void
  provider: LlmProviderId
  onProviderChange: (id: LlmProviderId) => void
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
  provider,
  onProviderChange,
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
  const modelSkills = React.useMemo(() => listModelWeightSkills(), [])
  const viralSkills = React.useMemo(() => listPlatformViralSkills(), [])
  const [enterpriseSkills, setEnterpriseSkills] = React.useState<GeoSkillEntry[]>([])
  const [modelOpen, setModelOpen] = React.useState(false)
  const [viralOpen, setViralOpen] = React.useState(false)
  const [entOpen, setEntOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const refresh = () => setEnterpriseSkills(listEnterpriseSkills())
    refresh()
    window.addEventListener("geo-enterprise-skills-changed", refresh)
    return () => window.removeEventListener("geo-enterprise-skills-changed", refresh)
  }, [])

  React.useEffect(() => {
    if (modelSkillId !== null) return
    const def = getDefaultModelWeightSkill()
    if (def) onModelChange(def.id)
  }, [modelSkillId, onModelChange])

  React.useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setModelOpen(false)
        setViralOpen(false)
        setEntOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  const togglePlatform = (id: string) => {
    if (selectedPlatforms.includes(id)) {
      if (selectedPlatforms.length <= 1) return
      onPlatformsChange(selectedPlatforms.filter((x) => x !== id))
    } else {
      onPlatformsChange([...selectedPlatforms, id])
    }
  }

  const toggleViral = (id: string) => {
    const next = viralSkillIds.includes(id)
      ? viralSkillIds.filter((x) => x !== id)
      : [...viralSkillIds, id]
    onViralChange(next)
  }

  const selectedModel = modelSkills.find((s) => s.id === modelSkillId)
  const selectedEnt = enterpriseSkills.find((s) => s.id === enterpriseSkillId)

  const handleProviderChange = (id: LlmProviderId) => {
    // 切换反馈由 GeoLlmProviderSelect 统一触发
    onProviderChange(id)
  }

  const handleModelChange = (id: string | null) => {
    if (id !== modelSkillId && id) {
      const label = modelSkills.find((s) => s.id === id)?.label ?? id
      showSwitchNotice("modelSkill", label)
    }
    onModelChange(id)
  }

  const handleEnterpriseChange = (id: string | null) => {
    if (id !== enterpriseSkillId) {
      if (id) {
        const ent = enterpriseSkills.find((s) => s.id === id)
        showSwitchNotice("enterprise", ent?.label ?? id)
      } else {
        showSwitchNotice("enterprise", "")
      }
    }
    onEnterpriseChange(id)
  }

  return (
    <div
      ref={containerRef}
      className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"
    >
      <h3 className="mb-3 text-[14px] font-semibold text-slate-800 dark:text-slate-200">规划配置</h3>

      <div className="mb-4">
        <p className="mb-2 text-[11px] font-medium text-slate-500">发布平台（多选）</p>
        <div className="flex flex-wrap gap-2">
          {MATRIX_PLATFORMS.map((p) => {
            const checked = selectedPlatforms.includes(p.id)
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled || generating}
                onClick={() => togglePlatform(p.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors",
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

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <GeoLlmProviderSelect
          value={provider}
          onChange={handleProviderChange}
          disabled={disabled || generating}
          showLabel
        />

        <div className="relative">
          <p className="mb-1.5 text-[11px] font-medium text-slate-500">A 大模型策略</p>
          <button
            type="button"
            disabled={disabled || generating}
            onClick={() => {
              setModelOpen((o) => !o)
              setViralOpen(false)
              setEntOpen(false)
            }}
            className="inline-flex min-w-[140px] items-center gap-1.5 rounded-lg border border-slate-200/80 px-3 py-2 text-[12px] dark:border-white/10"
          >
            <Brain className="h-3.5 w-3.5 text-violet-500" />
            <span className="truncate">{selectedModel?.label ?? "选择策略"}</span>
            <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-60" />
          </button>
          {modelOpen && (
            <ul className="absolute left-0 z-30 mt-1 w-56 rounded-xl border bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
              {modelSkills.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-[12px] hover:bg-violet-50 dark:hover:bg-violet-500/10"
                    onClick={() => {
                      handleModelChange(s.id)
                      setModelOpen(false)
                    }}
                  >
                    {s.label}
                    {modelSkillId === s.id && <Check className="h-3.5 w-3.5 text-violet-600" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative">
          <p className="mb-1.5 text-[11px] font-medium text-slate-500">B 平台爆款</p>
          <button
            type="button"
            disabled={disabled || generating}
            onClick={() => {
              setViralOpen((o) => !o)
              setModelOpen(false)
              setEntOpen(false)
            }}
            className="inline-flex min-w-[140px] items-center gap-1.5 rounded-lg border border-slate-200/80 px-3 py-2 text-[12px] dark:border-white/10"
          >
            <Layers className="h-3.5 w-3.5 text-cyan-500" />
            <span className="truncate">
              {viralSkillIds.length ? `已选 ${viralSkillIds.length}` : "可选"}
            </span>
            <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-60" />
          </button>
          {viralOpen && (
            <ul className="absolute left-0 z-30 mt-1 w-56 rounded-xl border bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
              {viralSkills.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-[12px] hover:bg-cyan-50 dark:hover:bg-cyan-500/10"
                    onClick={() => toggleViral(s.id)}
                  >
                    {s.label}
                    {viralSkillIds.includes(s.id) && (
                      <Check className="h-3.5 w-3.5 text-cyan-600" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative">
          <p className="mb-1.5 text-[11px] font-medium text-slate-500">C 企业知识库</p>
          <button
            type="button"
            disabled={disabled || generating}
            onClick={() => {
              setEntOpen((o) => !o)
              setModelOpen(false)
              setViralOpen(false)
            }}
            className="inline-flex min-w-[140px] items-center gap-1.5 rounded-lg border border-slate-200/80 px-3 py-2 text-[12px] dark:border-white/10"
          >
            <Building2 className="h-3.5 w-3.5 text-emerald-500" />
            <span className="truncate">{selectedEnt?.label ?? "可选"}</span>
            <ChevronDown className="ml-auto h-3.5 w-3.5 opacity-60" />
          </button>
          {entOpen && (
            <ul className="absolute left-0 z-30 mt-1 w-56 rounded-xl border bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900">
              <li>
                <button
                  type="button"
                  className="flex w-full px-3 py-2 text-[12px] text-slate-500 hover:bg-slate-50"
                  onClick={() => {
                    handleEnterpriseChange(null)
                    setEntOpen(false)
                  }}
                >
                  不使用
                </button>
              </li>
              {enterpriseSkills.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-[12px] hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                    onClick={() => {
                      handleEnterpriseChange(s.id)
                      setEntOpen(false)
                    }}
                  >
                    <span className="truncate">{s.label}</span>
                    {enterpriseSkillId === s.id && (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <button
        type="button"
        disabled={disabled || generating || selectedPlatforms.length < 1}
        onClick={onGenerate}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-[13px] font-medium text-white",
          "hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        {generating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wand2 className="h-4 w-4" />
        )}
        {generating ? "生成中…" : "生成两周矩阵"}
      </button>
    </div>
  )
}

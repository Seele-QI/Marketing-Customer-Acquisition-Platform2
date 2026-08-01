"use client"

import * as React from "react"
import { useLoginRequired } from "@/components/auth/login-required-provider"
import { Brain, Layers, Building2, ChevronDown, Check, Info } from "lucide-react"
import { cn } from "@/lib/utils"
import { showSwitchNotice } from "@/hooks/use-geo-switch-flash"
import {
  listModelWeightSkills,
  listPlatformViralSkills,
  listEnterpriseSkills,
  getDefaultModelWeightSkill,
  getDefaultEnterpriseSkillEntry,
  type GeoSkillEntry,
} from "@/lib/geo/skills-registry"

const MODEL_STORAGE_KEY = "geo-article-model-skill"
const VIRAL_STORAGE_KEY = "geo-article-viral-skills"
const ENTERPRISE_STORAGE_KEY = "geo-article-enterprise-skill"

type Props = {
  modelSkillId: string | null
  viralSkillIds: string[]
  enterpriseSkillId: string | null
  onModelChange: (skillId: string | null) => void
  onViralChange: (skillIds: string[]) => void
  onEnterpriseChange: (skillId: string | null) => void
}

export function GeoSkillToolbar({
  modelSkillId,
  viralSkillIds,
  enterpriseSkillId,
  onModelChange,
  onViralChange,
  onEnterpriseChange,
}: Props) {
  const { me } = useLoginRequired()
  const accountScope = me ? `user-${me.user.id}` : null
  const modelSkills = React.useMemo(() => listModelWeightSkills(), [])
  const viralSkills = React.useMemo(() => listPlatformViralSkills(), [])
  const [enterpriseSkills, setEnterpriseSkills] = React.useState<GeoSkillEntry[]>([])
  const [modelOpen, setModelOpen] = React.useState(false)
  const [viralOpen, setViralOpen] = React.useState(false)
  const [enterpriseOpen, setEnterpriseOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  const refreshEnterprise = React.useCallback(() => {
    setEnterpriseSkills(accountScope ? listEnterpriseSkills(accountScope) : [])
  }, [accountScope])

  React.useEffect(() => {
    refreshEnterprise()
    const onStorage = () => refreshEnterprise()
    window.addEventListener("storage", onStorage)
    window.addEventListener("geo-enterprise-skills-changed", onStorage)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("geo-enterprise-skills-changed", onStorage)
    }
  }, [refreshEnterprise])

  React.useEffect(() => {
    if (modelSkillId !== null) return
    const stored = localStorage.getItem(MODEL_STORAGE_KEY)
    if (stored === "none") return
    if (stored && modelSkills.some((s) => s.id === stored)) {
      onModelChange(stored)
      return
    }
    const def = getDefaultModelWeightSkill()
    if (def) onModelChange(def.id)
  }, [modelSkillId, onModelChange, modelSkills])

  React.useEffect(() => {
    if (viralSkillIds.length > 0) return
    const stored = localStorage.getItem(VIRAL_STORAGE_KEY)
    if (!stored) return
    try {
      const parsed = JSON.parse(stored) as string[]
      if (Array.isArray(parsed)) {
        const valid = parsed.filter((id) => viralSkills.some((s) => s.id === id))
        if (valid.length > 0) onViralChange(valid)
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, [viralSkillIds.length, onViralChange, viralSkills])

  React.useEffect(() => {
    if (enterpriseSkillId !== null) return
    const stored = localStorage.getItem(ENTERPRISE_STORAGE_KEY)
    if (stored === "none") return
    if (stored && enterpriseSkills.some((s) => s.id === stored)) {
      onEnterpriseChange(stored)
      return
    }
    const def = accountScope ? getDefaultEnterpriseSkillEntry(accountScope) : undefined
    if (def) onEnterpriseChange(def.id)
  }, [accountScope, enterpriseSkillId, onEnterpriseChange, enterpriseSkills])

  React.useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setModelOpen(false)
        setViralOpen(false)
        setEnterpriseOpen(false)
      }
    }
    if (modelOpen || viralOpen || enterpriseOpen) {
      document.addEventListener("pointerdown", onPointerDown)
      return () => document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [modelOpen, viralOpen, enterpriseOpen])

  const selectedModel: GeoSkillEntry | undefined =
    modelSkillId === null ? undefined : modelSkills.find((s) => s.id === modelSkillId)

  const selectedEnterprise: GeoSkillEntry | undefined =
    enterpriseSkillId === null
      ? undefined
      : enterpriseSkills.find((s) => s.id === enterpriseSkillId)

  const handleModelSelect = (id: string | null) => {
    if (id !== modelSkillId) {
      if (id) {
        const label = modelSkills.find((s) => s.id === id)?.label ?? id
        showSwitchNotice("modelSkill", label)
      }
    }
    onModelChange(id)
    localStorage.setItem(MODEL_STORAGE_KEY, id ?? "none")
    setModelOpen(false)
  }

  const toggleViral = (id: string) => {
    const next = viralSkillIds.includes(id)
      ? viralSkillIds.filter((x) => x !== id)
      : [...viralSkillIds, id]
    onViralChange(next)
    localStorage.setItem(VIRAL_STORAGE_KEY, JSON.stringify(next))
  }

  const handleEnterpriseSelect = (id: string | null) => {
    if (id !== enterpriseSkillId) {
      if (id) {
        const label = enterpriseSkills.find((s) => s.id === id)?.label ?? id
        showSwitchNotice("enterprise", label)
      } else {
        showSwitchNotice("enterprise", "")
      }
    }
    onEnterpriseChange(id)
    localStorage.setItem(ENTERPRISE_STORAGE_KEY, id ?? "none")
    setEnterpriseOpen(false)
  }

  const viralLabel =
    viralSkillIds.length === 0
      ? "B 平台爆款"
      : viralSkills
          .filter((s) => viralSkillIds.includes(s.id))
          .map((s) => s.label.replace(/爆款逻辑|社区声量|内容爆款/, "").trim() || s.label)
          .join(" · ")

  const closeOthers = (which: "model" | "viral" | "enterprise") => {
    if (which !== "model") setModelOpen(false)
    if (which !== "viral") setViralOpen(false)
    if (which !== "enterprise") setEnterpriseOpen(false)
  }

  return (
    <div ref={containerRef} className="flex flex-col items-end gap-1.5 sm:flex-row sm:items-start sm:gap-2">
      {/* A 层 */}
      <div className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={modelOpen}
          aria-label="选择大模型引用策略"
          onClick={() => {
            setModelOpen((o) => !o)
            closeOthers("model")
          }}
          className={cn(
            "inline-flex max-w-[200px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40",
            selectedModel
              ? "border-violet-200/80 bg-violet-50/60 text-violet-800 dark:border-violet-500/30 dark:bg-violet-500/10 dark:text-violet-200"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
          )}
        >
          <Brain className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
          <span className="truncate">{selectedModel ? selectedModel.label : "A 大模型策略"}</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform", modelOpen && "rotate-180")}
          />
        </button>

        {modelOpen && (
          <ul
            role="listbox"
            aria-label="大模型策略列表"
            className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900"
          >
            <li role="option" aria-selected={modelSkillId === null}>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"
                onClick={() => handleModelSelect(null)}
              >
                不使用 A 层策略
                {modelSkillId === null && <Check className="h-3.5 w-3.5 text-violet-600" />}
              </button>
            </li>
            {modelSkills.map((skill) => (
              <li key={skill.id} role="option" aria-selected={modelSkillId === skill.id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-violet-50 dark:hover:bg-violet-500/10",
                    modelSkillId === skill.id
                      ? "font-medium text-violet-700 dark:text-violet-300"
                      : "text-slate-700 dark:text-slate-300",
                  )}
                  onClick={() => handleModelSelect(skill.id)}
                >
                  <span className="truncate">{skill.label}</span>
                  {modelSkillId === skill.id && <Check className="h-3.5 w-3.5 shrink-0 text-violet-600" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* B 层 */}
      <div className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={viralOpen}
          aria-label="选择平台爆款策略"
          onClick={() => {
            setViralOpen((o) => !o)
            closeOthers("viral")
          }}
          className={cn(
            "inline-flex max-w-[200px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40",
            viralSkillIds.length > 0
              ? "border-cyan-200/80 bg-cyan-50/60 text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
          )}
        >
          <Layers className="h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" />
          <span className="truncate">{viralLabel}</span>
          <ChevronDown
            className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform", viralOpen && "rotate-180")}
          />
        </button>

        {viralOpen && (
          <ul
            role="listbox"
            aria-label="平台爆款策略列表"
            aria-multiselectable="true"
            className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900"
          >
            {viralSkills.map((skill) => {
              const checked = viralSkillIds.includes(skill.id)
              return (
                <li key={skill.id} role="option" aria-selected={checked}>
                  <button
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-cyan-50 dark:hover:bg-cyan-500/10",
                      checked
                        ? "font-medium text-cyan-700 dark:text-cyan-300"
                        : "text-slate-700 dark:text-slate-300",
                    )}
                    onClick={() => toggleViral(skill.id)}
                  >
                    <span className="truncate">{skill.label}</span>
                    {checked && <Check className="h-3.5 w-3.5 shrink-0 text-cyan-600" />}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* C 层 */}
      <div className="relative">
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={enterpriseOpen}
          aria-label="选择企业知识库 Skill"
          onClick={() => {
            setEnterpriseOpen((o) => !o)
            closeOthers("enterprise")
          }}
          className={cn(
            "inline-flex max-w-[220px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40",
            selectedEnterprise
              ? "border-emerald-200/80 bg-emerald-50/60 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300",
          )}
        >
          <Building2 className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="truncate">
            {selectedEnterprise ? selectedEnterprise.label : "C 企业知识库"}
          </span>
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 shrink-0 opacity-60 transition-transform",
              enterpriseOpen && "rotate-180",
            )}
          />
        </button>

        {enterpriseOpen && (
          <ul
            role="listbox"
            aria-label="企业知识库 Skill 列表"
            className="absolute right-0 z-30 mt-1.5 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900"
          >
            {enterpriseSkills.length === 0 ? (
              <li className="px-3 py-3 text-[11px] leading-relaxed text-slate-500">
                暂无企业 Skill，请先在「企业知识库搭建」页生成并保存
              </li>
            ) : (
              <>
                <li role="option" aria-selected={enterpriseSkillId === null}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"
                    onClick={() => handleEnterpriseSelect(null)}
                  >
                    不使用 C 层知识库
                    {enterpriseSkillId === null && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                  </button>
                </li>
                {enterpriseSkills.map((skill) => (
                  <li key={skill.id} role="option" aria-selected={enterpriseSkillId === skill.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full flex-col items-start px-3 py-2 text-left text-[12px] hover:bg-emerald-50 dark:hover:bg-emerald-500/10",
                        enterpriseSkillId === skill.id
                          ? "font-medium text-emerald-700 dark:text-emerald-300"
                          : "text-slate-700 dark:text-slate-300",
                      )}
                      onClick={() => handleEnterpriseSelect(skill.id)}
                    >
                      <span className="flex w-full items-center justify-between gap-2">
                        <span className="truncate">{skill.label}</span>
                        {enterpriseSkillId === skill.id && (
                          <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                        )}
                      </span>
                      <span className="mt-0.5 line-clamp-1 text-[10px] font-normal text-slate-400">
                        {skill.description}
                      </span>
                    </button>
                  </li>
                ))}
              </>
            )}
          </ul>
        )}
      </div>

      {(selectedModel || selectedEnterprise) && (
        <p className="flex max-w-[280px] items-start gap-1 text-[10px] leading-snug text-amber-600/90 dark:text-amber-400/80 sm:absolute sm:right-0 sm:top-full sm:mt-8">
          <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span>策略参考，非官方公式</span>
        </p>
      )}

      {selectedEnterprise && !enterpriseOpen && (
        <p className="hidden max-w-[220px] truncate text-[10px] text-slate-400 sm:block sm:absolute sm:right-0 sm:top-full sm:mt-1">
          {selectedEnterprise.description}
        </p>
      )}
    </div>
  )
}

/** @deprecated 使用 GeoSkillToolbar */
export function GeoKnowledgeBasePicker({
  modelSkillId,
  viralSkillIds,
  onModelChange,
  onViralChange,
}: Omit<Props, "enterpriseSkillId" | "onEnterpriseChange">) {
  const [enterpriseSkillId, setEnterpriseSkillId] = React.useState<string | null>(null)
  return (
    <GeoSkillToolbar
      modelSkillId={modelSkillId}
      viralSkillIds={viralSkillIds}
      enterpriseSkillId={enterpriseSkillId}
      onModelChange={onModelChange}
      onViralChange={onViralChange}
      onEnterpriseChange={setEnterpriseSkillId}
    />
  )
}

export { MODEL_STORAGE_KEY, VIRAL_STORAGE_KEY, ENTERPRISE_STORAGE_KEY }

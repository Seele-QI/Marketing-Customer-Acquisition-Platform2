"use client"

import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { showSwitchNotice } from "@/hooks/use-geo-switch-flash"
import {
  MODEL_MENU_OPTION,
  MODEL_MENU_OPTION_DISABLED,
  MODEL_MENU_OPTION_SELECTED,
  MODEL_MENU_PANEL,
  MODEL_MENU_TRIGGER,
  upwardPanelStyle,
} from "@/lib/llm/model-menu-styles"

export type AiModelOption = {
  id: string
  label: string
  provider: string
  billing: "fixed" | "token" | "per_call"
  configured: boolean
  costCredits?: number
  rates?: {
    inputPer1M: number
    outputPer1M: number
    cacheReadPer1M?: number
    cacheCreatePer1M?: number
  }
}

function envHint(m: AiModelOption): string {
  if (m.provider === "sonetto_gpt" || m.provider === "sonetto_claude") {
    return "需配置 NEWAPI_BASE_URL + NEWAPI_KEY + MODEL（可由云端下发）"
  }
  if (m.provider === "deepseek") return "需配置 DEEPSEEK_API_KEY"
  if (m.provider === "ark") return "需配置 ARK_API_KEY（可选 ARK_CHAT_MODEL）"
  return "未配置"
}

export function useAiModels() {
  const [models, setModels] = React.useState<AiModelOption[]>([])
  const [modelId, setModelId] = React.useState("deepseek-chat")
  const [loaded, setLoaded] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/ai/models", { cache: "no-store" })
        if (!res.ok) return
        const data = (await res.json()) as { models?: AiModelOption[] }
        const list = Array.isArray(data.models) ? data.models : []
        if (cancelled) return
        setModels(list)
        const configured = list.filter((m) => m.configured)
        const currentOk = configured.some((m) => m.id === "deepseek-chat")
        if (configured.length > 0 && !currentOk) {
          setModelId(configured[0].id)
        }
      } catch {
        /* keep default */
      } finally {
        if (!cancelled) setLoaded(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const allModels = React.useMemo(() => {
    if (models.length > 0) return models
    return [
      {
        id: "deepseek-chat",
        label: "DeepSeek",
        provider: "deepseek",
        billing: "fixed" as const,
        configured: true,
        costCredits: 3,
      },
    ]
  }, [models])

  const selected =
    allModels.find((m) => m.id === modelId && m.configured) ??
    allModels.find((m) => m.configured) ??
    allModels[0]
  const effectiveModelId = selected?.id ?? "deepseek-chat"

  const setModelIdSafe = React.useCallback(
    (id: string) => {
      const m = allModels.find((x) => x.id === id)
      if (m && !m.configured) return
      setModelId(id)
    },
    [allModels],
  )

  return {
    models: allModels,
    modelId: effectiveModelId,
    setModelId: setModelIdSafe,
    loaded,
    selected,
  }
}

type Props = {
  modelId: string
  onChange: (id: string) => void
  models: AiModelOption[]
  disabled?: boolean
  className?: string
}

export function AiModelPicker({ modelId, onChange, models, disabled, className }: Props) {
  const [open, setOpen] = React.useState(false)
  const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties>({})
  const containerRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  const current =
    models.find((m) => m.id === modelId && m.configured) ??
    models.find((m) => m.configured) ??
    models[0]

  const updatePanelPos = React.useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    setPanelStyle(upwardPanelStyle(el.getBoundingClientRect()))
  }, [])

  React.useEffect(() => {
    if (!open) return
    updatePanelPos()
    window.addEventListener("resize", updatePanelPos)
    window.addEventListener("scroll", updatePanelPos, true)
    return () => {
      window.removeEventListener("resize", updatePanelPos)
      window.removeEventListener("scroll", updatePanelPos, true)
    }
  }, [open, updatePanelPos])

  React.useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("pointerdown", onPointerDown)
      return () => document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [open])

  if (models.length === 0 || !current) return null

  return (
    <div ref={containerRef} className={cn("flex flex-wrap items-center gap-2", className)}>
      <label className="text-[11px] text-slate-500 dark:text-slate-400">模型</label>
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(MODEL_MENU_TRIGGER, disabled && "cursor-not-allowed opacity-60")}
        >
          <span className="truncate">{current.label}</span>
          <ChevronDown
            className={cn(
              "ml-auto h-3.5 w-3.5 shrink-0 opacity-60 transition-transform",
              open && "rotate-180",
            )}
          />
        </button>

        {open && (
          <ul
            role="listbox"
            aria-label="模型列表"
            className={MODEL_MENU_PANEL}
            style={panelStyle}
          >
            {models.map((m) => {
              const isDisabled = !m.configured
              const isSelected = m.id === current.id
              return (
                <li key={m.id} role="option" aria-selected={isSelected} aria-disabled={isDisabled}>
                  <button
                    type="button"
                    disabled={isDisabled}
                    title={isDisabled ? envHint(m) : undefined}
                    className={cn(
                      MODEL_MENU_OPTION,
                      isSelected && !isDisabled && MODEL_MENU_OPTION_SELECTED,
                      isDisabled && MODEL_MENU_OPTION_DISABLED,
                    )}
                    onClick={() => {
                      if (isDisabled) return
                      if (m.id !== current.id) {
                        showSwitchNotice("provider", m.label)
                      }
                      onChange(m.id)
                      setOpen(false)
                    }}
                  >
                    {m.label}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

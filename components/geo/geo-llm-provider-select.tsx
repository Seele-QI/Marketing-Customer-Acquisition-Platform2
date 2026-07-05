"use client"

import * as React from "react"
import { ChevronDown, Cpu } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LlmProviderId } from "@/lib/geo/llm/router"
import { showSwitchNotice } from "@/hooks/use-geo-switch-flash"
import {
  MODEL_MENU_OPTION,
  MODEL_MENU_OPTION_DISABLED,
  MODEL_MENU_OPTION_SELECTED,
  MODEL_MENU_PANEL,
  MODEL_MENU_TRIGGER,
  upwardPanelStyle,
} from "@/lib/llm/model-menu-styles"

export type LlmProviderOption = {
  id: LlmProviderId
  label: string
  envKeys: string[]
  configured: boolean
}

type Props = {
  value: LlmProviderId
  onChange: (id: LlmProviderId) => void
  providers?: LlmProviderOption[]
  className?: string
  disabled?: boolean
}

export function GeoLlmProviderSelect({
  value,
  onChange,
  providers: externalProviders,
  className,
  disabled,
}: Props) {
  const [providers, setProviders] = React.useState<LlmProviderOption[]>(externalProviders ?? [])
  const [loading, setLoading] = React.useState(!externalProviders)
  const [open, setOpen] = React.useState(false)
  const [panelStyle, setPanelStyle] = React.useState<React.CSSProperties>({})
  const containerRef = React.useRef<HTMLDivElement>(null)
  const triggerRef = React.useRef<HTMLButtonElement>(null)

  React.useEffect(() => {
    if (externalProviders) {
      setProviders(externalProviders)
      setLoading(false)
      return
    }
    let cancelled = false
    void fetch("/api/geo/llm-providers")
      .then((r) => r.json())
      .then((data: { providers?: LlmProviderOption[] }) => {
        if (cancelled) return
        setProviders(data.providers ?? [])
      })
      .catch(() => {
        if (!cancelled) setProviders([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [externalProviders])

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
        const panel = document.getElementById("geo-llm-provider-panel")
        if (panel?.contains(e.target as Node)) return
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener("pointerdown", onPointerDown)
      return () => document.removeEventListener("pointerdown", onPointerDown)
    }
  }, [open])

  React.useEffect(() => {
    if (providers.length === 0) return
    const current = providers.find((p) => p.id === value)
    if (!current?.configured) {
      const firstConfigured = providers.find((p) => p.configured)
      if (firstConfigured) onChange(firstConfigured.id)
    }
  }, [providers, value, onChange])

  const selected = providers.find((p) => p.id === value)

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled || loading}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          MODEL_MENU_TRIGGER,
          "py-2",
          (disabled || loading) && "cursor-not-allowed opacity-60",
        )}
      >
        <Cpu className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
        <span className="truncate">{loading ? "加载中…" : (selected?.label ?? "选择模型")}</span>
        <ChevronDown
          className={cn(
            "ml-auto h-3.5 w-3.5 shrink-0 opacity-60 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <ul
          id="geo-llm-provider-panel"
          role="listbox"
          aria-label="大模型列表"
          className={MODEL_MENU_PANEL}
          style={panelStyle}
        >
          {providers.map((p) => {
            const isDisabled = !p.configured
            const isSelected = value === p.id
            return (
              <li key={p.id} role="option" aria-selected={isSelected} aria-disabled={isDisabled}>
                <button
                  type="button"
                  disabled={isDisabled}
                  title={isDisabled ? `请在 .env 配置 ${p.envKeys.join("、")}` : undefined}
                  className={cn(
                    MODEL_MENU_OPTION,
                    isSelected && !isDisabled && MODEL_MENU_OPTION_SELECTED,
                    isDisabled && MODEL_MENU_OPTION_DISABLED,
                  )}
                  onClick={() => {
                    if (isDisabled) return
                    if (p.id !== value) {
                      showSwitchNotice("provider", p.label)
                    }
                    onChange(p.id)
                    setOpen(false)
                  }}
                >
                  {p.label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

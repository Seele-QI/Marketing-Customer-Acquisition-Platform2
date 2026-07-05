"use client"

import * as React from "react"
import { Cpu, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LlmProviderId } from "@/lib/geo/llm/router"
import { showSwitchNotice } from "@/hooks/use-geo-switch-flash"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
  /** 显示「AI 引擎」标签（内容矩阵配置区等） */
  showLabel?: boolean
}

export function GeoLlmProviderSelect({
  value,
  onChange,
  providers: externalProviders,
  className,
  disabled,
  showLabel = false,
}: Props) {
  const [providers, setProviders] = React.useState<LlmProviderOption[]>(externalProviders ?? [])
  const [loading, setLoading] = React.useState(!externalProviders)

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

  React.useEffect(() => {
    if (providers.length === 0) return
    const current = providers.find((p) => p.id === value)
    if (!current?.configured) {
      const firstConfigured = providers.find((p) => p.configured)
      if (firstConfigured) onChange(firstConfigured.id)
    }
  }, [providers, value, onChange])

  const selected = providers.find((p) => p.id === value)
  const effectiveValue =
    selected?.configured ? value : (providers.find((p) => p.configured)?.id ?? value)

  const handleChange = (next: string) => {
    const p = providers.find((x) => x.id === next)
    if (!p?.configured) return
    if (p.id !== value) {
      showSwitchNotice("provider", p.label)
    }
    onChange(p.id)
  }

  const selectDisabled = disabled || loading || providers.length === 0

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {showLabel ? (
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">AI 引擎</span>
      ) : null}
      <Select value={effectiveValue} onValueChange={handleChange} disabled={selectDisabled}>
        <SelectTrigger
          size="sm"
          aria-label="选择 AI 引擎"
          className={cn(
            "min-w-[148px] border-slate-200/80 bg-white/80 text-[12px] shadow-sm dark:border-white/10 dark:bg-white/5",
            selectDisabled && "cursor-not-allowed opacity-60",
          )}
        >
          {loading ? (
            <span className="flex items-center gap-1.5 text-slate-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              加载中…
            </span>
          ) : (
            <span className="flex min-w-0 items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 shrink-0 text-cyan-500" />
              <SelectValue placeholder="选择模型" />
            </span>
          )}
        </SelectTrigger>
        <SelectContent align="end" className="min-w-[160px]">
          {providers.map((p) => (
            <SelectItem
              key={p.id}
              value={p.id}
              disabled={!p.configured}
              title={!p.configured ? `请在 .env 配置 ${p.envKeys.join("、")}` : undefined}
              className="text-[12px]"
            >
              {p.label}
              {!p.configured ? "（未配置）" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

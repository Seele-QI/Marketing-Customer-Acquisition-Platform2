"use client"

import * as React from "react"
import { Check, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  EDITING_PRESETS,
  type EditingPresetId,
  type EditingPresetMeta,
} from "@/lib/video/editing-presets"

type Props = {
  value: EditingPresetId
  onChange: (id: EditingPresetId) => void
  disabled?: boolean
}

export function EditingStylePanel({ value, onChange, disabled }: Props) {
  return (
    <div className="rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-white/10 dark:bg-white/5">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-rose-500" />
        <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
          剪辑风格
        </p>
        <span className="text-[12px] text-slate-400">选择成片模板后应用自动剪辑</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {EDITING_PRESETS.map((preset) => (
          <EditingStyleCard
            key={preset.id}
            preset={preset}
            selected={value === preset.id}
            disabled={disabled || !preset.available}
            onSelect={() => {
              if (preset.available && !disabled) onChange(preset.id)
            }}
          />
        ))}
      </div>
    </div>
  )
}

function EditingStyleCard({
  preset,
  selected,
  disabled,
  onSelect,
}: {
  preset: EditingPresetMeta
  selected: boolean
  disabled: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled && !selected}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col items-start gap-2 rounded-xl border p-3.5 text-left transition-all",
        selected
          ? "border-rose-400 bg-rose-50/80 ring-2 ring-rose-500/20 dark:border-rose-500/50 dark:bg-rose-500/10"
          : "border-slate-200/80 bg-slate-50/40 hover:border-slate-300 hover:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:hover:border-white/20",
        disabled && !selected && "cursor-not-allowed opacity-50",
      )}
    >
      {selected ? (
        <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white">
          <Check className="h-3 w-3" />
        </span>
      ) : null}

      <div className="pr-6">
        <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-100">
          {preset.name}
        </p>
        {!preset.available ? (
          <span className="mt-1 inline-block rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">
            即将上线
          </span>
        ) : null}
      </div>

      <p className="text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
        {preset.description}
      </p>

      <div className="mt-auto flex flex-wrap gap-1">
        {preset.features.map((feature) => (
          <span
            key={feature}
            className={cn(
              "rounded-md px-1.5 py-0.5 text-[10px] font-medium",
              selected
                ? "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300"
                : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400",
            )}
          >
            {feature}
          </span>
        ))}
      </div>
    </button>
  )
}

"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

type Props = {
  label: string
  description?: string
  placeholder?: string
  value: string
  onChange: (value: string) => void
  required?: boolean
  multiline?: boolean
  rows?: number
}

export function PositioningQuestionCard({
  label,
  description,
  placeholder,
  value,
  onChange,
  required,
  multiline,
  rows = 3,
}: Props) {
  const inputClass = cn(
    "w-full rounded-xl border border-slate-200/60 bg-white px-4 py-3 text-[14px] leading-relaxed text-slate-800",
    "placeholder:text-slate-400 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/15",
    "dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:placeholder:text-slate-500",
  )

  return (
    <div className="space-y-2 rounded-2xl border border-slate-200/60 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5">
      <div>
        <label className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
          {label}
          {required ? (
            <span className="ml-1 text-rose-500">*</span>
          ) : (
            <span className="ml-2 text-[11px] font-normal text-slate-400">选填</span>
          )}
        </label>
        {description ? (
          <p className="mt-1 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">
            {description}
          </p>
        ) : null}
      </div>
      {multiline ? (
        <textarea
          className={cn(inputClass, "resize-none")}
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          type="text"
          className={inputClass}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  )
}

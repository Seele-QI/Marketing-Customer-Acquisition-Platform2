"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { getMatrixPlatformLabel } from "@/lib/geo/matrix-platforms"

type Props = {
  platformIds: string[]
  activeId: string | null
  onChange: (id: string) => void
  className?: string
}

export function GeoMatrixPlatformTabs({
  platformIds,
  activeId,
  onChange,
  className,
}: Props) {
  if (platformIds.length === 0) return null

  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto scroll-smooth pb-1",
        "[scroll-snap-type:x_mandatory] [&>*]:scroll-snap-align-start",
        className,
      )}
    >
      {platformIds.map((id) => {
        const active = id === activeId
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={cn(
              "shrink-0 rounded-full border px-4 py-1.5 text-[12px] font-medium transition-colors",
              active
                ? "border-cyan-400 bg-cyan-600 text-white shadow-sm"
                : "border-slate-200/80 bg-white text-slate-600 hover:border-cyan-200 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
            )}
          >
            {getMatrixPlatformLabel(id)}
          </button>
        )
      })}
    </div>
  )
}

"use client"

import * as React from "react"
import { Brain, Building2, Cpu } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  switchNoticeMessage,
  useSwitchFlashSubscriber,
  type SwitchNoticeKind,
} from "@/hooks/use-geo-switch-flash"

const ICONS: Record<SwitchNoticeKind, typeof Cpu> = {
  provider: Cpu,
  modelSkill: Brain,
  enterprise: Building2,
}

const ICON_COLORS: Record<SwitchNoticeKind, string> = {
  provider: "text-cyan-500",
  modelSkill: "text-violet-500",
  enterprise: "text-emerald-500",
}

const BORDER_COLORS: Record<SwitchNoticeKind, string> = {
  provider: "border-cyan-300/60 dark:border-cyan-500/40",
  modelSkill: "border-violet-300/60 dark:border-violet-500/40",
  enterprise: "border-emerald-300/60 dark:border-emerald-500/40",
}

export function GeoSwitchFlash() {
  const notice = useSwitchFlashSubscriber()
  const [visible, setVisible] = React.useState(false)

  React.useEffect(() => {
    if (!notice) {
      setVisible(false)
      return
    }
    if (notice.phase === "enter") {
      setVisible(false)
      const frame = requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
      return () => cancelAnimationFrame(frame)
    }
    setVisible(notice.phase === "hold")
  }, [notice])

  if (!notice) return null

  const Icon = ICONS[notice.kind]
  const exiting = notice.phase === "exit"
  const entering = notice.phase === "enter"

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center"
      aria-live="polite"
      role="status"
    >
      <div
        className={cn(
          "flex max-w-[min(90vw,320px)] items-center gap-3 rounded-xl border bg-white/85 px-4 py-3 shadow-lg backdrop-blur-md transition-all dark:bg-slate-900/90",
          BORDER_COLORS[notice.kind],
          (entering && !visible) || exiting ? "scale-95 opacity-0" : "scale-100 opacity-100",
        )}
        style={{
          transitionDuration: exiting ? "500ms" : entering ? "300ms" : "200ms",
        }}
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-50 dark:bg-white/5",
          )}
        >
          <Icon className={cn("h-4 w-4", ICON_COLORS[notice.kind])} />
        </span>
        <p className="text-[13px] font-medium leading-snug text-slate-800 dark:text-slate-100">
          {switchNoticeMessage(notice.kind, notice.label)}
        </p>
      </div>
    </div>
  )
}

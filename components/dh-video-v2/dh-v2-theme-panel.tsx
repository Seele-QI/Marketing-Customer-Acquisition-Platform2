"use client"

import { Moon, Sun } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  DH_V2_ACCENT_OPTIONS,
  type DhV2AccentId,
  type DhV2SurfaceMode,
  type DhV2UiPrefs,
} from "@/lib/dh-video-v2/theme"

type Props = {
  prefs: DhV2UiPrefs
  onChange: (prefs: DhV2UiPrefs) => void
  className?: string
}

export function DhV2ThemePanel({ prefs, onChange, className }: Props) {
  const setSurface = (surface: DhV2SurfaceMode) => onChange({ ...prefs, surface })
  const setAccent = (accent: DhV2AccentId) => onChange({ ...prefs, accent })

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-1.5",
        prefs.surface === "dark"
          ? "border-white/10 bg-black/30"
          : "border-slate-200 bg-white/80 shadow-sm",
        className,
      )}
    >
      <div className="flex rounded-lg border border-inherit p-0.5">
        <button
          type="button"
          title="暗色主题"
          onClick={() => setSurface("dark")}
          className={cn(
            "rounded-md p-1.5 transition",
            prefs.surface === "dark"
              ? "bg-white/10 text-amber-200"
              : "text-slate-400 hover:text-slate-600",
          )}
        >
          <Moon className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          title="亮色主题"
          onClick={() => setSurface("light")}
          className={cn(
            "rounded-md p-1.5 transition",
            prefs.surface === "light"
              ? "bg-amber-100 text-amber-800"
              : "text-slate-400 hover:text-slate-600",
          )}
        >
          <Sun className="h-3.5 w-3.5" />
        </button>
      </div>
      <span className="hidden h-4 w-px bg-current opacity-20 sm:block" />
      <div className="flex items-center gap-1.5">
        {DH_V2_ACCENT_OPTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            title={a.label}
            onClick={() => setAccent(a.id)}
            className={cn(
              "h-5 w-5 rounded-full ring-2 ring-offset-1 transition",
              a.dot,
              prefs.accent === a.id
                ? "ring-white/40 ring-offset-transparent scale-110"
                : "ring-transparent opacity-60 hover:opacity-100",
            )}
          />
        ))}
      </div>
    </div>
  )
}

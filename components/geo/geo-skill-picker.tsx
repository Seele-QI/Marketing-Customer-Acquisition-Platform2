"use client"

import * as React from "react"
import { Sparkles, ChevronDown, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  listGeoSkills,
  getDefaultGeoSkill,
  type GeoSkillEntry,
} from "@/lib/geo/skills-registry"

const STORAGE_KEY = "geo-article-active-skill"

type Props = {
  value: string | null
  onChange: (skillId: string | null) => void
}

export function GeoSkillPicker({ value, onChange }: Props) {
  const skills = React.useMemo(() => listGeoSkills(), [])
  const [open, setOpen] = React.useState(false)
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (value !== null) return
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === "none") return
    if (stored && skills.some((s) => s.id === stored)) {
      onChange(stored)
      return
    }
    const def = getDefaultGeoSkill()
    if (def) onChange(def.id)
  }, [value, onChange, skills])

  React.useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [open])

  const selected: GeoSkillEntry | undefined =
    value === null ? undefined : skills.find((s) => s.id === value)

  const handleSelect = (id: string | null) => {
    onChange(id)
    localStorage.setItem(STORAGE_KEY, id ?? "none")
    setOpen(false)
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="选择创作准则技能"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex max-w-[240px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40",
          selected
            ? "border-cyan-200/80 bg-cyan-50/60 text-cyan-800 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-200"
            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10",
        )}
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-400" />
        <span className="truncate">{selected ? selected.label : "创作准则（可选）"}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0 opacity-60 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="创作准则技能列表"
          className="absolute right-0 z-30 mt-1.5 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/10 dark:bg-slate-900"
        >
          <li role="option" aria-selected={value === null}>
            <button
              type="button"
              className="flex w-full items-center justify-between px-3 py-2 text-left text-[12px] text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5"
              onClick={() => handleSelect(null)}
            >
              不使用技能
              {value === null && <Check className="h-3.5 w-3.5 text-cyan-600" />}
            </button>
          </li>
          {skills.map((skill) => (
            <li key={skill.id} role="option" aria-selected={value === skill.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-cyan-50 dark:hover:bg-cyan-500/10",
                  value === skill.id
                    ? "font-medium text-cyan-700 dark:text-cyan-300"
                    : "text-slate-700 dark:text-slate-300",
                )}
                onClick={() => handleSelect(skill.id)}
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{skill.label}</span>
                  {skill.default && (
                    <span className="shrink-0 rounded bg-cyan-100 px-1 py-0.5 text-[9px] text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
                      默认
                    </span>
                  )}
                </span>
                {value === skill.id && <Check className="h-3.5 w-3.5 shrink-0 text-cyan-600" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && !open && (
        <p className="absolute right-0 top-full mt-1 hidden max-w-[240px] truncate text-[10px] text-slate-400 sm:block">
          {selected.description}
        </p>
      )}
    </div>
  )
}

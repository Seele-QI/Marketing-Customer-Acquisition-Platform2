/**
 * 上传区域组件 — 拖拽 / 点击上传
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

type UploadZoneProps = {
  accept: string
  label: string
  icon: LucideIcon
  hint: string
  disabled?: boolean
  onFile: (file: File) => void
}

export function UploadZone({ accept, label, icon: Icon, hint, disabled, onFile }: UploadZoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = React.useState(false)

  return (
    <div
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 transition-all",
        dragOver
          ? "border-rose-400 bg-rose-50/50 dark:border-rose-500/40 dark:bg-rose-500/5"
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20",
        disabled && "pointer-events-none opacity-40",
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10">
        <Icon className="h-5 w-5 text-rose-400" />
      </span>
      <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{label}</p>
      <p className="text-[11px] text-slate-400">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
      />
    </div>
  )
}

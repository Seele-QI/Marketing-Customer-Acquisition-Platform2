"use client"

import * as React from "react"
import { ImageIcon, Mic, Plus, Trash2, GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import { formatSize } from "@/lib/video/utils"
import type { DhV2ThemeTokens } from "@/lib/dh-video-v2/theme"

export type MaterialSlotItem = {
  id: string
  name: string
  previewUrl: string
  dataUrl: string
  sizeBytes: number
  meta?: string
}

type Props = {
  kind: "image" | "audio"
  labelPrefix: string
  maxSlots: number
  items: MaterialSlotItem[]
  onAdd: (file: File) => void
  onRemove: (id: string) => void
  onReorder?: (fromIndex: number, toIndex: number) => void
  accept: string
  hint: string
  disabled?: boolean
  tokens: DhV2ThemeTokens
}

export function MaterialSlotGrid({
  kind,
  labelPrefix,
  maxSlots,
  items,
  onAdd,
  onRemove,
  onReorder,
  accept,
  hint,
  disabled,
  tokens: t,
}: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const [dragIndex, setDragIndex] = React.useState<number | null>(null)

  const canAdd = items.length < maxSlots && !disabled
  const Icon = kind === "image" ? ImageIcon : Mic

  const handleFile = (file: File) => {
    if (!canAdd) return
    onAdd(file)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-[11px] font-semibold uppercase tracking-wider", t.fieldLabel)}>
          {labelPrefix}
          <span className={cn("ml-2 font-normal normal-case", t.muted)}>
            {items.length}/{maxSlots}
          </span>
        </p>
        {canAdd ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition",
              t.slotAddBtn,
            )}
          >
            <Plus className="h-3 w-3" />
            添加
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          "grid gap-2",
          kind === "image" ? "grid-cols-3 sm:grid-cols-3" : "grid-cols-1",
        )}
      >
        {items.map((item, index) => (
          <div
            key={item.id}
            draggable={!!onReorder && !disabled}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={() => {
              if (dragIndex !== null && onReorder && dragIndex !== index) {
                onReorder(dragIndex, index)
              }
              setDragIndex(null)
            }}
            className={cn(
              "group relative overflow-hidden rounded-xl border backdrop-blur-sm transition",
              "animate-in fade-in zoom-in-95 duration-300",
              t.slotItem,
              kind === "audio" ? "flex h-14 items-center gap-2 px-3" : "aspect-[4/5]",
            )}
          >
            <span
              className={cn(
                "absolute left-2 top-2 z-10 rounded-md px-1.5 py-0.5 text-[9px] font-bold",
                t.slotBadge,
              )}
            >
              {labelPrefix.replace("参考", "")}
              {index + 1}
            </span>

            {kind === "image" ? (
              <img
                src={item.previewUrl}
                alt={item.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <>
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/5 dark:bg-white/5",
                  )}
                >
                  <Mic className={cn("h-4 w-4", t.slotIcon)} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-[11px] font-medium", t.title)}>{item.name}</p>
                  <p className={cn("text-[10px]", t.muted)}>
                    {item.meta || formatSize(item.sizeBytes)}
                  </p>
                </div>
              </>
            )}

            <div className="absolute inset-0 flex items-end justify-between bg-gradient-to-t from-black/70 via-transparent to-transparent p-2 opacity-0 transition group-hover:opacity-100">
              {onReorder ? (
                <GripVertical className="h-4 w-4 text-white/60" />
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="rounded-md bg-black/50 p-1 text-white hover:bg-red-500/80"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))}

        {canAdd ? (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragOver(false)
              const f = e.dataTransfer.files[0]
              if (f) handleFile(f)
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed transition",
              kind === "audio" ? "h-14 flex-row px-3" : "aspect-[4/5]",
              dragOver ? t.slotAddHover : t.slotAdd,
            )}
          >
            <Icon className={cn("h-4 w-4 opacity-70", t.slotIcon)} />
            <p className={cn("text-[10px]", t.muted)}>{hint}</p>
          </div>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) handleFile(f)
          e.target.value = ""
        }}
      />
    </div>
  )
}

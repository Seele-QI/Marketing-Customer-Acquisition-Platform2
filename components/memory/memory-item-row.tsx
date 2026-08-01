"use client"

import * as React from "react"
import { ArchiveRestore, Pin, PinOff, Save, Trash2, XCircle } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"
import type { UserMemoryItem } from "@/lib/memory/types"

const CATEGORY_LABEL: Record<string, string> = {
  identity: "身份",
  business: "业务",
  goal: "长期目标",
  preference: "内容偏好",
  constraint: "明确禁忌",
  fact: "稳定事实",
}

export function MemoryItemRow({
  item,
  busy,
  onUpdate,
  onStatus,
  onDelete,
}: {
  item: UserMemoryItem
  busy: boolean
  onUpdate: (item: UserMemoryItem, patch: { value?: string | string[]; pinned?: boolean }) => Promise<void>
  onStatus: (item: UserMemoryItem, status: "active" | "disabled") => Promise<void>
  onDelete: (item: UserMemoryItem) => Promise<void>
}) {
  const initial = Array.isArray(item.value) ? item.value.join("；") : item.value
  const [value, setValue] = React.useState(initial)
  const changed = value.trim() !== initial.trim()
  const mutable = item.status === "active" || item.status === "disabled"

  return (
    <article className="rounded-xl border border-border/70 bg-background/80 p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {CATEGORY_LABEL[item.category] ?? item.category}
            </span>
            <span className="rounded-full border border-border/70 px-2 py-0.5 text-muted-foreground">
              {item.scope === "global" ? "全局" : item.scope}
            </span>
            {item.source === "manual" ? <span className="text-emerald-600">手动确认</span> : null}
            {item.status !== "active" ? <span className="text-amber-600">{item.status}</span> : null}
          </div>
          <Input
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={busy || !mutable}
            aria-label={`编辑 ${item.memoryKey}`}
            className="h-9 bg-card"
          />
          <p className="mt-1.5 truncate font-mono text-[10px] text-muted-foreground">
            {item.memoryKey} · v{item.revision}
          </p>
        </div>
        {mutable ? <div className="flex shrink-0 flex-col gap-1">
          {changed ? (
            <Button size="icon" variant="ghost" className="h-8 w-8" disabled={busy || !value.trim()} onClick={() => void onUpdate(item, { value: value.trim() })}>
              <Save className="h-3.5 w-3.5" />
              <span className="sr-only">保存</span>
            </Button>
          ) : null}
          <Button
            size="icon"
            variant="ghost"
            className={cn("h-8 w-8", item.pinned && "text-violet-600")}
            disabled={busy}
            onClick={() => void onUpdate(item, { pinned: !item.pinned })}
          >
            {item.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            <span className="sr-only">{item.pinned ? "取消置顶" : "置顶"}</span>
          </Button>
          {item.status === "disabled" ? (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600" disabled={busy} onClick={() => void onStatus(item, "active")}>
              <ArchiveRestore className="h-3.5 w-3.5" />
              <span className="sr-only">恢复</span>
            </Button>
          ) : (
            <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600" disabled={busy} onClick={() => void onStatus(item, "disabled")}>
              <XCircle className="h-3.5 w-3.5" />
              <span className="sr-only">停用</span>
            </Button>
          )}
          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" disabled={busy} onClick={() => void onDelete(item)}>
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">删除</span>
          </Button>
        </div> : null}
      </div>
    </article>
  )
}

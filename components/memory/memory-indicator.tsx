"use client"

import { Brain, ChevronRight, Cloud, CloudOff, Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"
import type { MemorySyncStatus, UserMemorySummary } from "@/lib/memory/types"

const STATUS_LABEL: Record<MemorySyncStatus, string> = {
  idle: "等待同步",
  syncing: "同步中",
  synced: "已同步",
  stale: "缓存内容",
  error: "同步失败",
  disabled: "已关闭",
  signed_out: "登录后同步",
}

export function MemoryIndicator({
  syncStatus,
  summary,
  usedCount,
  onOpen,
}: {
  syncStatus: MemorySyncStatus
  summary: UserMemorySummary
  usedCount: number
  onOpen: () => void
}) {
  const offline = syncStatus === "stale" || syncStatus === "error"
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
        "border-violet-200/70 bg-violet-50/70 hover:bg-violet-100/70",
        "dark:border-violet-400/20 dark:bg-violet-400/[0.06] dark:hover:bg-violet-400/[0.1]",
      )}
      aria-label="打开长期记忆中心"
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
        <Brain className="h-4 w-4" aria-hidden />
        {syncStatus === "syncing" ? (
          <Loader2 className="absolute -right-1 -top-1 h-3.5 w-3.5 animate-spin rounded-full bg-background p-0.5 text-violet-600" />
        ) : offline ? (
          <CloudOff className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-background p-0.5 text-amber-600" />
        ) : (
          <Cloud className="absolute -right-1 -top-1 h-3.5 w-3.5 rounded-full bg-background p-0.5 text-emerald-600" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12px]">
          <span className="font-medium text-violet-800 dark:text-violet-200">
            本次使用 {usedCount} 条
          </span>
          <span className="text-violet-600/75 dark:text-violet-300/70">
            长期档案 {summary.total} 条
          </span>
        </span>
        <span className={cn("mt-0.5 block truncate text-[11px]", offline ? "text-amber-700 dark:text-amber-300" : "text-muted-foreground")}>
          {STATUS_LABEL[syncStatus]} · 只会使用与当前任务相关的信息
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-violet-400 transition-transform group-hover:translate-x-0.5" aria-hidden />
    </button>
  )
}

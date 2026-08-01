"use client"

import * as React from "react"
import { Brain, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"

import { MemoryItemRow } from "@/components/memory/memory-item-row"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useUserMemory } from "@/hooks/use-user-memory"
import { createUserMemoryClient } from "@/lib/memory/client"
import type { MemoryScope, MemoryStatus, UserMemoryItem } from "@/lib/memory/types"

export function MemoryCenterDialog({
  open,
  onOpenChange,
  lastUsedItems = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lastUsedItems?: Array<Record<string, unknown>>
}) {
  const memory = useUserMemory()
  const api = React.useMemo(() => createUserMemoryClient(), [])
  const [scopeFilter, setScopeFilter] = React.useState<"all" | MemoryScope>("all")
  const [statusFilter, setStatusFilter] = React.useState<MemoryStatus>("active")
  const [items, setItems] = React.useState<UserMemoryItem[]>([])
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      setItems(await api.listItems(scopeFilter === "all" ? undefined : scopeFilter, statusFilter))
    } finally {
      setLoading(false)
    }
  }, [api, scopeFilter, statusFilter])

  React.useEffect(() => {
    if (open) void load()
  }, [open, load])

  const run = async (id: string, operation: () => Promise<unknown>) => {
    setBusyId(id)
    try {
      await operation()
      await load()
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[88dvh] w-[min(94vw,880px)] max-w-none flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/70 bg-gradient-to-r from-violet-50 via-background to-cyan-50 px-5 py-4 text-left dark:from-violet-950/30 dark:to-cyan-950/20">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-white shadow-sm">
              <Brain className="h-4 w-4" />
            </span>
            长期记忆中心
          </DialogTitle>
          <DialogDescription>
            记忆属于当前账号，跨设备同步。你可以随时修正、停用或删除；敏感信息不会进入长期档案。
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden p-5">
          {lastUsedItems.length > 0 ? (
            <section className="shrink-0 rounded-xl border border-emerald-200/70 bg-emerald-50/60 p-3 dark:border-emerald-400/20 dark:bg-emerald-400/[0.05]">
              <div className="mb-2 flex items-center gap-2 text-xs font-medium text-emerald-800 dark:text-emerald-200">
                <ShieldCheck className="h-3.5 w-3.5" />
                本次使用 {lastUsedItems.length} 条
              </div>
              <div className="flex flex-wrap gap-1.5">
                {lastUsedItems.map((item, index) => (
                  <span key={String(item.id ?? index)} className="max-w-full truncate rounded-full bg-background/80 px-2.5 py-1 text-[11px] text-muted-foreground ring-1 ring-emerald-200/70 dark:ring-emerald-400/20">
                    {String(item.value ?? item.memoryKey ?? "相关记忆")}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as typeof scopeFilter)} className="h-9 rounded-lg border border-input bg-background px-3 text-xs">
              <option value="all">全部范围</option>
              <option value="global">全局档案</option>
              <option value="copywriting">文案创作</option>
              <option value="positioning">身份定位</option>
              <option value="geo">GEO</option>
            </select>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as MemoryStatus)} className="h-9 rounded-lg border border-input bg-background px-3 text-xs">
              <option value="active">有效</option>
              <option value="disabled">已停用</option>
              <option value="superseded">历史版本</option>
              <option value="deleted">已删除</option>
            </select>
            <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
              <RefreshCw className={loading ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
              刷新
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">长期档案 {memory.summary.total} 条</span>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            {items.length === 0 ? (
              <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground">
                {loading ? "正在同步…" : "这个筛选条件下暂无记忆"}
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((item) => (
                  <MemoryItemRow
                    key={item.id}
                    item={item}
                    busy={busyId === item.id}
                    onUpdate={(target, patch) => run(target.id, () => memory.updateItem(target.id, target.revision, patch))}
                    onStatus={(target, status) => run(target.id, () => memory.setItemStatus(target.id, target.revision, status))}
                    onDelete={(target) => run(target.id, () => memory.deleteItem(target.id, target.revision))}
                  />
                ))}
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-between border-t border-border/60 pt-3">
            <p className="text-[11px] text-muted-foreground">新明确说明会替代旧版本，历史仍保留在审计记录中。</p>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => {
                if (window.confirm("确定清空当前账号的全部长期记忆吗？此操作会保留审计事件，但不会再用于创作。")) {
                  void run("clearAll", () => memory.clearAll())
                }
              }}
              disabled={busyId === "clearAll" || memory.summary.total === 0}
            >
              <Trash2 className="h-3.5 w-3.5" />
              清空全部
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

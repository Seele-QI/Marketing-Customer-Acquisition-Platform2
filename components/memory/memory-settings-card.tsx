"use client"

import { Brain, ChevronRight, Cloud } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useUserMemory } from "@/hooks/use-user-memory"

const SCOPES = [
  ["copywriting", "文案创作"],
  ["positioning", "身份定位"],
  ["geo", "GEO 优化"],
] as const

export function MemorySettingsCard({ onOpen }: { onOpen: () => void }) {
  const memory = useUserMemory()
  const signedOut = memory.syncStatus === "signed_out"
  const syncLabel = memory.syncStatus === "synced"
    ? "云端已同步"
    : memory.syncStatus === "stale"
      ? "正在使用缓存"
      : signedOut
        ? "登录后同步"
        : memory.syncStatus === "error"
          ? "同步失败"
          : memory.syncStatus === "syncing"
            ? "同步中"
            : memory.syncStatus === "disabled"
              ? "已关闭"
              : "等待同步"
  const updateScope = (scope: string, enabled: boolean) => {
    void memory.updateSettings({
      scopeEnabled: { ...memory.settings.scopeEnabled, [scope]: enabled },
    })
  }

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-violet-200/70 bg-card/65 shadow-sm ring-1 ring-violet-500/10 dark:border-violet-400/20 dark:bg-card/45">
      <div className="flex flex-col gap-5 bg-gradient-to-r from-violet-50/80 via-transparent to-cyan-50/70 p-5 dark:from-violet-950/20 dark:to-cyan-950/15 sm:flex-row sm:items-start sm:justify-between sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm">
            <Brain className="h-5 w-5" />
          </div>
          <div>
            <p className="font-medium text-foreground">长期记忆</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              根据你的明确表达持续完善账号档案，只在相关任务中调用。敏感信息与一次性要求不会保存。
            </p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-300">
              <Cloud className="h-3.5 w-3.5" />
              {syncLabel}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-muted-foreground">总开关</span>
          <Switch checked={memory.settings.enabled} disabled={signedOut} onCheckedChange={(enabled) => void memory.updateSettings({ enabled })} aria-label="长期记忆总开关" />
        </div>
      </div>
      <div className="grid gap-px border-t border-border/60 bg-border/60 sm:grid-cols-3">
        {SCOPES.map(([scope, label]) => (
          <label key={scope} className="flex items-center justify-between gap-3 bg-background/90 px-4 py-3 text-sm">
            <span>{label}</span>
            <Switch checked={memory.settings.scopeEnabled[scope] !== false} disabled={signedOut || !memory.settings.enabled} onCheckedChange={(enabled) => updateScope(scope, enabled)} aria-label={`${label}记忆开关`} />
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border/60 px-5 py-3">
        <span className="text-xs text-muted-foreground">当前有效 {memory.summary.total} 条</span>
        <Button variant="ghost" size="sm" className="gap-1" onClick={onOpen}>
          管理长期档案
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </section>
  )
}

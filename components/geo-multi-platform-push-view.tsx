"use client"

import * as React from "react"
import { MessageCircle, BookOpen, Newspaper, Globe, Link2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Switch } from "@/components/ui/switch"
import { GeoPublishQueue } from "@/components/geo/geo-publish-queue"
import { GeoWorkflowHero, GeoWorkflowPage } from "@/components/geo/geo-workflow-shell"
import { toast } from "@/hooks/use-toast"

const PLATFORMS = [
  {
    id: "wechat",
    name: "微信公众号",
    icon: MessageCircle,
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  {
    id: "zhihu",
    name: "知乎",
    icon: BookOpen,
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-500/10",
  },
  {
    id: "toutiao",
    name: "今日头条",
    icon: Newspaper,
    color: "text-red-600",
    bg: "bg-red-50 dark:bg-red-500/10",
  },
  {
    id: "cms",
    name: "官网 CMS",
    icon: Globe,
    color: "text-cyan-600",
    bg: "bg-cyan-50 dark:bg-cyan-500/10",
  },
] as const

export function GeoMultiPlatformPushView() {
  const [enabled, setEnabled] = React.useState<Record<string, boolean>>({
    wechat: true,
    zhihu: true,
    toutiao: false,
    cms: true,
  })

  const handleBind = (name: string) => {
    toast({
      title: "功能开发中",
      description: `${name} 账号绑定将在后续版本接入`,
    })
  }

  return (
    <GeoWorkflowPage>
      <GeoWorkflowHero
        title="多平台"
        accentWord="一键推送"
        description="统一管理渠道发布队列，确保跨平台内容一致性与 GEO 标签覆盖。"
      />

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-4">
          <h3 className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">发布渠道</h3>
          {PLATFORMS.map((p) => {
            const Icon = p.icon
            const on = enabled[p.id]
            return (
              <div
                key={p.id}
                className={cn(
                  "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5",
                  on && "ring-1 ring-cyan-500/20",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl", p.bg)}>
                      <Icon className={cn("h-4 w-4", p.color)} />
                    </span>
                    <div>
                      <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">{p.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {on ? "已启用" : "已关闭"}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={on}
                    onCheckedChange={(v) => setEnabled((prev) => ({ ...prev, [p.id]: v }))}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleBind(p.name)}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-200 py-2 text-[11px] text-slate-500 transition-colors hover:border-cyan-400 hover:text-cyan-600 dark:border-white/10"
                >
                  <Link2 className="h-3 w-3" />
                  绑定账号
                </button>
              </div>
            )
          })}
        </div>

        <div className="lg:col-span-8">
          <GeoPublishQueue />
        </div>
      </div>
    </GeoWorkflowPage>
  )
}

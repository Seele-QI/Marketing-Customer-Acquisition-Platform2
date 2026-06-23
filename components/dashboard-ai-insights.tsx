"use client"

import { Lightbulb, TrendingUp, Eye, Heart, MessageCircle, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Mock Data                                                          */
/* ------------------------------------------------------------------ */

const MOCK_RECOMMENDATIONS = [
  {
    id: "1",
    icon: Lightbulb,
    text: "你的抖音账号近7天互动上升12%，今天适合发布一条产品展示视频，建议结合热点话题 #新品首发 做种草内容",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
  {
    id: "2",
    icon: TrendingUp,
    text: "「高效口播脚本」上周产出 8 条视频，平均播放量 2.4w。建议本周继续稳定产出，重点优化前 3 秒钩子",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
]

const MOCK_RECENT_CONTENT = [
  { title: "老王的店·新品展示", platform: "抖音", views: "3.2w", likes: "856", comments: "124", date: "05/27" },
  { title: "装修避坑指南第3期", platform: "视频号", views: "1.8w", likes: "432", comments: "67", date: "05/26" },
  { title: "实体店转型做短视频", platform: "小红书", views: "2.1w", likes: "1.2k", comments: "203", date: "05/25" },
]

const HOT_SNIPPETS = [
  { rank: 1, title: "AI 数字分身爆火", heat: "128.0w" },
  { rank: 2, title: "小红书爆款封面三段式", heat: "94.2w" },
  { rank: 3, title: "抖音本地生活 POI 玩法", heat: "35.4w" },
]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function DashboardAIInsights() {
  return (
    <div className="space-y-4">
      {/* AI Recommendations */}
      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-slate-500 uppercase tracking-wider">AI 今日建议</h3>
        <div className="space-y-2">
          {MOCK_RECOMMENDATIONS.map((r) => (
            <div
              key={r.id}
              className="flex items-start gap-3 rounded-xl border border-border/60 bg-white p-3 shadow-sm dark:bg-white/5"
            >
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", r.bg, r.color)}>
                <r.icon className="h-3.5 w-3.5" />
              </span>
              <p className="text-[12px] leading-relaxed text-slate-600 dark:text-slate-400">{r.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Content */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[13px] font-semibold text-slate-500 uppercase tracking-wider">最近内容表现</h3>
          <button className="flex items-center gap-0.5 text-[11px] text-primary hover:underline">
            查看全部 <ChevronRight className="h-3 w-3" />
          </button>
        </div>
        <div className="rounded-xl border border-border/60 bg-white dark:bg-white/5">
          {MOCK_RECENT_CONTENT.map((item, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 px-3 py-2.5",
                i < MOCK_RECENT_CONTENT.length - 1 && "border-b border-border/40",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-foreground">{item.title}</p>
                <p className="text-[10px] text-slate-400">{item.platform} · {item.date}</p>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-0.5"><Eye className="h-3 w-3" />{item.views}</span>
                <span className="inline-flex items-center gap-0.5"><Heart className="h-3 w-3" />{item.likes}</span>
                <span className="inline-flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{item.comments}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Hot Snippets */}
      <section>
        <h3 className="mb-2 text-[13px] font-semibold text-slate-500 uppercase tracking-wider">热点速览</h3>
        <div className="space-y-1">
          {HOT_SNIPPETS.map((h) => (
            <div key={h.rank} className="flex items-center gap-2 text-[12px]">
              <span className={cn(
                "flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold",
                h.rank === 1 ? "bg-rose-100 text-rose-600" : h.rank === 2 ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600",
              )}>
                {h.rank}
              </span>
              <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{h.title}</span>
              <span className="shrink-0 text-slate-400">{h.heat}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

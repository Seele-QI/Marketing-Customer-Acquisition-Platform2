"use client"

import { Store, Clapperboard, Mic, RefreshCw, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"

type QuickAction = {
  id: string
  label: string
  desc: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  bg: string
  action: { type: "goView"; view: string } | { type: "openAgent"; name: string; preferInline?: boolean }
  prompts: string[]
}

const ACTIONS: QuickAction[] = [
  {
    id: "store-script",
    label: "实体店获客脚本",
    desc: "餐饮/装修/教育/美业 · 引流脚本自动生成",
    icon: Store,
    color: "text-rose-500",
    bg: "bg-rose-500/10",
    action: { type: "openAgent", name: "实体店获客脚本创作", preferInline: true },
    prompts: ["我是做餐饮的，帮我写一条引流短视频脚本", "写一条本地生活探店风格的口播"],
  },
  {
    id: "video-create",
    label: "AI 视频创作",
    desc: "真人照片+音频 → 数字人口播成片",
    icon: Clapperboard,
    color: "text-violet-500",
    bg: "bg-violet-500/10",
    action: { type: "goView", view: "视频创作" },
    prompts: ["上传形象照+口播稿，一键生成我的数字人视频"],
  },
  {
    id: "koubo-script",
    label: "高效口播脚本",
    desc: "面向数字人与真人口播 · 精准控稿",
    icon: Mic,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    action: { type: "openAgent", name: "高效口播脚本", preferInline: true },
    prompts: ["写一段30秒产品口播稿，带开场钩子", "把这段卖点改成口播稿"],
  },
  {
    id: "script-rewrite",
    label: "爆款脚本洗稿",
    desc: "保留爆款结构 · 改写为你的原创内容",
    icon: RefreshCw,
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
    action: { type: "openAgent", name: "爆款脚本洗稿", preferInline: true },
    prompts: ["把这个热门脚本改写成我的行业风格", "保留爆款结构，换成我的产品"],
  },
]

type Props = {
  onNavigate: (view: string) => void
  onOpenAgent: (name: string) => void
}

export function DashboardQuickActions({ onNavigate, onOpenAgent }: Props) {
  return (
    <section>
      <h2 className="mb-3 text-[16px] font-bold text-foreground">快速创作</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ACTIONS.map((a) => (
          <div
            key={a.id}
            className="group relative overflow-hidden rounded-2xl border border-border/60 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md dark:bg-white/5"
          >
            <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl mb-3", a.bg, a.color)}>
              <a.icon className="h-5 w-5" />
            </span>
            <h3 className="text-[14px] font-semibold text-foreground">{a.label}</h3>
            <p className="mt-1 text-[12px] leading-relaxed text-slate-500 dark:text-slate-400">{a.desc}</p>

            {/* Quick prompt chip */}
            <button
              className="mt-3 w-full rounded-xl bg-slate-50 px-3 py-2 text-left text-[12px] text-slate-600 transition-colors hover:bg-slate-100 dark:bg-white/5 dark:text-slate-400 dark:hover:bg-white/10"
              onClick={() => {
                if (a.action.type === "goView") {
                  onNavigate(a.action.view)
                } else {
                  onOpenAgent(a.action.name)
                }
              }}
            >
              <span className="line-clamp-1">{a.prompts[0]}</span>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-primary">
                立即创作 <ArrowRight className="h-3 w-3" />
              </span>
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

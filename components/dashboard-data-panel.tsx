"use client"

import * as React from "react"
import {
  Radio,
  TrendingUp,
  TrendingDown,
  Users,
  Eye,
  Heart,
  DollarSign,
  Plus,
  Loader2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Types & Mock Data                                                  */
/* ------------------------------------------------------------------ */

type PlatformId = "douyin" | "shipinhao" | "xiaohongshu"

type PlatformMeta = {
  id: PlatformId
  name: string
  icon: string
  color: string
  bg: string
}

type PlatformStats = {
  fans: number
  fansTrend: number
  views7d: number
  viewsTrend: number
  engagement7d: number
  engagementTrend: number
  gmv7d?: number
  gmvTrend?: number
}

type AuthState = Record<PlatformId, { authed: boolean; nickname?: string; avatar?: string; stats?: PlatformStats }>

const PLATFORMS: PlatformMeta[] = [
  { id: "douyin", name: "抖音", icon: "🎵", color: "text-slate-800 dark:text-slate-200", bg: "bg-slate-100 dark:bg-slate-800" },
  { id: "shipinhao", name: "视频号", icon: "📺", color: "text-green-700 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/30" },
  { id: "xiaohongshu", name: "小红书", icon: "📕", color: "text-rose-600 dark:text-rose-400", bg: "bg-rose-100 dark:bg-rose-900/30" },
]

const MOCK_STATS: PlatformStats = {
  fans: 12600,
  fansTrend: 3.2,
  views7d: 482000,
  viewsTrend: 12.5,
  engagement7d: 28400,
  engagementTrend: -2.1,
  gmv7d: 18500,
  gmvTrend: 8.7,
}

function formatNum(n: number): string {
  if (n >= 10000) return (n / 10000).toFixed(1) + "w"
  if (n >= 1000) return (n / 1000).toFixed(1) + "k"
  return String(n)
}

function TrendBadge({ value }: { value: number }) {
  const up = value >= 0
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-medium", up ? "text-emerald-600" : "text-rose-500")}>
      {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {Math.abs(value)}%
    </span>
  )
}

/* ------------------------------------------------------------------ */
/*  Auth Modal                                                          */
/* ------------------------------------------------------------------ */

function AuthModal({ platform, onClose }: { platform: PlatformMeta; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="mx-4 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl dark:bg-card" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">连接{platform.name}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-slate-100 dark:hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        <div className="text-center py-6">
          <span className="text-4xl">{platform.icon}</span>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            {platform.name} OAuth 授权功能开发中，即将支持一键连接
          </p>
          <p className="mt-2 text-[12px] text-slate-400">
            授权后可查看粉丝、播放量、互动等核心运营数据
          </p>
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground"
        >
          知道了
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Platform Card                                                       */
/* ------------------------------------------------------------------ */

function PlatformCard({
  platform,
  auth,
  onConnect,
}: {
  platform: PlatformMeta
  auth: AuthState[PlatformId]
  onConnect: () => void
}) {
  if (!auth.authed) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 p-5 transition-all hover:border-primary/40 hover:bg-primary/[0.02] dark:border-white/10 dark:bg-white/5">
        <span className="text-3xl">{platform.icon}</span>
        <p className="text-[13px] font-medium text-slate-600 dark:text-slate-400">{platform.name}</p>
        <button
          onClick={onConnect}
          className="inline-flex items-center gap-1 rounded-xl bg-primary px-4 py-1.5 text-[12px] font-medium text-primary-foreground transition-all hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" />
          连接
        </button>
      </div>
    )
  }

  const s = auth.stats!
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-white p-4 shadow-sm dark:bg-white/5", platform.bg)}>
      <div className="flex items-center gap-3 mb-3">
        <span className="text-2xl">{platform.icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold truncate">{auth.nickname || platform.name}</p>
          <p className="text-[11px] text-slate-400">已授权</p>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        <div>
          <div className="flex items-center gap-1 text-[11px] text-slate-400"><Users className="h-3 w-3" />粉丝</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-bold">{formatNum(s.fans)}</span>
            <TrendBadge value={s.fansTrend} />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-[11px] text-slate-400"><Eye className="h-3 w-3" />7日播放</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-bold">{formatNum(s.views7d)}</span>
            <TrendBadge value={s.viewsTrend} />
          </div>
        </div>
        <div>
          <div className="flex items-center gap-1 text-[11px] text-slate-400"><Heart className="h-3 w-3" />7日互动</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[15px] font-bold">{formatNum(s.engagement7d)}</span>
            <TrendBadge value={s.engagementTrend} />
          </div>
        </div>
        {s.gmv7d != null && (
          <div>
            <div className="flex items-center gap-1 text-[11px] text-slate-400"><DollarSign className="h-3 w-3" />7日GMV</div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-[15px] font-bold">{formatNum(s.gmv7d)}</span>
              <TrendBadge value={s.gmvTrend!} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                      */
/* ------------------------------------------------------------------ */

export function DashboardDataPanel() {
  const [authState, setAuthState] = React.useState<AuthState>({
    douyin: { authed: true, nickname: "老王的店", avatar: "", stats: MOCK_STATS },
    shipinhao: { authed: true, nickname: "老王实体店", avatar: "", stats: { ...MOCK_STATS, fans: 5800, fansTrend: 5.1, views7d: 210000, viewsTrend: -1.8, engagement7d: 9200, engagementTrend: 7.3 } },
    xiaohongshu: { authed: false },
  })
  const [modalPlatform, setModalPlatform] = React.useState<PlatformMeta | null>(null)

  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-[16px] font-bold text-foreground">平台数据</h2>
          <p className="text-[12px] text-slate-400">已连接 2 个平台 · 10 分钟前更新</p>
        </div>
        <button className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5">
          刷新数据
        </button>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {PLATFORMS.map((p) => (
          <PlatformCard
            key={p.id}
            platform={p}
            auth={authState[p.id]}
            onConnect={() => setModalPlatform(p)}
          />
        ))}
      </div>
      {modalPlatform && <AuthModal platform={modalPlatform} onClose={() => setModalPlatform(null)} />}
    </section>
  )
}

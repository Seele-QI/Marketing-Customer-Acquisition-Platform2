"use client"

import * as React from "react"
import { CheckCircle2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { getFastapiBase } from "@/lib/fastapi-base"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Account = {
  id: string
  platform: string
  nickname: string
  login_status: string
  created_at: number
}

type PlatformMeta = {
  id: string
  name: string
  icon: string
}

const PLATFORMS: PlatformMeta[] = [
  { id: "douyin", name: "抖音", icon: "🎵" },
  { id: "shipinhao", name: "视频号", icon: "📺" },
  { id: "xiaohongshu", name: "小红书", icon: "📕" },
]

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function AccountBinding() {
  const [accounts, setAccounts] = React.useState<Account[]>([])

  React.useEffect(() => {
    loadAccounts()
  }, [])

  const loadAccounts = async () => {
    const base = getFastapiBase()
    if (!base) {
      toast({ title: "缺少后端配置", description: "请配置 NEXT_PUBLIC_FASTAPI_URL", variant: "destructive" })
      return
    }
    try {
      const res = await fetch(`${base}/api/accounts/list`)
      if (res.ok) setAccounts((await res.json()) as Account[])
    } catch { /* silent */ }
  }

  const handleUnbind = async (accountId: string) => {
    const base = getFastapiBase()
    if (!base) {
      toast({ title: "缺少后端配置", description: "请配置 NEXT_PUBLIC_FASTAPI_URL", variant: "destructive" })
      return
    }
    try {
      const res = await fetch(`${base}/api/accounts/bind?id=${accountId}`, { method: "DELETE" })
      if (res.ok) {
        toast({ title: "已解绑" })
        loadAccounts()
      }
    } catch {
      toast({ title: "解绑失败", variant: "destructive" })
    }
  }

  const accountMap = new Map(accounts.map(a => [a.platform, a]))

  return (
    <div className="h-full overflow-y-auto bg-[#fafaf8] dark:bg-slate-950">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        {/* Header */}
        <header className="mb-8">
          <div className="mb-4 h-1 w-12 rounded-full bg-blue-500/60" />
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[34px] dark:text-slate-50">
            账号<span className="text-blue-500 dark:text-blue-400">绑定</span>
          </h1>
          <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">
            连接你的社交平台账号，获取真实运营数据
          </p>
        </header>

        {/* Platform Cards */}
        <section className="mb-6">
          <h2 className="mb-3 text-[15px] font-semibold text-slate-800 dark:text-slate-200">已绑定平台</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {PLATFORMS.map((p) => {
              const acc = accountMap.get(p.id)
              return (
                <div
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border p-4",
                    acc
                      ? "border-emerald-200/60 bg-emerald-50/30 dark:border-emerald-500/20 dark:bg-emerald-500/5"
                      : "border-slate-200/60 bg-white dark:border-white/10 dark:bg-white/5",
                  )}
                >
                  <span className="text-2xl">{p.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-slate-700 dark:text-slate-300">{p.name}</p>
                    {acc ? (
                      <p className="flex items-center gap-1 text-[11px] text-emerald-600">
                        <CheckCircle2 className="h-3 w-3" />已绑定
                      </p>
                    ) : (
                      <span
                        className={cn(
                          "mt-1 inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-medium",
                          "bg-slate-50 text-slate-400 cursor-not-allowed dark:bg-white/5 dark:text-slate-600",
                        )}
                      >
                        {p.id === "douyin" ? "扫码登录（暂未开放）" : "即将支持"}
                      </span>
                    )}
                  </div>
                  {acc && (
                    <button onClick={() => handleUnbind(acc.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        {/* Bind new account — under development */}
        <section className="flex min-h-[200px] items-center justify-center rounded-2xl border border-slate-200/60 bg-white p-8 dark:border-white/10 dark:bg-white/5">
          <p className="text-[18px] font-semibold text-slate-500 dark:text-slate-400">功能开发中！</p>
        </section>
      </div>
    </div>
  )
}

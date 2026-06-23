"use client"

import * as React from "react"
import { Link, Shield, CheckCircle2, Plus, Trash2, Loader2, QrCode, X } from "lucide-react"
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
  const [selectedPlatform, setSelectedPlatform] = React.useState<string>("douyin")
  const [cookieText, setCookieText] = React.useState("")
  const [isSaving, setIsSaving] = React.useState(false)
  const [showQrModal, setShowQrModal] = React.useState(false)
  const [qrBase64, setQrBase64] = React.useState("")
  const [qrSessionId, setQrSessionId] = React.useState("")
  const [qrStatus, setQrStatus] = React.useState<"idle" | "loading" | "scanned" | "done" | "error">("idle")

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

  const handleBind = async () => {
    if (!cookieText.trim()) {
      toast({ title: "请输入 Cookie 信息", variant: "destructive" })
      return
    }
    const base = getFastapiBase()
    if (!base) {
      toast({ title: "缺少后端配置", description: "请配置 NEXT_PUBLIC_FASTAPI_URL", variant: "destructive" })
      return
    }
    setIsSaving(true)
    try {
      const res = await fetch(`${base}/api/accounts/bind`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: selectedPlatform, cookieJson: cookieText.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "保存失败")
      toast({ title: "绑定成功", description: `${PLATFORMS.find(p => p.id === selectedPlatform)?.name} 账号已保存` })
      setCookieText("")
      loadAccounts()
    } catch (e) {
      toast({ title: "绑定失败", description: e instanceof Error ? e.message : "请重试", variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
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

  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  React.useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [])

  const handleQrLogin = async () => {
    const base = getFastapiBase()
    if (!base) { toast({ title: "缺少后端配置", variant: "destructive" }); return }
    // Cancel any existing poll
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setQrStatus("loading")
    setShowQrModal(true)
    try {
      const res = await fetch(`${base}/api/accounts/douyin/qrcode`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || "获取二维码失败")
      setQrBase64(data.qrcode_base64)
      setQrSessionId(data.session_id)
      setQrStatus("scanned")
      const poll = setInterval(async () => {
        try {
          const pr = await fetch(`${base}/api/accounts/douyin/qrcode/poll`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ session_id: data.session_id }),
          })
          const pd = await pr.json()
          if (pd.status === "done") {
            clearInterval(poll); setQrStatus("done"); pollRef.current = null
            toast({ title: "登录成功", description: "抖音账号已绑定" })
            setTimeout(() => { setShowQrModal(false); loadAccounts() }, 1500)
          } else if (pd.status === "error") {
            clearInterval(poll); setQrStatus("error"); pollRef.current = null
            toast({ title: "登录失败", description: pd.message, variant: "destructive" })
          }
        } catch { /* poll error */ }
      }, 2000)
      pollRef.current = poll
    } catch (e) {
      setQrStatus("error")
      toast({ title: "启动失败", description: e instanceof Error ? e.message : "请重试", variant: "destructive" })
    }
  }

  const handleCancelQr = async () => {
    const base = getFastapiBase()
    if (base && qrSessionId) {
      await fetch(`${base}/api/accounts/douyin/qrcode/cancel`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: qrSessionId }),
      }).catch(() => {})
    }
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setShowQrModal(false); setQrStatus("idle")
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
                      <button
                        onClick={p.id === "douyin" ? handleQrLogin : undefined}
                        disabled={p.id !== "douyin"}
                        className={cn(
                          "mt-1 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-medium transition-all",
                          p.id === "douyin"
                            ? "bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-400"
                            : "bg-slate-50 text-slate-300 cursor-not-allowed dark:bg-white/5 dark:text-slate-600",
                        )}
                      >
                        <QrCode className="h-3 w-3" />
                        {p.id === "douyin" ? "扫码登录" : "即将支持"}
                      </button>
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

        {/* Cookie Input */}
        <section className="rounded-2xl border border-slate-200/60 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <h2 className="mb-3 text-[15px] font-semibold text-slate-800 dark:text-slate-200">绑定新账号</h2>

          <div className="mb-3 flex gap-2">
            {PLATFORMS.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlatform(p.id)}
                className={cn(
                  "rounded-xl px-4 py-2 text-[13px] font-medium transition-all",
                  selectedPlatform === p.id
                    ? "bg-blue-500 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-400",
                )}
              >
                {p.icon} {p.name}
              </button>
            ))}
          </div>

          <div className="mb-4 rounded-xl border border-amber-200/60 bg-amber-50/50 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
            <details className="group">
              <summary className="cursor-pointer select-none text-[13px] font-semibold text-amber-800 dark:text-amber-300">
                如何获取 Cookie？点击展开详细图文教程
              </summary>
              <div className="mt-3 space-y-3 text-[12px] text-amber-700 dark:text-amber-400">
                <p className="font-medium">准备工作：在电脑上打开 Chrome 或 Edge 浏览器</p>

                <div className="rounded-lg border border-amber-200/60 bg-white/60 p-3 dark:border-amber-500/10 dark:bg-white/5">
                  <p className="mb-1 font-semibold">第 1 步：访问抖音创作者中心</p>
                  <p className="font-mono text-[11px]">地址栏输入 → <span className="bg-amber-100 px-1 rounded">https://creator.douyin.com/</span></p>
                  <p className="mt-0.5">用你的抖音号扫码登录（如已登录则跳过）</p>
                </div>

                <div className="rounded-lg border border-amber-200/60 bg-white/60 p-3 dark:border-amber-500/10 dark:bg-white/5">
                  <p className="mb-1 font-semibold">第 2 步：打开开发者工具</p>
                  <p className="mb-1">
                    键盘按 <span className="inline-block rounded bg-slate-200 px-1.5 py-0.5 font-mono text-[11px] font-bold dark:bg-slate-600">F12</span>
                    （或右键页面空白处 → 选「检查」）
                  </p>
                  <p>
                    顶部切换到 <span className="inline-block rounded bg-blue-100 px-1.5 py-0.5 text-[11px] font-semibold">Application</span>（应用）面板
                  </p>
                  <p className="mt-0.5">
                    左侧展开 <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] dark:bg-green-900">Cookies</span> → 点击
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[11px] dark:bg-green-900">https://creator.douyin.com</span>
                  </p>
                </div>

                <div className="rounded-lg border border-amber-200/60 bg-white/60 p-3 dark:border-amber-500/10 dark:bg-white/5">
                  <p className="mb-1 font-semibold">第 3 步：导出 Cookie</p>
                  <p className="mb-1">在 Cookies 列表<span className="font-bold">任意一行</span> → 右键 → 选择</p>
                  <p className="mb-2 text-center text-[14px] font-bold">「全部另存为 JSON」</p>
                  <p>保存后，用记事本打开该文件 → <span className="font-bold">Ctrl+A 全选 → Ctrl+C 复制全部内容</span> → 粘贴到下方输入框</p>
                </div>

                <div className="rounded-lg border border-emerald-200/60 bg-emerald-50/60 p-3 dark:border-emerald-500/10 dark:bg-emerald-500/5">
                  <p className="mb-1 font-semibold text-emerald-800 dark:text-emerald-300">安全说明</p>
                  <p className="text-emerald-700 dark:text-emerald-400">
                    Cookie 使用 AES-256 加密传输和存储，服务端仅保存加密后的密文，无法查看原始 Cookie。
                    绑定后可随时「解绑」删除数据。
                  </p>
                </div>
              </div>
            </details>
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-[12px] font-medium text-slate-500">Cookie (JSON 字符串)</label>
            <textarea
              rows={4}
              value={cookieText}
              onChange={(e) => setCookieText(e.target.value)}
              className="w-full resize-none rounded-xl border border-slate-200/60 bg-slate-50/50 px-3 py-2 font-mono text-[12px] focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/15 dark:border-white/5 dark:bg-white/5 dark:text-slate-200"
              placeholder='[{"name":"sessionid","value":"abc123","domain":".douyin.com"},...]'
            />
          </div>

          <button
            onClick={handleBind}
            disabled={isSaving || !cookieText.trim()}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-6 py-2.5 text-[14px] font-medium shadow-sm transition-all",
              cookieText.trim() && !isSaving
                ? "bg-blue-500 text-white hover:bg-blue-600"
                : "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-600",
            )}
          >
            {isSaving ? <><Loader2 className="h-4 w-4 animate-spin" />保存中…</> : <><Shield className="h-4 w-4" />加密并保存</>}
          </button>
        </section>
      </div>

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={handleCancelQr}>
          <div className="relative w-[360px] rounded-2xl bg-white p-6 shadow-2xl dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <button onClick={handleCancelQr} className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10">
              <X className="h-5 w-5" />
            </button>
            <div className="flex flex-col items-center gap-4">
              <h3 className="text-[16px] font-semibold text-slate-800 dark:text-slate-200">抖音扫码登录</h3>
              {qrStatus === "loading" && (
                <div className="flex flex-col items-center gap-2 py-10">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                  <p className="text-[13px] text-slate-500">正在获取二维码…</p>
                </div>
              )}
              {(qrStatus === "scanned" || qrStatus === "done") && qrBase64 && (
                <>
                  <img src={qrBase64} alt="抖音登录二维码" className="h-56 w-56 rounded-xl border" />
                  {qrStatus === "scanned" && (
                    <p className="text-[13px] font-medium text-blue-600">请用抖音 App 扫描二维码</p>
                  )}
                  {qrStatus === "done" && (
                    <div className="flex items-center gap-2 text-emerald-600">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="text-[14px] font-semibold">登录成功</span>
                    </div>
                  )}
                </>
              )}
              {qrStatus === "error" && (
                <div className="flex flex-col items-center gap-2 py-6">
                  <p className="text-[13px] text-red-500">获取二维码失败，请重试</p>
                  <button onClick={handleQrLogin} className="rounded-xl bg-blue-500 px-4 py-2 text-[13px] font-medium text-white">重新尝试</button>
                </div>
              )}
              <p className="text-[11px] text-slate-400">二维码有效期内扫码即可自动绑定</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

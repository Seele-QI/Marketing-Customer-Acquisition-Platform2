"use client"

import * as React from "react"
import { AlertCircle, Check, ChevronRight, ExternalLink, Loader2, LogOut, RefreshCw, X } from "lucide-react"

import { toast } from "@/hooks/use-toast"
import {
  DISTRIBUTION_ACCOUNTS_CHANGED_EVENT,
  getDistributionPlatformBrand,
  mergeDistributionPlatforms,
  readDistributionApiResponse,
  type DistributionCapability,
  type DistributionPlatform,
} from "@/lib/distribution/platforms"
import { cn } from "@/lib/utils"

const CREATOR_URLS: Record<string, string> = {
  douyin: "https://creator.douyin.com/",
  xiaohongshu: "https://creator.xiaohongshu.com/",
  kuaishou: "https://cp.kuaishou.com/",
  shipinhao: "https://channels.weixin.qq.com/",
  zhihu: "https://www.zhihu.com/creator/",
  weibo: "https://weibo.com/",
  dianping: "https://www.dianping.com/",
  ctrip: "https://you.ctrip.com/",
  sohu: "https://mp.sohu.com/",
  toutiao: "https://mp.toutiao.com/",
  baijiahao: "https://baijiahao.baidu.com/",
}

const COOKIE_HINTS: Record<string, string[]> = {
  douyin: ["sessionid", "passport_csrf_token", "ttwid"],
  xiaohongshu: ["web_session", "a1", "webId"],
  kuaishou: ["kuaishou.web.api_st", "passToken"],
  shipinhao: ["sessionid"],
  zhihu: ["z_c0"],
  weibo: ["SUB"],
  dianping: ["dper"],
  ctrip: ["cticket"],
  sohu: ["SUV"],
  toutiao: ["sessionid", "sid_tt"],
  baijiahao: ["BDUSS", "STOKEN"],
}

type AccountBindingProps = {
  variant?: "page" | "rail"
  capability?: DistributionCapability
  openRequest?: number
}

function PlatformLogo({ platformId, size = "md" }: { platformId: string; size?: "sm" | "md" | "lg" }) {
  const brand = getDistributionPlatformBrand(platformId)
  const dimensions = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10"
  return (
    <span className={cn("flex shrink-0 items-center justify-center overflow-hidden rounded-xl border border-black/5 bg-white p-1 shadow-sm", dimensions)}>
      {brand?.logo ? (
        // Official platform asset stored locally; keep its original proportions.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={brand.logo} alt={`${brand.name}图标`} className="h-full w-full object-contain" />
      ) : (
        <span className="text-xs font-bold" style={{ color: brand?.accent }}>{brand?.name.slice(0, 1)}</span>
      )}
    </span>
  )
}

function connectionLabel(platform: DistributionPlatform) {
  if (platform.connection_health === "service_error") return { text: "服务异常", className: "bg-red-50 text-red-600" }
  if (["expired", "invalid", "login_expired"].includes(platform.connection_health)) return { text: "登录失效", className: "bg-amber-50 text-amber-700" }
  if (platform.verification_status === "unverified") return { text: "需重新验证", className: "bg-amber-50 text-amber-700" }
  if (platform.connected) return { text: "已连接", className: "bg-emerald-50 text-emerald-700" }
  return { text: platform.release_status === "testing" ? "未绑定 · 内测" : "未绑定", className: "bg-slate-100 text-slate-600" }
}

export function AccountBinding({ variant = "page", capability = "video", openRequest = 0 }: AccountBindingProps) {
  const [platforms, setPlatforms] = React.useState<DistributionPlatform[]>(() => mergeDistributionPlatforms([], capability, false))
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState("")
  const [selectedPlatform, setSelectedPlatform] = React.useState<DistributionPlatform | null>(null)
  const [isConnecting, setIsConnecting] = React.useState(false)
  const [sessionId, setSessionId] = React.useState("")
  const [statusMessage, setStatusMessage] = React.useState("")
  const [loginStage, setLoginStage] = React.useState<"idle" | "opening" | "waiting" | "saving" | "success">("idle")
  const [error, setError] = React.useState("")
  const [manualMode, setManualMode] = React.useState(false)
  const [cookieInput, setCookieInput] = React.useState("")
  const pollingRef = React.useRef<number | null>(null)
  // Ignore an old request counter when this rail remounts after switching views.
  const handledOpenRequest = React.useRef(openRequest ?? 0)

  const loadPlatforms = React.useCallback(async (notify = false) => {
    setLoading(true)
    try {
      const response = await fetch("/api/connectors/platforms", { credentials: "include", cache: "no-store" })
      const result = await readDistributionApiResponse<{ platforms?: DistributionPlatform[] }>(response, "加载平台失败")
      if (!result.ok) throw new Error(result.message)
      setPlatforms(mergeDistributionPlatforms(result.data?.platforms ?? [], capability, false))
      setLoadError("")
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "账号服务暂时不可用，请稍后重试"
      setLoadError(message)
      setPlatforms(mergeDistributionPlatforms([], capability, true))
      if (notify) toast({ title: "加载平台失败", description: message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }, [capability])

  React.useEffect(() => {
    void loadPlatforms()
    return () => { if (pollingRef.current) clearTimeout(pollingRef.current) }
  }, [loadPlatforms])

  React.useEffect(() => {
    if (!openRequest || openRequest === handledOpenRequest.current) return
    handledOpenRequest.current = openRequest
    setSelectedPlatform(platforms.find((platform) => !platform.connected) ?? platforms[0] ?? null)
  }, [openRequest, platforms])

  const stopPolling = () => {
    if (pollingRef.current) clearTimeout(pollingRef.current)
    pollingRef.current = null
  }

  const closeModal = () => {
    stopPolling()
    if (sessionId) void fetch("/api/connectors/browser/cancel", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId }) })
    setSelectedPlatform(null)
    setManualMode(false)
    setCookieInput("")
    setSessionId("")
    setStatusMessage("")
    setLoginStage("idle")
    setError("")
    setIsConnecting(false)
  }

  const notifyAccountChange = async () => {
    await loadPlatforms()
    window.dispatchEvent(new Event(DISTRIBUTION_ACCOUNTS_CHANGED_EVENT))
  }

  const pollLoginStatus = (sid: string, platformId: string) => {
    stopPolling()
    let finished = false
    const startedAt = Date.now()
    const poll = async () => {
      const controller = new AbortController()
      const requestTimeout = window.setTimeout(() => controller.abort(), 12000)
      try {
        const response = await fetch("/api/connectors/browser/status", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sid, platform: platformId }), signal: controller.signal })
        const result = await readDistributionApiResponse<Record<string, unknown>>(response, "登录状态读取失败")
        if (!result.ok || !result.data) throw new Error(result.message)
        const data = result.data
        if (data.status === "success") {
          finished = true
          stopPolling()
          const accountInfo = data.account_info as { nickname?: string } | undefined
          if (!accountInfo?.nickname?.trim()) {
            setError("已检测到登录，但无法确认账号身份，请重新验证")
            setIsConnecting(false)
            return
          }
          setError("")
          setLoginStage("saving")
          setStatusMessage(`正在保存账号：${accountInfo.nickname}`)
          setIsConnecting(false)
          await notifyAccountChange()
          setLoginStage("success")
          setStatusMessage(`账号绑定成功：${accountInfo.nickname}`)
          toast({ title: "绑定成功", description: `账号：${accountInfo.nickname}` })
          setTimeout(closeModal, 800)
        } else if (["cancelled", "expired", "timeout", "error"].includes(String(data.status))) {
          finished = true
          stopPolling()
          const rawMessage = String(data.error || data.message || "登录未完成")
          setError(/Target page|BrowserContext|has been closed/i.test(rawMessage) ? "登录窗口已关闭，账号尚未完成验证" : rawMessage)
          setIsConnecting(false)
        } else if (data.status === "verifying") {
          setLoginStage("saving")
          setStatusMessage(String(data.message || "已检测到登录，正在确认账号昵称"))
          if (Date.now() - startedAt > 120000) throw new Error("账号身份确认超时，请重新打开登录窗口")
        } else {
          setLoginStage("waiting")
          setStatusMessage(`请在弹出的浏览器中完成登录（${Number(data.elapsed || 0)}s）`)
        }
      } catch (reason) {
        finished = true
        stopPolling()
        setError(reason instanceof DOMException && reason.name === "AbortError" ? "账号验证响应超时，请重新打开登录窗口" : reason instanceof Error ? reason.message : "连接断开，请重试")
        setIsConnecting(false)
      } finally {
        window.clearTimeout(requestTimeout)
        if (!finished) pollingRef.current = window.setTimeout(() => { void poll() }, 2000)
      }
    }
    void poll()
  }

  const handleBrowserLogin = async () => {
    if (!selectedPlatform) return
    setIsConnecting(true)
    setError("")
    setLoginStage("opening")
    setStatusMessage("正在启动浏览器…")
    try {
      const response = await fetch("/api/connectors/browser/start", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ platform: selectedPlatform.platform_id }) })
      const result = await readDistributionApiResponse<{ success?: boolean; session_id?: string; message?: string }>(response, "启动浏览器失败")
      const backendError = result.data && "error" in result.data ? String(result.data.error || "") : ""
      if (!result.ok || !result.data?.success || !result.data.session_id) throw new Error(backendError || result.message || "启动浏览器失败")
      setSessionId(result.data.session_id)
      setLoginStage("waiting")
      setStatusMessage(result.data.message || "请在弹出的浏览器窗口中完成登录")
      pollLoginStatus(result.data.session_id, selectedPlatform.platform_id)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "启动失败")
      setLoginStage("idle")
      setIsConnecting(false)
    }
  }

  const handleManualCookieSubmit = async () => {
    if (!selectedPlatform || !cookieInput.trim()) return setError("请输入 Cookie")
    setIsConnecting(true)
    setError("")
    try {
      const raw = cookieInput.trim()
      const body: Record<string, unknown> = { platform: selectedPlatform.platform_id }
      if (raw.startsWith("[") || raw.startsWith("{")) body.cookieJson = raw
      else {
        const credentials: Record<string, string> = {}
        raw.split(";").forEach((item) => { const [key, ...rest] = item.trim().split("="); if (key && rest.length) credentials[key] = rest.join("=") })
        body.credentials = credentials
      }
      const response = await fetch("/api/connectors/connect", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const result = await readDistributionApiResponse<{ success?: boolean }>(response, "保存失败")
      if (!result.ok || !result.data?.success) throw new Error(result.message || "保存失败")
      setManualMode(false)
      setCookieInput("")
      setStatusMessage("Cookie 已导入，正在打开浏览器验证账号身份")
      toast({ title: "Cookie 已导入", description: "请在登录窗口完成账号身份验证" })
      await handleBrowserLogin()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "保存失败")
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!selectedPlatform || !confirm(`确定解除 ${selectedPlatform.platform_name} 账号绑定吗？`)) return
    const response = await fetch(`/api/connectors/disconnect/${selectedPlatform.platform_id}`, { method: "POST", credentials: "include" })
    const result = await readDistributionApiResponse(response, "解绑失败")
    if (!result.ok) return setError(result.message)
    await notifyAccountChange()
    toast({ title: "已解除绑定" })
    closeModal()
  }

  const cards = platforms.map((platform) => {
    const brand = getDistributionPlatformBrand(platform.platform_id)
    const label = connectionLabel(platform)
    return (
      <button
        key={platform.platform_id}
        type="button"
        onClick={() => setSelectedPlatform(platform)}
        className={cn(
          "group border text-left transition-all hover:-translate-y-0.5 hover:shadow-md",
          variant === "rail" ? "min-w-[176px] rounded-2xl p-3 lg:min-w-0" : "rounded-2xl bg-white p-5",
          platform.connected ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-white",
        )}
      >
        <div className="flex items-center gap-3">
          <PlatformLogo platformId={platform.platform_id} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-sm font-bold text-slate-900">{platform.platform_name}</p>
              <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" />
            </div>
            <span className={cn("mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold", label.className)}>{label.text}</span>
            <p className="mt-1 truncate text-[11px] text-slate-500">{platform.connected ? `账号：${platform.account_info?.nickname}` : platform.verification_status === "unverified" ? "点击重新验证账号" : "点击立即绑定"}</p>
          </div>
        </div>
        {brand ? <div className="mt-3 h-0.5 w-full rounded-full opacity-40" style={{ background: brand.accent }} /> : null}
      </button>
    )
  })

  const modal = selectedPlatform ? (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal() }}>
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3"><PlatformLogo platformId={selectedPlatform.platform_id} size="lg" /><div><h3 className="text-lg font-bold text-slate-900">{selectedPlatform.connected ? `管理 ${selectedPlatform.platform_name}` : `绑定 ${selectedPlatform.platform_name}`}</h3><p className="mt-0.5 text-xs text-slate-500">账号数据仅保存在当前用户的加密空间</p></div></div>
          <button type="button" onClick={closeModal} className="rounded-full p-2 text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="max-h-[calc(100vh-9rem)] overflow-y-auto p-6">
          {error ? <div className="mb-4 flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{error}</span></div> : null}
          {isConnecting ? <div className="mb-4 rounded-xl border border-rose-100 bg-rose-50/70 p-4 text-center"><Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-rose-500" /><div className="mb-3 flex items-center justify-center gap-2 text-[10px] font-semibold text-slate-400"><span className={loginStage === "opening" ? "text-rose-500" : ""}>打开浏览器</span><span>·</span><span className={loginStage === "waiting" ? "text-rose-500" : ""}>等待扫码</span><span>·</span><span className={loginStage === "saving" ? "text-rose-500" : ""}>保存账号</span><span>·</span><span className={loginStage === "success" ? "text-emerald-600" : ""}>完成</span></div><p className="text-sm font-medium text-slate-800">{statusMessage}</p><p className="mt-1 text-xs text-slate-500">登录页跳转时系统会自动接管新页面，请勿手动关闭整个浏览器</p></div> : null}
          {manualMode ? <div><label className="mb-2 block text-sm font-semibold text-slate-700">Cookie JSON 或 Cookie 字符串</label><textarea value={cookieInput} onChange={(event) => setCookieInput(event.target.value)} rows={6} className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs outline-none focus:border-rose-300" placeholder='[{"name":"sessionid","value":"..."}]' /><p className="mt-2 text-[11px] text-slate-500">建议包含：{(COOKIE_HINTS[selectedPlatform.platform_id] || []).join("、")}</p><div className="mt-4 flex gap-2"><button type="button" onClick={handleManualCookieSubmit} disabled={!cookieInput.trim()} className="flex-1 rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:opacity-40">保存连接</button><button type="button" onClick={() => setManualMode(false)} className="rounded-xl border px-4 text-sm">返回</button></div></div> : <div>
            {selectedPlatform.connected ? <div className="mb-5 flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"><Check className="h-4 w-4" />当前账号已连接：{selectedPlatform.account_info?.nickname}</div> : <p className="mb-5 text-sm leading-6 text-slate-600">{selectedPlatform.verification_status === "unverified" ? "已有登录数据，但账号身份尚未验证。请重新打开登录窗口完成验证。" : "将打开本机可见浏览器，请完成扫码或登录。只有读取到真实账号昵称后才会绑定成功。"}</p>}
            <button type="button" onClick={handleBrowserLogin} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white hover:bg-slate-800"><RefreshCw className="h-4 w-4" />{selectedPlatform.connected ? "重新打开登录窗口" : error ? "重新打开登录窗口" : "打开登录窗口"}</button>
            {!selectedPlatform.connected ? <details className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2"><summary className="cursor-pointer text-center text-xs text-slate-500">高级登录方式</summary><button type="button" onClick={() => setManualMode(true)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white py-2 text-xs text-slate-600">手动粘贴 Cookie</button></details> : null}
            <a href={CREATOR_URLS[selectedPlatform.platform_id]} target="_blank" rel="noreferrer" className="mt-3 flex items-center justify-center gap-1 py-2 text-xs text-slate-500 hover:text-slate-800">打开创作者中心 <ExternalLink className="h-3 w-3" /></a>
            {selectedPlatform.connected ? <button type="button" onClick={handleDisconnect} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"><LogOut className="h-4 w-4" />解除绑定</button> : null}
          </div>}
        </div>
      </div>
    </div>
  ) : null

  if (variant === "rail") return (
    <div className="border-b border-slate-200 bg-[#f7f8f6] px-4 py-4 lg:h-full lg:w-[280px] lg:overflow-y-auto lg:border-b-0 lg:border-r lg:px-4 lg:py-8">
      <div className="mb-3 flex items-center justify-between"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-rose-500">账号矩阵</p><h2 className="mt-1 text-base font-bold text-slate-900">发布平台</h2></div><button type="button" onClick={() => void loadPlatforms(true)} className="rounded-lg p-2 text-slate-400 hover:bg-white hover:text-slate-700" title="刷新账号状态"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} /></button></div>
      {loadError ? <div className="mb-3 rounded-xl border border-red-100 bg-red-50 p-2.5 text-[11px] leading-4 text-red-700">{loadError}</div> : null}
      <div className="flex gap-3 overflow-x-auto pb-2 lg:flex-col lg:overflow-visible">{cards}</div>
      <button type="button" onClick={() => setSelectedPlatform(platforms[0] ?? null)} className="mt-3 w-full rounded-xl border border-dashed border-slate-300 bg-white/60 py-2.5 text-xs font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-600">管理全部账号</button>
      <p className="mt-4 hidden text-[11px] leading-5 text-slate-400 lg:block">按发布顺序逐个平台登录，降低同时打开多个创作者后台带来的风控风险。</p>
      {modal}
    </div>
  )

  return <div className="h-full overflow-y-auto bg-[#fafaf8] p-5 sm:p-8"><div className="mx-auto max-w-5xl"><div className="mb-8 h-1 w-12 rounded-full bg-blue-500" /><h1 className="text-3xl font-bold">账号<span className="text-blue-500">绑定</span></h1><p className="mt-2 text-sm text-slate-500">管理各平台登录状态，登录过期时可直接刷新浏览器登录。</p>{loadError ? <div className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{loadError}</div> : null}<div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards}</div></div>{modal}</div>
}

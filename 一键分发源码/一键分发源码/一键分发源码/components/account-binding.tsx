"use client"

import * as React from "react"
import {
  AlertCircle,
  Check,
  ChevronRight,
  ExternalLink,
  Globe,
  Loader2,
  LogOut,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"

type Platform = {
  platform_id: string
  platform_name: string
  supports_oauth: boolean
  status: string
  connected: boolean
  account_info?: { nickname?: string } | null
}

const PLATFORM_ICONS: Record<string, string> = {
  douyin: "🎵",
  xiaohongshu: "📕",
  kuaishou: "⚡",
  shipinhao: "📺",
}

const BROWSER_PLATFORMS = new Set(["douyin", "xiaohongshu", "kuaishou", "shipinhao"])

const COOKIE_HINTS: Record<string, string[]> = {
  douyin: ["sessionid", "passport_csrf_token", "ttwid"],
  xiaohongshu: ["web_session", "a1", "webId"],
  kuaishou: ["kuaishou.web.api_st", "passToken", "kuaishou.server.web_st"],
  shipinhao: ["sessionid"],
}

const CREATOR_URLS: Record<string, string> = {
  douyin: "https://creator.douyin.com/",
  xiaohongshu: "https://creator.xiaohongshu.com/",
  kuaishou: "https://cp.kuaishou.com/",
  shipinhao: "https://channels.weixin.qq.com/",
}

/** 保证 UI 始终展示四个平台（API 未重启时也能看到快手） */
const DEFAULT_PLATFORMS: Platform[] = [
  {
    platform_id: "douyin",
    platform_name: "抖音",
    supports_oauth: false,
    status: "disconnected",
    connected: false,
    account_info: null,
  },
  {
    platform_id: "xiaohongshu",
    platform_name: "小红书",
    supports_oauth: false,
    status: "disconnected",
    connected: false,
    account_info: null,
  },
  {
    platform_id: "kuaishou",
    platform_name: "快手",
    supports_oauth: false,
    status: "disconnected",
    connected: false,
    account_info: null,
  },
  {
    platform_id: "shipinhao",
    platform_name: "视频号",
    supports_oauth: false,
    status: "disconnected",
    connected: false,
    account_info: null,
  },
]

function mergePlatforms(fromApi: Platform[]): Platform[] {
  const byId = new Map(fromApi.map((p) => [p.platform_id, p]))
  return DEFAULT_PLATFORMS.map((def) => byId.get(def.platform_id) ?? def)
}

function parseApiError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback
  const d = data as Record<string, unknown>
  if (typeof d.error === "string" && d.error) return d.error
  if (typeof d.detail === "string" && d.detail) return d.detail
  const detail = d.detail
  if (detail && typeof detail === "object" && "message" in detail) {
    const msg = (detail as { message?: string }).message
    if (msg) return msg
  }
  return fallback
}

export function AccountBinding() {
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [loading, setLoading] = React.useState(true)
  const [selectedPlatform, setSelectedPlatform] = React.useState<Platform | null>(null)
  const [isConnecting, setIsConnecting] = React.useState(false)
  const [sessionId, setSessionId] = React.useState("")
  const [statusMessage, setStatusMessage] = React.useState("")
  const [error, setError] = React.useState("")
  const [manualMode, setManualMode] = React.useState(false)
  const [cookieInput, setCookieInput] = React.useState("")
  const pollingRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  const loadPlatforms = React.useCallback(async () => {
    try {
      const res = await fetch("/api/connectors/platforms", { credentials: "include", cache: "no-store" })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail?.message || data.detail || "加载失败")
      setPlatforms(mergePlatforms(Array.isArray(data.platforms) ? data.platforms : []))
    } catch (e) {
      toast({
        title: "加载平台失败",
        description: e instanceof Error ? e.message : "请确认已登录且 pnpm dev:api 已启动",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadPlatforms()
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [loadPlatforms])

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  const closeModal = () => {
    stopPolling()
    if (sessionId) {
      void fetch("/api/connectors/browser/cancel", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId }),
      })
    }
    setSelectedPlatform(null)
    setManualMode(false)
    setCookieInput("")
    setSessionId("")
    setStatusMessage("")
    setError("")
    setIsConnecting(false)
  }

  const openModal = (platform: Platform) => {
    stopPolling()
    setSelectedPlatform(platform)
    setError("")
    setStatusMessage("")
    setSessionId("")
    setManualMode(false)
    setCookieInput("")
    setIsConnecting(false)
  }

  const pollLoginStatus = (sid: string, platformId: string) => {
    stopPolling()
    pollingRef.current = setInterval(async () => {
      try {
        const statusRes = await fetch("/api/connectors/browser/status", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_id: sid, platform: platformId }),
        })
        const statusData = await statusRes.json()
        if (statusData.status === "success") {
          stopPolling()
          setStatusMessage("登录成功，账号已保存")
          setIsConnecting(false)
          toast({ title: "绑定成功", description: `${platformId} 已连接` })
          await loadPlatforms()
          setTimeout(closeModal, 1200)
        } else if (["cancelled", "expired", "timeout", "error"].includes(statusData.status)) {
          stopPolling()
          setError(statusData.error || statusData.message || "登录未完成")
          setIsConnecting(false)
        } else {
          setStatusMessage(`请在弹出的浏览器中完成登录… (${statusData.elapsed || 0}s)`)
        }
      } catch {
        stopPolling()
        setError("连接断开，请重试")
        setIsConnecting(false)
      }
    }, 2000)
  }

  const handleBrowserLogin = async () => {
    if (!selectedPlatform) return
    setIsConnecting(true)
    setError("")
    setStatusMessage("正在启动浏览器…")
    try {
      const res = await fetch("/api/connectors/browser/start", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform: selectedPlatform.platform_id }),
      })
      const data = await res.json()
      if (!data.success) {
        const err = parseApiError(data, "启动浏览器失败")
        throw new Error(
          err.includes("不支持的平台") && selectedPlatform.platform_id === "kuaishou"
            ? `${err}。请重启后端：在项目目录执行 pnpm dev:api 后再试`
            : err,
        )
      }
      setSessionId(data.session_id)
      setStatusMessage(data.message || "请在弹出的浏览器窗口中完成登录")
      pollLoginStatus(data.session_id, selectedPlatform.platform_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : "启动失败")
      setIsConnecting(false)
    }
  }

  const handleManualCookieSubmit = async () => {
    if (!selectedPlatform || !cookieInput.trim()) {
      setError("请输入 Cookie")
      return
    }
    setIsConnecting(true)
    setError("")
    try {
      let body: Record<string, unknown>
      const raw = cookieInput.trim()
      if (raw.startsWith("[") || raw.startsWith("{")) {
        body = { platform: selectedPlatform.platform_id, cookieJson: raw }
      } else {
        const credentials: Record<string, string> = {}
        raw.split(";").forEach((item) => {
          const [key, ...rest] = item.trim().split("=")
          if (key && rest.length) credentials[key.trim()] = rest.join("=").trim()
        })
        body = { platform: selectedPlatform.platform_id, credentials }
      }
      const res = await fetch("/api/connectors/connect", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.success) throw new Error(parseApiError(data, "保存失败"))
      toast({ title: "绑定成功" })
      await loadPlatforms()
      closeModal()
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败")
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async (platformId: string) => {
    if (!confirm("确定要断开连接吗？")) return
    try {
      await fetch(`/api/connectors/disconnect/${platformId}`, {
        method: "POST",
        credentials: "include",
      })
      toast({ title: "已解绑" })
      await loadPlatforms()
      closeModal()
    } catch {
      toast({ title: "解绑失败", variant: "destructive" })
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-[#fafaf8] dark:bg-slate-950">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
        <header className="mb-8">
          <div className="mb-4 h-1 w-12 rounded-full bg-blue-500/60" />
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[34px] dark:text-slate-50">
            账号<span className="text-blue-500 dark:text-blue-400">绑定</span>
          </h1>
          <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">
            「已连接」只表示库里有 Cookie。若发布时又出现扫码页，说明登录已过期——请点该平台 → 断开 → 再「浏览器登录」，直到创作者中心首页出现再保存。
          </p>
        </header>

        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            加载平台…
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {platforms.map((platform) => (
              <button
                key={platform.platform_id}
                type="button"
                onClick={() => openModal(platform)}
                className={cn(
                  "group rounded-2xl border p-5 text-left transition-all hover:shadow-md",
                  platform.connected
                    ? "border-emerald-200/70 bg-emerald-50/40 dark:border-emerald-500/20 dark:bg-emerald-500/5"
                    : "border-slate-200/60 bg-white dark:border-white/10 dark:bg-white/5",
                )}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-3xl">{PLATFORM_ICONS[platform.platform_id] || "🔗"}</span>
                  {platform.connected ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300">
                      已连接
                    </span>
                  ) : null}
                </div>
                <p className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">
                  {platform.platform_name}
                </p>
                <p className="mt-1 text-[12px] text-slate-500">
                  {platform.connected
                    ? platform.account_info?.nickname
                      ? `@${platform.account_info.nickname}`
                      : "点击管理连接"
                    : "点击连接"}
                  <ChevronRight className="ml-0.5 inline h-3 w-3" />
                </p>
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 flex items-start gap-2 rounded-xl border border-blue-200/60 bg-blue-50/50 p-3 text-[12px] text-blue-800 dark:border-blue-500/20 dark:bg-blue-500/5 dark:text-blue-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            点击「浏览器登录」会在本机弹出 Chromium 窗口，完成扫码后自动保存 Cookie（AES 加密）。
            需保持 <code className="rounded bg-blue-100/80 px-1 dark:bg-blue-500/10">pnpm dev:api</code> 运行。
          </p>
        </div>
      </div>

      {selectedPlatform && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4 dark:border-white/10">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{PLATFORM_ICONS[selectedPlatform.platform_id]}</span>
                <div>
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">
                    {selectedPlatform.connected ? "管理连接" : `连接 ${selectedPlatform.platform_name}`}
                  </h3>
                  {selectedPlatform.connected && (
                    <p className="flex items-center gap-1 text-xs text-emerald-600">
                      <Check className="h-3 w-3" /> 已连接
                    </p>
                  )}
                </div>
              </div>
              <button type="button" onClick={closeModal} className="rounded-full p-1 hover:bg-slate-100 dark:hover:bg-white/10">
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            <div className="p-6">
              {error && (
                <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-600 dark:bg-red-500/10">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="whitespace-pre-wrap">{error}</span>
                </div>
              )}

              {selectedPlatform.connected ? (
                <div>
                  <p className="mb-6 text-sm text-slate-600 dark:text-slate-400">连接正常，可用于一键分发全自动发布。</p>
                  <button
                    type="button"
                    onClick={() => handleDisconnect(selectedPlatform.platform_id)}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 py-3 font-medium text-red-600 hover:bg-red-50 dark:border-red-500/30"
                  >
                    <LogOut className="h-4 w-4" /> 断开连接
                  </button>
                </div>
              ) : manualMode ? (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">
                    粘贴凭证（Cookie JSON / 开放平台 OAuth JSON）
                  </label>
                  <textarea
                    value={cookieInput}
                    onChange={(e) => setCookieInput(e.target.value)}
                    rows={5}
                    className="mb-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs dark:border-white/10 dark:bg-white/5"
                    placeholder='[{"name":"sessionid","value":"..."}] 或 {"open_id":"...","access_token":"act..."}'
                  />
                  <p className="mb-4 text-[11px] text-slate-500">
                    浏览器 Cookie 建议包含: {(COOKIE_HINTS[selectedPlatform.platform_id] || []).join(", ")}。
                    开放平台（参考 douyin-master）可粘贴 open_id + access_token，发布走 API、无需手机验证。
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleManualCookieSubmit}
                      disabled={isConnecting || !cookieInput.trim()}
                      className="flex-1 rounded-xl bg-blue-500 py-2.5 text-sm font-medium text-white hover:bg-blue-600 disabled:opacity-50"
                    >
                      {isConnecting ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "保存连接"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setManualMode(false)}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm dark:border-white/10"
                    >
                      返回
                    </button>
                  </div>
                </div>
              ) : isConnecting ? (
                <div className="py-6 text-center">
                  <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-blue-500" />
                  <p className="font-medium text-slate-800 dark:text-slate-200">{statusMessage}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    登录成功后窗口会自动关闭并保存。
                    {selectedPlatform?.platform_id === "douyin" ? (
                      <> 若页面空白，请等待几秒自动刷新；仍无扫码框可点右上角「登录」，或关闭浏览器后重新点「浏览器登录」。</>
                    ) : selectedPlatform?.platform_id === "kuaishou" ? (
                      <> 请用快手 App 扫描页面上的二维码；登录成功后会自动跳转到创作者中心并保存。</>
                    ) : selectedPlatform?.platform_id === "xiaohongshu" ? (
                      <> 请用小红书 App 扫码登录；进入创作者中心后窗口会自动关闭并保存。</>
                    ) : selectedPlatform?.platform_id === "shipinhao" ? (
                      <> 请用微信扫码登录视频号助手；进入 platform 后台后窗口会自动关闭并保存。</>
                    ) : null}
                  </p>
                </div>
              ) : (
                <div className="py-2 text-center">
                  <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-500/10">
                    <Globe className="h-10 w-10 text-blue-500" />
                  </div>
                  {BROWSER_PLATFORMS.has(selectedPlatform.platform_id) ? (
                    <button
                      type="button"
                      onClick={handleBrowserLogin}
                      className="mb-3 w-full rounded-xl bg-blue-500 py-3 font-medium text-white hover:bg-blue-600"
                    >
                      浏览器登录（推荐）
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setManualMode(true)}
                    className="mb-3 w-full rounded-xl border border-slate-200 py-3 text-sm font-medium text-slate-700 dark:border-white/10 dark:text-slate-300"
                  >
                    手动粘贴 Cookie
                  </button>
                  <a
                    href={CREATOR_URLS[selectedPlatform.platform_id] || "https://cp.kuaishou.com/"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    打开创作者中心 <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

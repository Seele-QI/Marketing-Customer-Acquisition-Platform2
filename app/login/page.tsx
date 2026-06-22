"use client"

import { useEffect, useState, Suspense } from "react"
import { useSearchParams } from "next/navigation"
import { Mail, Loader2, Sparkles, ArrowLeft, AlertCircle, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import Link from "next/link"
import { useAuth } from "@/lib/auth-context"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** 登录页核心 — 必须在 Suspense 内使用 useSearchParams */
function LoginForm() {
  const auth = useAuth()
  const params = useSearchParams()
  const redirectTo = params.get("redirect") || "/"

  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)

  // ── 已登录 → 自动跳转（硬跳转，避免 SPA router 竞态）──
  useEffect(() => {
    if (auth.status === "authenticated") {
      window.location.replace(redirectTo)
    }
  }, [auth.status, redirectTo])

  // ── 重发倒计时 ──────────────────────────────────────────
  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // ── 发送验证码 ──────────────────────────────────────────
  const sendCode = async () => {
    setError(null)
    if (!EMAIL_RE.test(email)) {
      setError("请输入有效的邮箱地址")
      return
    }
    setSending(true)
    try {
      const r = await fetch("/api/auth/send-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      })
      const data = await r.json()
      if (data.success) {
        setStep("code")
        setCode("")
        setError(null)
        setCooldown(60)
      } else {
        setError(data.message || "发送失败，请稍后再试")
      }
    } catch {
      setError("网络错误，请检查网络连接后重试")
    } finally {
      setSending(false)
    }
  }

  // ── 验证并登录 ──────────────────────────────────────────
  const verifyCode = async () => {
    if (code.length !== 6) return
    setError(null)
    setVerifying(true)
    try {
      const r = await fetch("/api/auth/verify-code", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, code }),
        credentials: "include",
      })
      const data = await r.json().catch(() => ({}))
      if (r.ok) {
        // 让 UserProvider 拉一次 /api/auth/me
        await auth.refresh()
        // 触发上面 useEffect 的硬跳转
      } else {
        const detail = (data && (data.detail || data.message)) as
          | { message?: string; code?: string }
          | string
          | undefined
        let msg = "验证码错误或已过期"
        if (typeof detail === "string") msg = detail
        else if (detail && typeof detail === "object" && detail.message) msg = detail.message
        setError(msg)
        setCode("")
      }
    } catch {
      setError("网络错误，请检查网络连接后重试")
    } finally {
      setVerifying(false)
    }
  }

  // ── 回到邮箱步骤 ────────────────────────────────────────
  const backToEmail = () => {
    setStep("email")
    setError(null)
    setCode("")
  }

  // ── loading 态 ──────────────────────────────────────────
  if (auth.status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // ── 已登录（跳转由 useEffect 处理，这里显示 loading）──
  if (auth.status === "authenticated") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {/* 卡片容器 */}
      <div className="w-full max-w-md">
        {/* 顶部导航 */}
        <div className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            返回首页
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 soft-shadow-lg">
          {/* 标题区 */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              欢迎登录 AgentHub
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              AI 超级个体工作台
            </p>
          </div>

          {/* Step 1: 输入邮箱 */}
          {step === "email" && (
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="login-email" className="text-sm font-medium">
                  邮箱地址
                </Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    if (error) setError(null)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !sending) sendCode()
                  }}
                  autoFocus
                  autoComplete="email"
                  className="h-11"
                />
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                className="w-full h-11 text-sm font-medium"
                onClick={sendCode}
                disabled={sending || !email}
              >
                {sending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    发送中…
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    发送验证码
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Step 2: 输入验证码 */}
          {step === "code" && (
            <div className="space-y-5">
              <div className="rounded-lg border border-border bg-accent/30 p-3 text-center text-sm">
                验证码已发送至{" "}
                <span className="font-mono font-medium text-foreground">{email}</span>
                <button
                  type="button"
                  onClick={backToEmail}
                  className="ml-2 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  换邮箱
                </button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="login-code" className="text-sm font-medium">
                  6 位验证码
                </Label>
                <div className="flex justify-center py-2">
                  <InputOTP
                    id="login-code"
                    maxLength={6}
                    value={code}
                    onChange={(v) => {
                      // input-otp 的 pattern 会在每次输入后正则匹配整段值,
                      // 用 ^\d*$ 才能接受「任意长度的纯数字」(默认 ^.*$ 会接受字母)
                      if (v && !/^\d*$/.test(v)) return
                      setCode(v)
                      if (error) setError(null)
                    }}
                    inputMode="numeric"
                    autoFocus
                  >
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  5 分钟内有效。打开邮箱查收。
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                className="w-full h-11 text-sm font-medium"
                onClick={verifyCode}
                disabled={verifying || code.length !== 6}
              >
                {verifying ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    登录中…
                  </>
                ) : (
                  "登录"
                )}
              </Button>

              <Button
                variant="ghost"
                className="w-full"
                disabled={cooldown > 0}
                onClick={sendCode}
              >
                {cooldown > 0 ? `${cooldown}s 后重新发送` : "重新发送验证码"}
              </Button>
            </div>
          )}

          {/* 底部提示 */}
          <p className="mt-6 text-center text-xs text-muted-foreground">
            未注册账号登录后自动创建，并赠送 100 积分
          </p>
        </div>
      </div>
    </div>
  )
}

/** 页面入口 — 用 Suspense 包裹，因为 useSearchParams 要求 */
export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}

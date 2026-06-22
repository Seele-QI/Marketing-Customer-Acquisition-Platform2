"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut, LogIn, ChevronUp, Coins, Loader2, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function UserMenu() {
  const auth = useAuth()
  const router = useRouter()
  const [openLogin, setOpenLogin] = useState(false)
  const [openMenu, setOpenMenu] = useState(false)
  const [step, setStep] = useState<"email" | "code">("email")
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [sending, setSending] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  useEffect(() => {
    if (!openMenu) return
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest("[data-user-menu]")) setOpenMenu(false)
    }
    document.addEventListener("click", close)
    return () => document.removeEventListener("click", close)
  }, [openMenu])

  // 登录成功后 auth 变 authenticated,关闭 dialog
  useEffect(() => {
    if (auth.status === "authenticated" && openLogin) setOpenLogin(false)
  }, [auth.status, openLogin])

  const reset = () => {
    setStep("email")
    setEmail("")
    setCode("")
    setCooldown(0)
  }

  const sendCode = async () => {
    if (!EMAIL_RE.test(email)) {
      toast.error("请输入有效邮箱地址")
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
        setCooldown(60)
      } else {
        toast.error(data.message || "发送失败，请稍后再试")
      }
    } catch {
      toast.error("网络错误")
    } finally {
      setSending(false)
    }
  }

  const verifyCode = async () => {
    if (code.length !== 6) return
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
        await auth.refresh()
        // useEffect 关 dialog
      } else {
        const detail = (data && (data.detail || data.message)) as
          | { message?: string; code?: string }
          | string
          | undefined
        let msg = "验证码错误或已过期"
        if (typeof detail === "string") msg = detail
        else if (detail && typeof detail === "object" && detail.message) msg = detail.message
        toast.error(msg)
        setCode("")
      }
    } catch {
      toast.error("网络错误")
    } finally {
      setVerifying(false)
    }
  }

  const onLogout = async () => {
    setOpenMenu(false)
    await auth.logout()
    toast.success("已退出登录")
    router.refresh()
  }

  // ── loading ──
  if (auth.status === "loading") {
    return (
      <div className="m-3 rounded-xl border border-sidebar-border bg-card p-3 soft-shadow">
        <div className="flex h-9 items-center gap-3 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>加载中…</span>
        </div>
      </div>
    )
  }

  // ── unauthenticated ──
  if (auth.status === "unauthenticated") {
    return (
      <>
        <div className="m-3" data-user-menu>
          <Button
            variant="outline"
            className="w-full justify-center gap-2"
            size="sm"
            onClick={() => setOpenLogin(true)}
          >
            <LogIn className="h-4 w-4" />
            登录 / 注册
          </Button>
        </div>
        <Dialog
          open={openLogin}
          onOpenChange={(o) => {
            setOpenLogin(o)
            if (!o) reset()
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>邮箱登录</DialogTitle>
              <DialogDescription>未注册账号登录后自动创建，并赠送 100 积分。</DialogDescription>
            </DialogHeader>

            {step === "email" ? (
              <>
                <div className="space-y-4 py-2">
                  <div className="space-y-2">
                    <Label htmlFor="um-email">邮箱</Label>
                    <Input
                      id="um-email"
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !sending) sendCode()
                      }}
                      autoFocus
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={sendCode} disabled={sending || !email}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "发送验证码"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <div className="space-y-4 py-2">
                <div className="rounded-md border border-border bg-accent/30 p-2.5 text-center text-xs">
                  验证码已发送至{" "}
                  <span className="font-mono font-medium">{email}</span>
                  <button
                    type="button"
                    className="ml-1.5 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                    onClick={() => {
                      setStep("email")
                      setCode("")
                    }}
                  >
                    换邮箱
                  </button>
                </div>
                <div className="flex justify-center py-1">
                  <InputOTP
                    maxLength={6}
                    value={code}
                    onChange={(v) => {
                      if (v && !/^\d*$/.test(v)) return
                      setCode(v)
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
                <p className="text-center text-xs text-muted-foreground">5 分钟内有效</p>
                <DialogFooter className="flex-col gap-2 sm:flex-col">
                  <Button onClick={verifyCode} disabled={verifying || code.length !== 6} className="w-full">
                    {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "登录"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={cooldown > 0}
                    onClick={sendCode}
                    className="w-full"
                  >
                    {cooldown > 0 ? `${cooldown}s 后重新发送` : "重新发送验证码"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </>
    )
  }

  // ── authenticated ──
  const local = auth.user.email_masked.split("@")[0]
  const avatar = (local[0] || "?") + (local.slice(-1) || "")
  return (
    <div className="m-3" data-user-menu>
      <button
        type="button"
        onClick={() => setOpenMenu((o) => !o)}
        className="flex w-full items-center gap-3 rounded-xl border border-sidebar-border bg-card p-3 text-left transition-colors hover:bg-accent/40 soft-shadow"
      >
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {avatar.toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-foreground">{auth.user.email_masked}</p>
          <p className="flex items-center gap-1 truncate text-[11px] text-muted-foreground">
            <Coins className="h-3 w-3 text-amber-500" />
            <span className="tabular-nums">{auth.balance}</span>
            <span>积分</span>
          </p>
        </div>
        <ChevronUp
          className={`h-4 w-4 text-muted-foreground transition-transform ${openMenu ? "" : "rotate-180"}`}
        />
      </button>

      {openMenu && (
        <div className="mt-2 rounded-xl border border-sidebar-border bg-card p-2 soft-shadow">
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
          >
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      )}
    </div>
  )
}

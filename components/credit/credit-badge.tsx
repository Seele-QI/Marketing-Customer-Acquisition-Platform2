"use client"

import { useEffect, useState } from "react"
import { Coins, Loader2, Mail } from "lucide-react"
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

export function CreditBadge() {
  const auth = useAuth()
  const [open, setOpen] = useState(false)
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

  // 登录成功后父组件 auth.status 变 authenticated,整段 credit badge 切到积分视图,dialog 不需要主动关
  useEffect(() => {
    if (auth.status === "authenticated" && open) setOpen(false)
  }, [auth.status, open])

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

  // ── loading ──
  if (auth.status === "loading") {
    return (
      <div className="flex h-9 w-24 items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  // ── unauthenticated ──
  if (auth.status === "unauthenticated") {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          登录
        </Button>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
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
                    <Label htmlFor="cb-email">邮箱</Label>
                    <Input
                      id="cb-email"
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
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-sm">
      <Coins className="h-3.5 w-3.5 text-amber-500" />
      <span className="font-medium tabular-nums">{auth.balance}</span>
      <span className="text-xs text-muted-foreground">积分</span>
    </div>
  )
}

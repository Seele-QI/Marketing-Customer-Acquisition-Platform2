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
import { toast } from "sonner"

type Me = { user: { id: number; email_masked: string }; balance: number } | null | undefined

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function CreditBadge() {
  const [me, setMe] = useState<Me>(undefined)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  const refresh = async () => {
    setLoading(true)
    try {
      const r = await fetch("/api/auth/me", { credentials: "include" })
      if (r.status === 401) {
        setMe(null)
      } else if (r.ok) {
        setMe((await r.json()) as Me)
      } else {
        setMe(null)
      }
    } catch {
      setMe(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const sendLink = async () => {
    if (!EMAIL_RE.test(email)) {
      toast.error("请输入有效邮箱地址")
      return
    }
    setSending(true)
    try {
      const r = await fetch("/api/auth/send-link", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      })
      if (r.ok) {
        setSent(true)
        setCooldown(60)
        toast.success("登录链接已发送到你的邮箱")
      } else {
        toast.error("发送失败，请稍后再试")
      }
    } catch {
      toast.error("网络错误")
    } finally {
      setSending(false)
    }
  }

  if (me === undefined) {
    return (
      <div className="flex h-9 w-24 items-center justify-center text-xs text-muted-foreground">
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
      </div>
    )
  }

  if (me === null) {
    return (
      <>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          登录
        </Button>
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) {
              setSent(false)
              setEmail("")
              setCooldown(0)
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>邮箱登录</DialogTitle>
              <DialogDescription>未注册账号登录后自动创建，并赠送 100 积分。</DialogDescription>
            </DialogHeader>
            {sent ? (
              <div className="space-y-3 py-4 text-center">
                <Mail className="mx-auto h-10 w-10 text-primary" />
                <p className="text-sm">
                  登录链接已发送到 <span className="font-mono">{email}</span>
                </p>
                <p className="text-xs text-muted-foreground">15 分钟内有效。点击邮件中的链接即可登录。</p>
                <Button variant="outline" size="sm" disabled={cooldown > 0} onClick={sendLink}>
                  {cooldown > 0 ? `${cooldown}s 后重发` : "重新发送"}
                </Button>
              </div>
            ) : (
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
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={sendLink} disabled={sending}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "发送登录链接"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </>
    )
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-sm">
      <Coins className="h-3.5 w-3.5 text-amber-500" />
      <span className="font-medium tabular-nums">{me.balance}</span>
      <span className="text-xs text-muted-foreground">积分</span>
    </div>
  )
}
"use client"

import * as React from "react"
import { CheckCircle2, Loader2, Smartphone } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = {
  onSuccess: () => void | Promise<void>
}

export function AdminPhoneLoginPanel({ onSuccess }: Props) {
  const [phone, setPhone] = React.useState("")
  const [code, setCode] = React.useState("")
  const [sending, setSending] = React.useState(false)
  const [verifying, setVerifying] = React.useState(false)
  const [cooldown, setCooldown] = React.useState(0)

  React.useEffect(() => {
    if (cooldown <= 0) return
    const t = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000)
    return () => window.clearTimeout(t)
  }, [cooldown])

  const sendCode = async () => {
    if (!phone.trim()) {
      toast.error("请输入手机号")
      return
    }
    setSending(true)
    try {
      const res = await fetch("/api/credit/admin/phone/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: phone.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.detail?.message ?? "发送失败")
      const wait = Number(data?.cooldown_sec ?? 60)
      setCooldown(Number.isFinite(wait) && wait > 0 ? wait : 60)
      if (typeof data?.dev_code === "string" && data.dev_code) {
        setCode(data.dev_code)
        toast.success(`开发模式验证码：${data.dev_code}`)
      } else {
        toast.success(`验证码已发送至 ${data?.masked_phone ?? "手机"}`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "发送失败")
    } finally {
      setSending(false)
    }
  }

  const verify = async () => {
    if (!phone.trim() || !code.trim()) {
      toast.error("请输入手机号和验证码")
      return
    }
    setVerifying(true)
    try {
      const res = await fetch("/api/credit/admin/phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.detail?.message ?? "验证失败")
      toast.success("登录成功")
      await onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "验证失败")
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="admin-phone">手机号</Label>
        <Input
          id="admin-phone"
          inputMode="numeric"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="请输入管理员手机号"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="admin-sms-code">短信验证码</Label>
        <div className="flex gap-2">
          <Input
            id="admin-sms-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="请输入验证码"
            onKeyDown={(e) => {
              if (e.key === "Enter") void verify()
            }}
          />
          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            disabled={sending || cooldown > 0}
            onClick={() => void sendCode()}
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : cooldown > 0 ? (
              `${cooldown}s`
            ) : (
              "获取验证码"
            )}
          </Button>
        </div>
      </div>
      <Button onClick={() => void verify()} disabled={verifying}>
        {verifying ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}{" "}
        登录并进入
      </Button>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Smartphone className="h-3.5 w-3.5" />
        验证码由阿里云短信下发，5 分钟内有效
      </p>
    </div>
  )
}

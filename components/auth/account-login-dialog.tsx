"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
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

export type AuthMe = {
  user: { id: number; email_masked: string; login_name?: string }
  balance: number
}

type AccountLoginDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description?: string
  onSuccess?: (me: AuthMe) => void
}

export function AccountLoginDialog({
  open,
  onOpenChange,
  title = "请先登录",
  description = "登录后可使用平台功能并扣减积分。",
  onSuccess,
}: AccountLoginDialogProps) {
  const router = useRouter()
  const [tab, setTab] = useState<"login" | "register">("login")
  const [loginName, setLoginName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [sending, setSending] = useState(false)
  const [authMessage, setAuthMessage] = useState("")
  const [authError, setAuthError] = useState("")

  const resetForm = () => {
    setLoginName("")
    setPassword("")
    setConfirmPassword("")
    setTab("login")
    setAuthError("")
    setAuthMessage("")
  }

  const submitAuth = async () => {
    const normalizedLoginName = loginName.trim().toLowerCase().replaceAll(" ", "")
    if (normalizedLoginName.length < 3) {
      toast.error("账号至少 3 位")
      return
    }
    if (normalizedLoginName.length > 32) {
      toast.error("账号不能超过 32 位")
      return
    }
    if (!/^[a-zA-Z0-9._\-@]+$/.test(normalizedLoginName)) {
      toast.error("账号仅支持字母、数字和 . _ - @")
      return
    }
    if (password.length < 8) {
      toast.error("密码至少 8 位")
      return
    }
    if (password.length > 64) {
      toast.error("密码不能超过 64 位")
      return
    }
    if (tab === "register" && password !== confirmPassword) {
      toast.error("两次输入的密码不一致")
      return
    }
    setSending(true)
    setAuthError("")
    setAuthMessage(tab === "register" ? "正在注册并登录…" : "正在登录…")
    try {
      const path = tab === "register" ? "/api/auth/register" : "/api/auth/login"
      const body =
        tab === "register"
          ? { login_name: normalizedLoginName, password, confirm_password: confirmPassword }
          : { login_name: normalizedLoginName, password }
      const r = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      })
      const data = (await r.json().catch(() => ({}))) as {
        detail?: { message?: string; cause?: string } | string
        user?: AuthMe["user"]
        balance?: number
      }
      if (!r.ok) {
        const detail = data?.detail
        const msg =
          typeof detail === "string"
            ? detail
            : detail && typeof detail === "object" && detail.message
              ? detail.message
              : "登录失败"
        const cause =
          detail && typeof detail === "object" && typeof detail.cause === "string"
            ? detail.cause.trim()
            : ""
        throw new Error(cause ? `${msg}（${cause}）` : msg)
      }
      const me: AuthMe = {
        user: data.user!,
        balance: data.balance ?? 0,
      }
      onOpenChange(false)
      resetForm()
      onSuccess?.(me)
      toast.success(tab === "register" ? "注册成功" : "登录成功")
      router.refresh()
    } catch (e) {
      const message = e instanceof Error ? e.message : "请求失败"
      setAuthError(message)
      toast.error(message)
    } finally {
      setAuthMessage("")
      setSending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o)
        if (!o) resetForm()
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 rounded-xl bg-muted p-1">
          <Button
            type="button"
            variant={tab === "login" ? "default" : "ghost"}
            className="flex-1"
            onClick={() => setTab("login")}
          >
            登录
          </Button>
          <Button
            type="button"
            variant={tab === "register" ? "default" : "ghost"}
            className="flex-1"
            onClick={() => setTab("register")}
          >
            注册
          </Button>
        </div>
        <div className="space-y-4 py-3">
          <div className="space-y-2">
            <Label htmlFor="ald-login">账号</Label>
            <Input
              id="ald-login"
              placeholder="建议使用手机号/邮箱前缀/英文账号"
              value={loginName}
              onChange={(e) => setLoginName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ald-password">密码</Label>
            <Input
              id="ald-password"
              type="password"
              placeholder="至少 8 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {tab === "register" && (
            <div className="space-y-2">
              <Label htmlFor="ald-confirm-password">确认密码</Label>
              <Input
                id="ald-confirm-password"
                type="password"
                placeholder="再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="min-h-5 text-xs">
          {authError ? (
            <span className="text-destructive">{authError}</span>
          ) : (
            <span className="text-muted-foreground">{authMessage}</span>
          )}
        </div>
        <DialogFooter>
          <Button onClick={submitAuth} disabled={sending}>
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : tab === "register" ? (
              "注册并登录"
            ) : (
              "登录"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut, LogIn, ChevronUp, Loader2 } from "lucide-react"
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

type Me = { user: { id: number; email_masked: string; login_name?: string }; balance: number } | null | undefined

export function UserMenu() {
  const router = useRouter()
  const [me, setMe] = useState<Me>(undefined)
  const [openLogin, setOpenLogin] = useState(false)
  const [openMenu, setOpenMenu] = useState(false)
  const [tab, setTab] = useState<"login" | "register">("login")
  const [loginName, setLoginName] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [sending, setSending] = useState(false)
  const [authMessage, setAuthMessage] = useState("")
  const [authError, setAuthError] = useState("")

  const refresh = async () => {
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
    }
  }

  useEffect(() => {
    void refresh()
  }, [])


  useEffect(() => {
    if (!openMenu) return
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest("[data-user-menu]")) setOpenMenu(false)
    }
    document.addEventListener("click", close)
    return () => document.removeEventListener("click", close)
  }, [openMenu])

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
      const body = tab === "register"
        ? { login_name: normalizedLoginName, password, confirm_password: confirmPassword }
        : { login_name: normalizedLoginName, password }
      const r = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "include",
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data?.detail?.message || data?.detail || "登录失败")
      setMe((data as any) ?? null)
      setOpenLogin(false)
      setLoginName("")
      setPassword("")
      setConfirmPassword("")
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

  const onLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    } catch {
      // ignore
    }
    setMe(null)
    setOpenMenu(false)
    toast.success("已退出登录")
    router.refresh()
  }

  if (me === undefined) {
    return (
      <div className="m-3 rounded-xl border border-sidebar-border bg-card p-3 soft-shadow">
        <div className="flex h-9 items-center gap-3 text-xs text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>加载中…</span>
        </div>
      </div>
    )
  }

  if (me === null) {
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
            if (!o) {
              setLoginName("")
              setPassword("")
              setConfirmPassword("")
              setTab("login")
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>账号密码登录</DialogTitle>
              <DialogDescription>先注册账号，再用账号密码登录；不需要验证码。</DialogDescription>
            </DialogHeader>
            <div className="flex gap-2 rounded-xl bg-muted p-1">
              <Button type="button" variant={tab === "login" ? "default" : "ghost"} className="flex-1" onClick={() => setTab("login")}>登录</Button>
              <Button type="button" variant={tab === "register" ? "default" : "ghost"} className="flex-1" onClick={() => setTab("register")}>注册</Button>
            </div>
            <div className="space-y-4 py-3">
              <div className="space-y-2">
                <Label htmlFor="um-login">账号</Label>
                <Input id="um-login" placeholder="建议使用手机号/邮箱前缀/英文账号" value={loginName} onChange={(e) => setLoginName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="um-password">密码</Label>
                <Input id="um-password" type="password" placeholder="至少 8 位" value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              {tab === "register" && (
                <div className="space-y-2">
                  <Label htmlFor="um-confirm-password">确认密码</Label>
                  <Input id="um-confirm-password" type="password" placeholder="再次输入密码" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                </div>
              )}
              {tab === "register" ? (
                <p className="text-xs text-muted-foreground">注册成功后会自动登录，并为新账号创建独立积分账户。</p>
              ) : (
                <p className="text-xs text-muted-foreground">输入已注册账号与密码登录。</p>
              )}
            </div>
            <div className="min-h-5 text-xs">
              {authError ? <span className="text-destructive">{authError}</span> : <span className="text-muted-foreground">{authMessage}</span>}
            </div>
            <DialogFooter>
              <Button onClick={submitAuth} disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : tab === "register" ? "注册并登录" : "登录"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    )
  }

  const displayName = me.user.login_name || me.user.email_masked
  const local = displayName.split("@")[0]
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
          <p className="truncate text-sm font-medium text-foreground">{me.user.login_name || me.user.email_masked}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {me.user.login_name || me.user.email_masked}
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
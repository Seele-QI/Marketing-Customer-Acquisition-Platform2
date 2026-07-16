"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { LogOut, LogIn, ChevronUp, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { useLoginRequired } from "@/components/auth/login-required-provider"

export function UserMenu() {
  const router = useRouter()
  const { me, authUnavailable, refreshAuth, promptLogin } = useLoginRequired()
  const [openMenu, setOpenMenu] = useState(false)

  useEffect(() => {
    if (!openMenu) return
    const close = (e: MouseEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest("[data-user-menu]")) setOpenMenu(false)
    }
    document.addEventListener("click", close)
    return () => document.removeEventListener("click", close)
  }, [openMenu])

  const onLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    } catch {
      // ignore
    }
    await refreshAuth()
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
      <div className="m-3" data-user-menu>
        {authUnavailable ? (
          <div className="rounded-xl border border-sidebar-border bg-card p-3 text-center soft-shadow">
            <p className="text-xs text-muted-foreground">无法连接云端服务</p>
            <Button
              variant="outline"
              className="mt-2 w-full"
              size="sm"
              onClick={() => void refreshAuth()}
            >
              重试
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            className="w-full justify-center gap-2"
            size="sm"
            onClick={() => promptLogin("登录后可管理账号与积分")}
          >
            <LogIn className="h-4 w-4" />
            登录 / 注册
          </Button>
        )}
      </div>
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

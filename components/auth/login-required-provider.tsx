"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { LOGIN_REQUIRED_EVENT } from "@/lib/auth/prompt-login"
import { AccountLoginDialog, type AuthMe } from "@/components/auth/account-login-dialog"

type LoginRequiredContextValue = {
  me: AuthMe | null | undefined
  loggedIn: boolean
  refreshAuth: () => Promise<AuthMe | null>
  /** 未登录时弹出中央登录框，返回 false */
  requireLogin: (hint?: string) => Promise<boolean>
  /** 直接弹出登录框（不校验当前状态） */
  promptLogin: (hint?: string) => void
}

const LoginRequiredContext = createContext<LoginRequiredContextValue | null>(null)

async function fetchAuthMe(): Promise<AuthMe | null> {
  try {
    const r = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
    if (r.status === 401) return null
    if (!r.ok) return null
    return (await r.json()) as AuthMe
  } catch {
    return null
  }
}

export function LoginRequiredProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AuthMe | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [hint, setHint] = useState("登录后可使用平台功能并扣减积分。")

  const refreshAuth = useCallback(async () => {
    const next = await fetchAuthMe()
    setMe(next)
    return next
  }, [])

  useEffect(() => {
    void refreshAuth()
  }, [refreshAuth])

  const promptLogin = useCallback((message?: string) => {
    setHint(message?.trim() || "登录后可使用平台功能并扣减积分。")
    setOpen(true)
  }, [])

  useEffect(() => {
    const onLoginRequired = (e: Event) => {
      const detail = (e as CustomEvent<{ message?: string }>).detail
      promptLogin(detail?.message || "请先登录")
    }
    window.addEventListener(LOGIN_REQUIRED_EVENT, onLoginRequired)
    return () => window.removeEventListener(LOGIN_REQUIRED_EVENT, onLoginRequired)
  }, [promptLogin])

  const requireLogin = useCallback(
    async (message?: string) => {
      let current = me
      if (current === undefined) {
        current = await refreshAuth()
      }
      if (current) return true
      promptLogin(message || "请先登录后再使用此功能")
      return false
    },
    [me, promptLogin, refreshAuth],
  )

  const value = useMemo<LoginRequiredContextValue>(
    () => ({
      me,
      loggedIn: me !== null && me !== undefined,
      refreshAuth,
      requireLogin,
      promptLogin,
    }),
    [me, refreshAuth, requireLogin, promptLogin],
  )

  return (
    <LoginRequiredContext.Provider value={value}>
      {children}
      <AccountLoginDialog
        open={open}
        onOpenChange={setOpen}
        title="请先登录"
        description={hint}
        onSuccess={(next) => setMe(next)}
      />
    </LoginRequiredContext.Provider>
  )
}

export function useLoginRequired(): LoginRequiredContextValue {
  const ctx = useContext(LoginRequiredContext)
  if (!ctx) {
    throw new Error("useLoginRequired must be used within LoginRequiredProvider")
  }
  return ctx
}

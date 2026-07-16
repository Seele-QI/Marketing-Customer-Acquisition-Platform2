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
import { CREDIT_BALANCE_CHANGED_EVENT } from "@/lib/credit/balance-sync"
import { AccountLoginDialog, type AuthMe } from "@/components/auth/account-login-dialog"

type LoginRequiredContextValue = {
  me: AuthMe | null | undefined
  loggedIn: boolean
  /** 最近一次 /api/auth/me 因 503 或网络失败未能确认登录态 */
  authUnavailable: boolean
  /** 当前积分余额；未登录为 null，加载中为 undefined */
  balance: number | null | undefined
  refreshAuth: () => Promise<AuthMe | null>
  /** 从 /api/auth/me 刷新余额 */
  refreshBalance: () => Promise<number | null>
  /** 未登录时弹出中央登录框，返回 false */
  requireLogin: (hint?: string) => Promise<boolean>
  /** 直接弹出登录框（不校验当前状态） */
  promptLogin: (hint?: string) => void
}

const LoginRequiredContext = createContext<LoginRequiredContextValue | null>(null)

type AuthFetchResult =
  | { status: "ok"; me: AuthMe }
  | { status: "unauthenticated" }
  | { status: "unavailable" }

async function fetchAuthMe(): Promise<AuthFetchResult> {
  try {
    const r = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
    if (r.status === 401) return { status: "unauthenticated" }
    if (r.status === 503) return { status: "unavailable" }
    if (!r.ok) return { status: "unavailable" }
    return { status: "ok", me: (await r.json()) as AuthMe }
  } catch {
    return { status: "unavailable" }
  }
}

function triggerElectronConfigSync() {
  const api = window.electronAPI
  if (api?.syncConfig) {
    void api.syncConfig().catch(() => {})
  }
}

export function LoginRequiredProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AuthMe | null | undefined>(undefined)
  const [authUnavailable, setAuthUnavailable] = useState(false)
  const [open, setOpen] = useState(false)
  const [hint, setHint] = useState("登录后可使用平台功能并扣减积分。")

  const refreshAuth = useCallback(async () => {
    const result = await fetchAuthMe()
    if (result.status === "ok") {
      setMe(result.me)
      setAuthUnavailable(false)
      triggerElectronConfigSync()
      return result.me
    }
    if (result.status === "unavailable") {
      setAuthUnavailable(true)
      setMe(null)
      return null
    }
    setAuthUnavailable(false)
    setMe(null)
    return null
  }, [])

  const refreshBalance = useCallback(async () => {
    const next = await refreshAuth()
    return next?.balance ?? null
  }, [refreshAuth])

  useEffect(() => {
    void refreshAuth()
  }, [refreshAuth])

  useEffect(() => {
    const onBalanceChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ balance?: number }>).detail
      const nextBalance = detail?.balance
      if (typeof nextBalance !== "number") return
      setMe((prev) => {
        if (!prev) return prev
        return { ...prev, balance: nextBalance }
      })
    }
    window.addEventListener(CREDIT_BALANCE_CHANGED_EVENT, onBalanceChanged)
    return () => window.removeEventListener(CREDIT_BALANCE_CHANGED_EVENT, onBalanceChanged)
  }, [])

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
    const api = (window as Window & {
      electronAPI?: { onAuthRequireLogin?: (h: (p: { message?: string }) => void) => () => void }
    }).electronAPI
    const offElectron = api?.onAuthRequireLogin?.((payload) => {
      promptLogin(payload?.message || "登录已失效，请重新登录")
    })
    return () => {
      window.removeEventListener(LOGIN_REQUIRED_EVENT, onLoginRequired)
      offElectron?.()
    }
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
      authUnavailable,
      balance: me === undefined ? undefined : (me?.balance ?? null),
      refreshAuth,
      refreshBalance,
      requireLogin,
      promptLogin,
    }),
    [me, authUnavailable, refreshAuth, refreshBalance, requireLogin, promptLogin],
  )

  return (
    <LoginRequiredContext.Provider value={value}>
      {children}
      <AccountLoginDialog
        open={open}
        onOpenChange={setOpen}
        title="请先登录"
        description={hint}
        onSuccess={(next) => {
          setMe(next)
          triggerElectronConfigSync()
        }}
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

"use client"

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react"
import { CREDIT_CHANGED_EVENT } from "@/lib/credit-client"

// ── Types ──────────────────────────────────────────────────────

export type AuthUser = {
  id: number
  email_masked: string
  nickname?: string | null
}

export type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: AuthUser; balance: number }
  | { status: "unauthenticated" }

export type AuthContextValue = AuthState & {
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

// ── Context ────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue>({
  status: "loading",
  refresh: async () => {},
  logout: async () => {},
})

// ── Provider ───────────────────────────────────────────────────

export function UserProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading" })

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me", { credentials: "include" })
      if (r.ok) {
        const data = await r.json()
        setState({
          status: "authenticated",
          user: data.user as AuthUser,
          balance: data.balance as number,
        })
        // 缓存 userId 供非组件代码读取（localStorage 命名空间等）
        try {
          localStorage.setItem("auth-cached-user-id", String(data.user.id))
        } catch {
          // ignore
        }
      } else {
        setState({ status: "unauthenticated" })
      }
    } catch {
      setState({ status: "unauthenticated" })
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" })
    } catch {
      // ignore
    }
    // 清空当前用户的 localStorage
    if (state.status === "authenticated") {
      const prefix = `user:${state.user.id}:`
      try {
        const keys = []
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i)
          if (key?.startsWith(prefix)) keys.push(key)
        }
        keys.forEach((k) => localStorage.removeItem(k))
        localStorage.removeItem("auth-cached-user-id")
      } catch {
        // ignore
      }
    }
    setState({ status: "unauthenticated" })
  }, [state])

  useEffect(() => {
    refresh()
  }, [refresh])

  // 监听积分变动事件(consumeCredit / refundCredit 触发),自动 refresh badge
  useEffect(() => {
    if (typeof window === "undefined") return
    const handler = () => {
      void refresh()
    }
    window.addEventListener(CREDIT_CHANGED_EVENT, handler)
    return () => window.removeEventListener(CREDIT_CHANGED_EVENT, handler)
  }, [refresh])

  return (
    <AuthContext.Provider value={{ ...state, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

// ── Hook ───────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  return useContext(AuthContext)
}

// ── Utility: get cached userId without React (for non-component code) ──

export function getCachedUserId(): number | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem("auth-cached-user-id")
    return raw ? parseInt(raw, 10) : null
  } catch {
    return null
  }
}

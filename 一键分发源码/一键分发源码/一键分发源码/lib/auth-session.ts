/** 登出 / 切换账号时清理前端会话数据 */

export const AUTH_CHANGED_EVENT = "app:auth-changed"

export type AuthChangedDetail = {
  loggedIn: boolean
  userId?: number | null
}

let cachedUserId: number | null = null

export function setCachedUserId(userId: number | null) {
  cachedUserId = userId
}

export function getCachedUserId(): number | null {
  return cachedUserId
}

export function dispatchAuthChanged(detail: AuthChangedDetail) {
  if (typeof window === "undefined") return
  setCachedUserId(detail.loggedIn ? (detail.userId ?? null) : null)
  window.dispatchEvent(new CustomEvent(AUTH_CHANGED_EVENT, { detail }))
}

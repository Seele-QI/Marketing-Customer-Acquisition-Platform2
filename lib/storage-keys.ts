/**
 * 用户级 localStorage 命名空间工具
 *
 * 所有用户数据 key 必须以 `user:{userId}:` 为前缀，
 * 确保多用户登录同一浏览器时数据完全隔离。
 */

export function getUserScopedKey(baseKey: string, userId: number): string {
  return `user:${userId}:${baseKey}`
}

/** 获取缓存的 userId（由 auth-context 写入），供非 React 代码使用 */
export function getCachedUserId(): number | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem("auth-cached-user-id")
    return raw ? parseInt(raw, 10) : null
  } catch {
    return null
  }
}

/** 退出登录时清空当前用户的所有 localStorage 数据 */
export function clearUserStorage(userId: number): void {
  if (typeof window === "undefined") return
  try {
    const prefix = getUserScopedKey("", userId)
    const keys: string[] = []
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

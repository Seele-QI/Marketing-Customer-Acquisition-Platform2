/** 全局「请先登录」弹窗事件名 */
export const LOGIN_REQUIRED_EVENT = "login-required"

export function isLoginRequiredError(message: string): boolean {
  return /请先登录|NOT_LOGGED_IN|未登录/i.test(message)
}

/** 非 React 层（API 客户端等）触发中央登录弹窗 */
export function promptLoginRequired(message = "请先登录"): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(LOGIN_REQUIRED_EVENT, { detail: { message } }),
  )
}

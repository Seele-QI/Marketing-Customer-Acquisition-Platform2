/**
 * 积分扣费 / 退款客户端。
 *
 * 模式:前端预扣 → 业务调用 → 失败时退款。
 * - 预扣返回的 refId 是对账关键,业务方拿到后用 try/catch 包 fetch,
 *   出错(5xx/网络)时调 refundCredit(refId) 退掉。
 * - 4xx(用户输入错误、配额)不退——用户自己改完可以重试。
 * - 用户主动 cancel/stop 不退——沿用"中断任务不返还积分"UX。
 */

export type CreditFeature =
  | "chat_advisor"
  | "video_creation"
  | "distribute"
  | "script_generation"

/** 积分变动事件名。UserProvider 监听它自动调 refresh() 更新 badge。
 *  用 CustomEvent 跨组件通信,避免在 lib 里调 React hook。 */
export const CREDIT_CHANGED_EVENT = "credithub:credit-changed"

function notifyCreditChanged(detail: { newBalance?: number; reason: string }) {
  if (typeof window === "undefined") return
  try {
    window.dispatchEvent(new CustomEvent(CREDIT_CHANGED_EVENT, { detail }))
  } catch {
    // ignore
  }
}

/** 定价表(与后端 lib/credit.py 的 CREDIT_PRICING 镜像,仅用于 UI 展示) */
export const CREDIT_PRICING_UI: Record<CreditFeature, number> = {
  chat_advisor: 3,
  video_creation: 500,
  distribute: 10,
  script_generation: 5,
}

export const CREDIT_FEATURE_LABEL: Record<CreditFeature, string> = {
  chat_advisor: "AI 顾问对话",
  video_creation: "视频创作",
  distribute: "一键分发",
  script_generation: "脚本生成",
}

export class CreditError extends Error {
  status: number
  code: string
  need?: number
  have?: number
  feature?: string
  constructor(opts: {
    message: string
    status: number
    code: string
    need?: number
    have?: number
    feature?: string
  }) {
    super(opts.message)
    this.name = "CreditError"
    this.status = opts.status
    this.code = opts.code
    this.need = opts.need
    this.have = opts.have
    this.feature = opts.feature
  }
}

export type ConsumeResult = {
  refId: string
  cost: number
  feature: string
  quantity: number
  newBalance: number
}

/**
 * 预扣积分。余额不足抛 CreditError(code='INSUFFICIENT_CREDIT')。
 * 成功返回 refId,业务失败时用 refundCredit(refId) 退掉。
 */
export async function consumeCredit(
  feature: CreditFeature,
  quantity = 1,
): Promise<ConsumeResult> {
  const r = await fetch("/api/credit/consume", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ feature, quantity }),
    credentials: "include",
  })
  const data = (await r.json().catch(() => ({}))) as {
    detail?: {
      code?: string
      message?: string
      need?: number
      have?: number
      feature?: string
    }
    ref_id?: string
    cost?: number
    feature?: string
    quantity?: number
    new_balance?: number
  }
  if (!r.ok) {
    const detail = data.detail || {}
    throw new CreditError({
      message: detail.message || "扣分失败",
      status: r.status,
      code: detail.code || "UNKNOWN",
      need: detail.need,
      have: detail.have,
      feature: detail.feature,
    })
  }
  // 通知 UserProvider 自动 refresh badge
  notifyCreditChanged({ newBalance: data.new_balance, reason: "consume" })
  return {
    refId: data.ref_id!,
    cost: data.cost!,
    feature: data.feature!,
    quantity: data.quantity!,
    newBalance: data.new_balance!,
  }
}

/**
 * 退款。失败不抛(只 console.warn),避免退款失败导致业务方再抛错。
 * 业务方无需 await 结果。
 */
export async function refundCredit(refId: string): Promise<void> {
  if (!refId) return
  try {
    const r = await fetch("/api/credit/refund", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ref_id: refId }),
      credentials: "include",
    })
    if (r.ok) {
      const data = (await r.json().catch(() => ({}))) as { new_balance?: number }
      notifyCreditChanged({ newBalance: data.new_balance, reason: "refund" })
    }
  } catch (e) {
    console.warn("[refundCredit] refund failed", refId, e)
  }
}

/**
 * 把 CreditError 转成 toast 文案。返回 { title, description }。
 * 不是 CreditError 的异常也接,作为"扣分失败"通用提示。
 */
export function creditErrorToToast(err: unknown, fallbackTitle = "扣分失败"): {
  title: string
  description: string
} {
  if (err instanceof CreditError) {
    if (err.code === "INSUFFICIENT_CREDIT") {
      return {
        title: "积分不足",
        description: `本次需要 ${err.need ?? "?"} 积分,当前余额 ${err.have ?? "?"}`,
      }
    }
    if (err.code === "RATE_LIMITED") {
      return {
        title: "操作过于频繁",
        description: err.message,
      }
    }
    return {
      title: fallbackTitle,
      description: err.message,
    }
  }
  return {
    title: fallbackTitle,
    description: err instanceof Error ? err.message : String(err),
  }
}

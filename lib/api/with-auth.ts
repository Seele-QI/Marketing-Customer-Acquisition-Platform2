import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { getServerFastapiBase } from "@/lib/fastapi-base"

export type AuthedContext = { userId: number; cookieHeader: string }

export type AuthedHandler = (req: Request, ctx: AuthedContext) => Promise<Response>

function notLoggedIn(): Response {
  return NextResponse.json(
    { detail: { code: "NOT_LOGGED_IN", message: "请先登录" } },
    { status: 401 },
  )
}

/** Next.js Route Handler 统一登录校验。未登录直接 401。 */
export function withAuth(handler: AuthedHandler) {
  return async (req: Request): Promise<Response> => {
    const sid = (await cookies()).get("session_id")?.value
    if (!sid) return notLoggedIn()

    const base = getServerFastapiBase()
    if (!base) {
      return NextResponse.json(
        { detail: { code: "FASTAPI_UNAVAILABLE", message: "后端服务未配置" } },
        { status: 503 },
      )
    }

    const meResp = await fetch(`${base}/api/auth/me`, {
      headers: { Cookie: `session_id=${sid}` },
      cache: "no-store",
    })
    if (!meResp.ok) return notLoggedIn()

    const body = (await meResp.json()) as { user?: { id?: number } }
    const userId = body?.user?.id
    if (typeof userId !== "number") return notLoggedIn()

    return handler(req, { userId, cookieHeader: `session_id=${sid}` })
  }
}

/** 扣费失败时返回标准 402/500 Response；成功返回 null。 */
export function chargeErrorResponse(e: unknown): Response {
  const msg = e instanceof Error ? e.message : ""
  if (msg === "INSUFFICIENT_CREDIT") {
    return NextResponse.json(
      { detail: { code: "INSUFFICIENT_CREDIT", message: "积分不足" } },
      { status: 402 },
    )
  }
  return NextResponse.json(
    { detail: { code: "CHARGE_FAILED", message: "扣费失败" } },
    { status: 500 },
  )
}

export async function chargeCredit(opts: {
  cookieHeader: string
  scene: string
  refId: string
}): Promise<{ balance: number; cost: number }> {
  const base = getServerFastapiBase()
  const resp = await fetch(`${base}/api/credit/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: opts.cookieHeader },
    body: JSON.stringify({ scene: opts.scene, ref_id: opts.refId }),
  })
  if (resp.status === 402) {
    throw new Error("INSUFFICIENT_CREDIT")
  }
  if (!resp.ok) {
    throw new Error(`CHARGE_FAILED:${resp.status}`)
  }
  return (await resp.json()) as { balance: number; cost: number }
}

/** 查询余额（预检用，不扣费） */
export async function getCreditBalance(cookieHeader: string): Promise<number> {
  const base = getServerFastapiBase()
  if (!base) throw new Error("FASTAPI_UNAVAILABLE")
  const resp = await fetch(`${base}/api/credit/balance`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  })
  if (resp.status === 401) throw new Error("NOT_LOGGED_IN")
  if (!resp.ok) throw new Error(`BALANCE_FAILED:${resp.status}`)
  const body = (await resp.json()) as { balance?: number }
  if (typeof body.balance !== "number") throw new Error("BALANCE_FAILED")
  return body.balance
}

/**
 * Sonetto 计量扣费：走 consume-metered，携带 CREDIT_METERED_KEY。
 * cost 仅由服务端定价引擎计算后传入，浏览器不可调此路径。
 */
export async function chargeMeteredCredit(opts: {
  userId: number
  cost: number
  refId: string
  note?: string
}): Promise<{ balance: number; cost: number }> {
  const base = getServerFastapiBase()
  if (!base) throw new Error("FASTAPI_UNAVAILABLE")
  const meteredKey = (process.env.CREDIT_METERED_KEY || "").trim()
  if (!meteredKey) throw new Error("METERED_KEY_MISSING")

  const resp = await fetch(`${base}/api/credit/consume-metered`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Metered-Key": meteredKey,
    },
    body: JSON.stringify({
      user_id: opts.userId,
      scene: "ai_llm",
      ref_id: opts.refId,
      cost: opts.cost,
      note: opts.note || "AI 模型计量",
    }),
  })
  if (resp.status === 402) {
    throw new Error("INSUFFICIENT_CREDIT")
  }
  if (!resp.ok) {
    throw new Error(`CHARGE_FAILED:${resp.status}`)
  }
  return (await resp.json()) as { balance: number; cost: number }
}

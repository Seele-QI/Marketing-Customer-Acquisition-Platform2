import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import {
  businessTaskPayload,
  type BusinessTaskBilling,
} from "@/lib/credit/business-task"

import {
  createServiceUnavailableResponse,
  getCloudApiBase,
  getCloudApiServiceErrorCategory,
} from "@/lib/fastapi-base"

export type AuthedContext = { userId: number; cookieHeader: string }

export type AuthedHandler = (req: Request, ctx: AuthedContext) => Promise<Response>

class CloudApiServiceUnavailableError extends Error {
  readonly category: "local_service" | "cloud_service"

  constructor() {
    const category = getCloudApiServiceErrorCategory()
    super(category)
    this.name = "CloudApiServiceUnavailableError"
    this.category = category
  }
}

function isCloudApiServiceUnavailableError(
  error: unknown,
): error is CloudApiServiceUnavailableError {
  return error instanceof CloudApiServiceUnavailableError
}

function requireCloudApiBase(): string {
  const base = getCloudApiBase()
  if (!base) throw new CloudApiServiceUnavailableError()
  return base
}

async function fetchCloudApi(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch {
    throw new CloudApiServiceUnavailableError()
  }
}

const AUTH_PROBE_ATTEMPTS = 3
const AUTH_PROBE_TIMEOUT_MS = 10_000
const AUTH_PROBE_RETRY_DELAY_MS = 150

function isRetryableAuthProbeStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

async function fetchCloudAuthProbe(input: string, init?: RequestInit): Promise<Response> {
  for (let attempt = 1; attempt <= AUTH_PROBE_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchCloudApi(input, {
        ...init,
        signal: init?.signal ?? AbortSignal.timeout(AUTH_PROBE_TIMEOUT_MS),
      })
      if (!isRetryableAuthProbeStatus(response.status) || attempt >= AUTH_PROBE_ATTEMPTS) {
        return response
      }
      console.warn(
        `[cloud-auth-retry] status=${response.status} attempt=${attempt}/${AUTH_PROBE_ATTEMPTS}`,
      )
    } catch (error) {
      if (attempt >= AUTH_PROBE_ATTEMPTS) throw error
      console.warn(
        `[cloud-auth-retry] transport failure attempt=${attempt}/${AUTH_PROBE_ATTEMPTS}`,
      )
    }
    await new Promise((resolve) =>
      setTimeout(resolve, AUTH_PROBE_RETRY_DELAY_MS * attempt),
    )
  }
  throw new CloudApiServiceUnavailableError()
}

function notLoggedIn(): Response {
  return NextResponse.json(
    { detail: { code: "NOT_LOGGED_IN", message: "请先登录" } },
    { status: 401 },
  )
}

export function authProbeErrorResponse(response: Response): Response | null {
  if (response.ok) return null
  if (isRetryableAuthProbeStatus(response.status)) {
    return createServiceUnavailableResponse(getCloudApiServiceErrorCategory())
  }
  return notLoggedIn()
}

/** Next.js Route Handler 统一登录校验。未登录直接 401。 */
export function withAuth(handler: AuthedHandler) {
  return async (req: Request): Promise<Response> => {
    try {
      const sid = (await cookies()).get("session_id")?.value
      if (!sid) return notLoggedIn()

      const base = requireCloudApiBase()

      let meResp: Response
      try {
        meResp = await fetchCloudAuthProbe(`${base}/api/auth/me`, {
          headers: { Cookie: `session_id=${sid}` },
          cache: "no-store",
        })
      } catch (error) {
        if (isCloudApiServiceUnavailableError(error)) {
          return createServiceUnavailableResponse(error.category)
        }
        throw error
      }
      const authProbeError = authProbeErrorResponse(meResp)
      if (authProbeError) return authProbeError

      let body: { user?: { id?: number } }
      try {
        body = (await meResp.json()) as { user?: { id?: number } }
      } catch {
        return notLoggedIn()
      }
      const userId = body?.user?.id
      if (typeof userId !== "number") return notLoggedIn()

      return await handler(req, { userId, cookieHeader: `session_id=${sid}` })
    } catch (e) {
      if (isCloudApiServiceUnavailableError(e)) {
        return createServiceUnavailableResponse(e.category)
      }
      return NextResponse.json(
        { detail: { code: "INTERNAL_ERROR", message: "服务暂时不可用，请稍后重试" } },
        { status: 500 },
      )
    }
  }
}

/** 扣费失败时返回标准 402/500 Response；成功返回 null。 */
export function chargeErrorResponse(e: unknown): Response {
  if (isCloudApiServiceUnavailableError(e)) {
    return createServiceUnavailableResponse(e.category)
  }
  const msg = e instanceof Error ? e.message : ""
  if (msg === "INSUFFICIENT_CREDIT") {
    return NextResponse.json(
      { detail: { code: "INSUFFICIENT_CREDIT", message: "积分不足" } },
      { status: 402 },
    )
  }
  if (msg.includes("CHARGE_FAILED:400:INVALID_SCENE")) {
    return NextResponse.json(
      {
        detail: {
          code: "BILLING_SCENE_NOT_CONFIGURED",
          message: "计费项目未配置，请联系管理员同步云端计费配置",
        },
      },
      { status: 503 },
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
  businessTask?: BusinessTaskBilling
}): Promise<{ balance: number; cost: number }> {
  const base = requireCloudApiBase()
  const resp = await fetchCloudApi(`${base}/api/credit/consume`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: opts.cookieHeader },
    body: JSON.stringify({
      scene: opts.scene,
      ref_id: opts.refId,
      ...businessTaskPayload(opts.businessTask),
    }),
  })
  if (resp.status === 402) {
    throw new Error("INSUFFICIENT_CREDIT")
  }
  if (resp.status >= 500) throw new CloudApiServiceUnavailableError()
  if (!resp.ok) {
    let code = ""
    try {
      const body = (await resp.json()) as {
        detail?: { code?: unknown } | string
      }
      if (
        body.detail &&
        typeof body.detail === "object" &&
        typeof body.detail.code === "string"
      ) {
        code = body.detail.code.replace(/[^A-Z0-9_]/g, "").slice(0, 64)
      }
    } catch {
      // The status still produces a safe generic charge error.
    }
    throw new Error(`CHARGE_FAILED:${resp.status}${code ? `:${code}` : ""}`)
  }
  return (await resp.json()) as { balance: number; cost: number }
}

/** 查询余额（预检用，不扣费） */
export async function getCreditBalance(cookieHeader: string): Promise<number> {
  const base = requireCloudApiBase()
  const resp = await fetchCloudApi(`${base}/api/credit/balance`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  })
  if (resp.status === 401) throw new Error("NOT_LOGGED_IN")
  if (resp.status >= 500) throw new CloudApiServiceUnavailableError()
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
  businessTask?: BusinessTaskBilling
}): Promise<{ balance: number; cost: number }> {
  const base = requireCloudApiBase()
  const meteredKey = (process.env.CREDIT_METERED_KEY || "").trim()
  if (!meteredKey) throw new Error("METERED_KEY_MISSING")

  const resp = await fetchCloudApi(`${base}/api/credit/consume-metered`, {
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
      ...businessTaskPayload(opts.businessTask),
      note: opts.note || "AI 模型计量",
    }),
  })
  if (resp.status === 402) {
    throw new Error("INSUFFICIENT_CREDIT")
  }
  if (resp.status >= 500) throw new CloudApiServiceUnavailableError()
  if (!resp.ok) {
    throw new Error(`CHARGE_FAILED:${resp.status}`)
  }
  return (await resp.json()) as { balance: number; cost: number }
}

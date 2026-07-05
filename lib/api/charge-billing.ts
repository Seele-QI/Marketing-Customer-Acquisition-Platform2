import { getServerFastapiBase } from "@/lib/fastapi-base"
import {
  resolveBillingCost,
  type BillingKey,
  type BillingParams,
} from "@/lib/credit-pricing/registry"

export async function chargeBillingEvent(opts: {
  cookieHeader: string
  billingKey: BillingKey
  params?: BillingParams
  refId: string
}): Promise<{ balance: number; cost: number; scene: string }> {
  const base = getServerFastapiBase()
  if (!base) throw new Error("FASTAPI_UNAVAILABLE")

  const resp = await fetch(`${base}/api/credit/consume-billing`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: opts.cookieHeader,
    },
    body: JSON.stringify({
      billing_key: opts.billingKey,
      params: opts.params ?? {},
      ref_id: opts.refId,
    }),
  })

  if (resp.status === 402) {
    throw new Error("INSUFFICIENT_CREDIT")
  }
  if (!resp.ok) {
    throw new Error(`CHARGE_FAILED:${resp.status}`)
  }

  return (await resp.json()) as { balance: number; cost: number; scene: string }
}

/** 预检用：解析本次扣费积分（不请求后端） */
export function estimateBillingCost(
  billingKey: BillingKey,
  params?: BillingParams,
): number {
  return resolveBillingCost(billingKey, params ?? {}).cost
}

import { NextResponse } from "next/server"

import {
  FIXED_CHAT_MODELS,
  SONETTO_MODELS,
  displayRatesPer1M,
  perCallCredits,
} from "@/lib/llm/model-registry"
import { isArkChatConfigured } from "@/lib/llm/ark-client"
import { isSonettoProviderConfigured } from "@/lib/llm/sonetto-client"
import { getDeepseekApiKey } from "@/lib/server-env"

export const runtime = "nodejs"

export type AiModelListItem = {
  id: string
  label: string
  provider: string
  billing: "fixed" | "token" | "per_call"
  configured: boolean
  costCredits?: number
  rates?: {
    inputPer1M: number
    outputPer1M: number
    cacheReadPer1M?: number
    cacheCreatePer1M?: number
  }
}

function isFixedProviderConfigured(provider: string): boolean {
  if (provider === "deepseek") return Boolean(getDeepseekApiKey())
  if (provider === "ark") return isArkChatConfigured()
  return false
}

/** 可选模型列表（含配置状态与展示价；不含密钥） */
export async function GET() {
  const models: AiModelListItem[] = []

  for (const m of FIXED_CHAT_MODELS) {
    models.push({
      id: m.id,
      label: m.label,
      provider: m.provider,
      billing: m.billing,
      configured: isFixedProviderConfigured(m.provider),
      costCredits: m.costCredits,
    })
  }

  for (const m of SONETTO_MODELS) {
    const configured = isSonettoProviderConfigured(m.provider)
    if (m.billing === "per_call") {
      models.push({
        id: m.id,
        label: m.label,
        provider: m.provider,
        billing: "per_call",
        configured,
        costCredits: perCallCredits(m.pricePerCallYuan ?? 0),
      })
    } else {
      models.push({
        id: m.id,
        label: m.label,
        provider: m.provider,
        billing: "token",
        configured,
        rates: m.tokenPricesYuan
          ? displayRatesPer1M(m.tokenPricesYuan)
          : undefined,
      })
    }
  }

  return NextResponse.json({ models })
}

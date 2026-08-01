import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { completeCloudCopywritingText } from "@/lib/geo/cloud-copywriting-completion"
import {
  buildEnterprisePrefillSystemPrompt,
  buildEnterprisePrefillUserPrompt,
  parseEnterprisePrefill,
} from "@/lib/geo/enterprise-prefill"
import { listCopywritingProviderCandidates } from "@/lib/llm/copywriting-router"

export const runtime = "nodejs"
export const maxDuration = 90

const CLOUD_MODEL_NOT_READY = "CLOUD_MODEL_NOT_READY"
const CLOUD_MODEL_UNAVAILABLE = "CLOUD_MODEL_UNAVAILABLE"

function sanitizeDocuments(raw: unknown): { name: string; text: string }[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, 5).map((item) => {
    const value = item && typeof item === "object" ? item as Record<string, unknown> : {}
    return { name: String(value.name ?? "资料").trim().slice(0, 200), text: String(value.text ?? "").trim().slice(0, 20_000) }
  }).filter((doc) => doc.text)
}

export const POST = withAuth(async (req) => {
  const body = await req.json().catch(() => null) as { documents?: unknown } | null
  const documents = sanitizeDocuments(body?.documents)
  if (documents.length === 0) return NextResponse.json({ error: "请先上传至少一份企业资料" }, { status: 400 })
  const documentNames = documents.map((document) => document.name)

  const providers = listCopywritingProviderCandidates({ hasImages: false })
    .filter((candidate) => candidate.source === "cloud")
  if (providers.length === 0) {
    return NextResponse.json({ error: "云端模型配置尚未同步", detail: { code: CLOUD_MODEL_NOT_READY } }, { status: 503 })
  }
  const completion = await completeCloudCopywritingText({
    providers,
    messages: [
      { role: "system", content: buildEnterprisePrefillSystemPrompt() },
      { role: "user", content: buildEnterprisePrefillUserPrompt(documents) },
    ],
    maxTokens: 1200,
    validateText: (text) => parseEnterprisePrefill(text, documentNames) !== null,
  })
  if (!completion.ok) {
    return NextResponse.json({ error: "暂未能从资料提取企业信息，可直接手动填写", detail: { code: CLOUD_MODEL_UNAVAILABLE } }, { status: 502 })
  }
  return NextResponse.json({ prefill: parseEnterprisePrefill(completion.text, documentNames), provider: "cloud" })
})

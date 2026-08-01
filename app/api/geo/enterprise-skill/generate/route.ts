import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { withAuth, chargeCredit, chargeErrorResponse } from "@/lib/api/with-auth"
import type { AuthorityPage, GeoEntityData } from "@/lib/geo/entity-types"
import {
  buildEnterpriseSkillSystemPrompt,
  buildEnterpriseSkillUserPrompt,
  extractSkillDescription,
  type EnterpriseDocInput,
} from "@/lib/geo/enterprise-skill-prompt"
import { generateEnterpriseSkillContent } from "@/lib/geo/enterprise-skill-generation"
import { completeCloudCopywritingText } from "@/lib/geo/cloud-copywriting-completion"
import {
  sanitizeOfficialContact,
  validateOfficialContact,
} from "@/lib/geo/official-contact"
import {
  listCopywritingProviderCandidates,
  type CopywritingProviderCandidate,
  type CopywritingProviderFailure,
} from "@/lib/llm/copywriting-router"
import {
  fetchHtmlTextMany,
  HTMLTEXT_MAX_URLS,
} from "@/lib/tianapi-htmltext"

export const runtime = "nodejs"
export const maxDuration = 300

function sanitizeAuthorityPages(raw: unknown): AuthorityPage[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((p) => {
      const item = p as Record<string, unknown>
      return {
        url: String(item.url ?? "").trim(),
        title: String(item.title ?? "").trim(),
        content: String(item.content ?? "").trim(),
        picture: item.picture ? String(item.picture).trim() : undefined,
        fetchedAt: item.fetchedAt ? String(item.fetchedAt) : undefined,
        error: item.error ? String(item.error) : undefined,
      }
    })
    .filter((p) => p.url)
}

export function sanitizeEntity(raw: unknown): GeoEntityData {
  const e = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
  return {
    companyName: String(e.companyName ?? "").trim(),
    industry: String(e.industry ?? "").trim(),
    coreProduct: String(e.coreProduct ?? "").trim(),
    authorityLinks: Array.isArray(e.authorityLinks)
      ? e.authorityLinks.map((l) => String(l).trim()).filter(Boolean)
      : [],
    authorityPages: sanitizeAuthorityPages(e.authorityPages),
    faqs: Array.isArray(e.faqs)
      ? e.faqs
          .map((f) => {
            const item = f as Record<string, unknown>
            return {
              question: String(item.question ?? "").trim(),
              answer: String(item.answer ?? "").trim(),
            }
          })
          .filter((f) => f.question || f.answer)
      : [],
    officialContact: sanitizeOfficialContact(e.officialContact),
  }
}

function sanitizeDocuments(raw: unknown): EnterpriseDocInput[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((d) => {
      const item = d as Record<string, unknown>
      return {
        name: String(item.name ?? "document").trim(),
        text: String(item.text ?? "").trim(),
      }
    })
    .filter((d) => d.text.length > 0)
}

/**
 * 合并客户端已抓取页面 + 服务端补抓缺失 URL。
 */
async function resolveAuthorityPages(entity: GeoEntityData): Promise<AuthorityPage[]> {
  const links = [...new Set(entity.authorityLinks.map((u) => u.trim()).filter(Boolean))].slice(
    0,
    HTMLTEXT_MAX_URLS,
  )
  if (links.length === 0) return []

  const existing = new Map(
    (entity.authorityPages ?? [])
      .filter((p) => p.url && p.content.trim() && !p.error)
      .map((p) => [p.url, p]),
  )

  const needFetch = links.filter((url) => !existing.has(url))
  const fetched = needFetch.length > 0 ? await fetchHtmlTextMany(needFetch) : []

  const byUrl = new Map(existing)
  for (const item of fetched) {
    if ("error" in item) {
      byUrl.set(item.url, {
        url: item.url,
        title: item.url,
        content: "",
        error: item.error,
      })
    } else {
      byUrl.set(item.url, {
        url: item.url,
        title: item.title,
        content: item.content,
        picture: item.picture,
        fetchedAt: new Date().toISOString(),
      })
    }
  }

  return links.map(
    (url) =>
      byUrl.get(url) ?? {
        url,
        title: url,
        content: "",
        error: "未抓取",
      },
  )
}

export const POST = withAuth(async (req, { userId, cookieHeader }) => {
  try {
    const body = (await req.json()) as {
      skillName?: string
      entity?: unknown
      documents?: unknown
    }

    const skillName = String(body.skillName ?? "").trim()
    const entity = sanitizeEntity(body.entity)
    const documents = sanitizeDocuments(body.documents)

    if (!skillName) {
      return NextResponse.json({ error: "请填写 Skill 名称" }, { status: 400 })
    }
    const requiredEnterpriseFields = [
      ["企业名称", entity.companyName],
      ["所属行业", entity.industry],
      ["核心产品或服务", entity.coreProduct],
    ] as const
    const missingEnterpriseField = requiredEnterpriseFields.find(([, value]) => !value)
    if (missingEnterpriseField) {
      return NextResponse.json(
        { error: `请填写${missingEnterpriseField[0]}` },
        { status: 400 },
      )
    }

    const contactIssue = validateOfficialContact(entity.officialContact)[0]
    if (contactIssue) {
      return NextResponse.json({ error: contactIssue.message }, { status: 400 })
    }

    // 旧客户端即使继续提交 provider 也不会影响服务端路由；这里只接受云端下发渠道。
    const cloudProviders = listCopywritingProviderCandidates({ hasImages: false }).filter(
      (candidate) => candidate.source === "cloud",
    )
    if (cloudProviders.length === 0) {
      const message = "云端模型配置尚未同步，请稍后重试"
      return NextResponse.json(
        { error: message, detail: { code: "CLOUD_MODEL_NOT_READY", message } },
        { status: 503 },
      )
    }

    const businessTaskId = crypto.randomUUID()
    const refId = `geo-skill:${userId}:${businessTaskId}`
    try {
      await chargeCredit({
        cookieHeader,
        scene: "geo_skill_gen",
        refId,
        businessTask: {
          businessTaskId,
          businessType: "geo_enterprise_skill",
          billingStage: "llm_generation",
        },
      })
    } catch (e) {
      return chargeErrorResponse(e)
    }

    const authorityPages = await resolveAuthorityPages(entity)

    const system = buildEnterpriseSkillSystemPrompt()
    const user = buildEnterpriseSkillUserPrompt(
      skillName,
      entity,
      documents,
      authorityPages,
    )

    let generated: Awaited<ReturnType<typeof generateEnterpriseSkillContent>>
    let selectedProvider: CopywritingProviderCandidate | undefined
    try {
      generated = await generateEnterpriseSkillContent({
        system,
        user,
        contact: entity.officialContact,
        complete: async (input) => {
          const completion = await completeCloudCopywritingText({
            providers: cloudProviders,
            messages: [
              { role: "system", content: input.system },
              { role: "user", content: input.user },
            ],
            maxTokens: input.maxTokens,
          })
          if (!completion.ok) {
            throw Object.assign(new Error("云端模型渠道暂时不可用，请稍后重试"), {
              statusCode: 502,
              code: "CLOUD_MODEL_UNAVAILABLE",
              failures: completion.failures,
            })
          }
          selectedProvider = completion.provider
          return completion.text
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "生成失败"
      const statusCode =
        err && typeof err === "object" && "statusCode" in err && typeof (err as { statusCode: number }).statusCode === "number"
          ? (err as { statusCode: number }).statusCode
          : 502
      const code =
        err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
          ? (err as { code: string }).code
          : "GENERATION_FAILED"
      const attempts =
        err && typeof err === "object" && "failures" in err && Array.isArray((err as { failures: unknown }).failures)
          ? ((err as { failures: CopywritingProviderFailure[] }).failures)
          : undefined
      return NextResponse.json(
        { error: message, detail: { code, message, ...(attempts ? { attempts } : {}) } },
        { status: statusCode },
      )
    }

    const finalized = generated.content

    const id = `ent-${crypto.randomUUID()}`
    const description = extractSkillDescription(finalized)

    return NextResponse.json({
      skill: {
        id,
        label: skillName,
        description,
        content: finalized,
        provider: selectedProvider
          ? `${selectedProvider.name} / ${selectedProvider.model}`
          : "cloud",
        createdAt: new Date().toISOString(),
        quality: generated.quality,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
})

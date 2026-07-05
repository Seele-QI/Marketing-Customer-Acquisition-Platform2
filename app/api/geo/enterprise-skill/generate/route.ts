import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { withAuth } from "@/lib/api/with-auth"
import type { AuthorityPage, GeoEntityData } from "@/lib/geo/entity-types"
import {
  buildEnterpriseSkillSystemPrompt,
  buildEnterpriseSkillUserPrompt,
  extractSkillDescription,
  type EnterpriseDocInput,
} from "@/lib/geo/enterprise-skill-prompt"
import { completeText, isSonettoLlmProvider, type LlmProviderId } from "@/lib/geo/llm/router"
import {
  fetchHtmlTextMany,
  HTMLTEXT_MAX_URLS,
} from "@/lib/tianapi-htmltext"

export const runtime = "nodejs"
export const maxDuration = 300

const VALID_PROVIDERS = new Set<LlmProviderId>([
  "deepseek",
  "doubao",
  "kimi",
  "gpt",
  "claude",
  "gemini",
])

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

function sanitizeEntity(raw: unknown): GeoEntityData {
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
      provider?: string
      skillName?: string
      entity?: unknown
      documents?: unknown
    }

    const provider = String(body.provider ?? "deepseek") as LlmProviderId
    const skillName = String(body.skillName ?? "").trim()
    const entity = sanitizeEntity(body.entity)
    const documents = sanitizeDocuments(body.documents)

    if (!VALID_PROVIDERS.has(provider)) {
      return NextResponse.json({ error: "不支持的模型 provider" }, { status: 400 })
    }
    if (!skillName) {
      return NextResponse.json({ error: "请填写 Skill 名称" }, { status: 400 })
    }
    if (!entity.companyName && documents.length === 0) {
      return NextResponse.json(
        { error: "请至少填写公司名称或上传一份文档" },
        { status: 400 },
      )
    }

    const authorityPages = await resolveAuthorityPages(entity)

    const system = buildEnterpriseSkillSystemPrompt()
    const user = buildEnterpriseSkillUserPrompt(
      skillName,
      entity,
      documents,
      authorityPages,
    )

    let content: string
    try {
      content = await completeText({
        provider,
        system,
        user,
        maxTokens: 4096,
        billing: isSonettoLlmProvider(provider)
          ? { userId, cookieHeader, refIdPrefix: "geo-skill" }
          : undefined,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "生成失败"
      const statusCode =
        err && typeof err === "object" && "statusCode" in err && typeof (err as { statusCode: number }).statusCode === "number"
          ? (err as { statusCode: number }).statusCode
          : 502
      return NextResponse.json({ error: message }, { status: statusCode })
    }

    // 去除模型可能包裹的 ```markdown 代码块
    const cleaned = content
      .replace(/^```(?:markdown|md)?\s*\n/i, "")
      .replace(/\n```\s*$/i, "")
      .trim()

    const id = `ent-${crypto.randomUUID()}`
    const description = extractSkillDescription(cleaned)

    return NextResponse.json({
      skill: {
        id,
        label: skillName,
        description,
        content: cleaned,
        provider,
        createdAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
})

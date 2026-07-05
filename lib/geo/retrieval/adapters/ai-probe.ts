import { buildSkillContextBlock } from "@/lib/geo/build-skill-context"
import {
  completeText,
  isSonettoLlmProvider,
  type CompleteTextBilling,
  type LlmProviderId,
} from "@/lib/geo/llm/router"
import type { AiProbeResponse } from "@/lib/geo/retrieval/types"

const DEFAULT_PROMPTS = [
  "最好的 AI 视频翻译工具是什么？",
  "如何把视频自动翻译成多种语言？",
  "AI 字幕生成准确率怎么样？",
  "企业如何做视频本地化？",
  "YouTube 视频中文字幕怎么自动生成？",
]

export async function runAiVisibilityProbe(input: {
  topic: string
  brand?: string
  prompts?: string[]
  modelSkillId?: string | null
  enterpriseSnapshot?: string | null
  provider?: LlmProviderId
  billing?: CompleteTextBilling
}): Promise<AiProbeResponse> {
  const provider: LlmProviderId = input.provider ?? "deepseek"
  const prompts = (input.prompts?.length ? input.prompts : DEFAULT_PROMPTS).slice(0, 10)
  const brand = input.brand?.trim() || "Your Brand"

  const system = `你是 GEO（生成式引擎优化）分析助手。模拟 ChatGPT/Claude/Gemini/Perplexity 在回答用户问题时，会如何引用品牌与外部来源。
输出必须是合法 JSON，不要 markdown 代码块。字段：
{
  "mentionLikelihood": "low"|"medium"|"high",
  "citedSources": string[],
  "gaps": [{ "prompt": string, "missingTopics": string[], "suggestedParagraph": string }]
}`

  const user = `主题：${input.topic}
品牌：${brand}
请针对以下提示词分析品牌被提及/引用的可能性，并给出内容缺口与建议补充段落：
${prompts.map((p, i) => `${i + 1}. ${p}`).join("\n")}`

  const skillBlock = buildSkillContextBlock({
    modelSkillId: input.modelSkillId,
    enterpriseSnapshot: input.enterpriseSnapshot,
  })
  const userWithSkills = skillBlock ? `${user}\n\n${skillBlock}` : user

  const content = await completeText({
    provider,
    system,
    user: userWithSkills,
    maxTokens: 2048,
    billing:
      isSonettoLlmProvider(provider) && input.billing
        ? { ...input.billing, refIdPrefix: input.billing.refIdPrefix || "geo-probe" }
        : undefined,
  })

  let parsed: Record<string, unknown>
  try {
    const cleaned = content.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "")
    parsed = JSON.parse(cleaned) as Record<string, unknown>
  } catch {
    parsed = {}
  }

  const likelihood = parsed.mentionLikelihood
  const mentionLikelihood =
    likelihood === "low" || likelihood === "medium" || likelihood === "high" ? likelihood : "medium"

  const citedSources = Array.isArray(parsed.citedSources)
    ? parsed.citedSources.map((s) => String(s)).filter(Boolean)
    : []

  const gaps = Array.isArray(parsed.gaps)
    ? parsed.gaps.slice(0, 10).map((g) => {
        const o = (g && typeof g === "object" ? g : {}) as Record<string, unknown>
        return {
          prompt: String(o.prompt ?? ""),
          missingTopics: Array.isArray(o.missingTopics)
            ? o.missingTopics.map((t) => String(t))
            : [],
          suggestedParagraph: String(o.suggestedParagraph ?? ""),
        }
      })
    : []

  const engineLabel =
    provider === "gpt"
      ? "gpt-5.5"
      : provider === "claude"
        ? "claude-opus"
        : provider

  return {
    topic: input.topic,
    brand,
    simulated: true,
    engine: `${engineLabel}-proxy`,
    mentionLikelihood,
    citedSources,
    gaps,
    disclaimer: `本结果为 ${engineLabel} 代理模拟，不代表 ChatGPT/Claude/Gemini/Perplexity 真实回答；用于内容缺口规划。`,
  }
}

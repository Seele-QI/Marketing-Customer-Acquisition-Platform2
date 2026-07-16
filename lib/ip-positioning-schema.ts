import {
  DEFAULT_IP_POSITIONING_MODEL,
  FALLBACK_IP_POSITIONING_MODEL,
  IP_POSITIONING_ALLOWED_MODELS,
  type StageId,
} from "@/lib/ip-positioning-skill"
import { isSonettoProviderConfigured } from "@/lib/llm/sonetto-client"
import { getSonettoModel } from "@/lib/llm/model-registry"

export type IpPositioningIntake = {
  stage: StageId | null
  industry: string
  keyExperiences: string
  resources: string
  contrarianTrigger: string
  frequentQuestions: string
  uniqueExperience: string
  targetAudience: string
  shortTermMonetization: string
  longTermVision: string
  excludeAudience: string
  contentFormats: string
  outputFrequency: string
  rememberedVibe: string
  extraInfo: string
}

export type UploadedDocumentPayload = {
  name: string
  type: string
  size: number
  base64?: string
}

export type ExtractedDocument = {
  name: string
  type: string
  size: number
  text: string
  truncated: boolean
  error?: string
}

export type IpPositioningRequestBody = {
  modelId?: string
  intake?: Partial<IpPositioningIntake>
  /** @deprecated legacy flat fields */
  stage?: string | null
  stageHint?: string
  industry?: string
  background?: string
  skills?: string
  extraInfo?: string
  files?: UploadedDocumentPayload[]
}

export type PlatformPlan = {
  platform: string
  priority: number
  reason: string
  contentStrategy: string
}

export type MonetizationStep = {
  stage: string
  offer: string
  priceRange: string
  whyNow: string
}

export type ActionItem = {
  week: string
  actions: string[]
}

export type IpPositioningReport = {
  oneLiner: string
  sharpDiagnosis: string
  cognitivePosition: string
  whyYouNotOthers: string
  differentiationLever: string
  contrarianBelief: string
  uniqueMechanism: string
  audienceProfile: string
  corePainAndDesire: string
  avoidDirections: string[]
  platformPlans: PlatformPlan[]
  contentPillars: string[]
  starterTopics: string[]
  monetizationLadder: MonetizationStep[]
  thirtyDayPlan: ActionItem[]
  confidenceScore: number
}

export type IpPositioningAnalysisMeta = {
  model: string
  durationMs: number
  promptTokens: number
  completionTokens: number
  estimatedCostUSD: string
  documentsUsed: number
}

export const INTAKE_FIELD_LIMITS: Record<keyof IpPositioningIntake, number> = {
  stage: 20,
  industry: 200,
  keyExperiences: 2000,
  resources: 1000,
  contrarianTrigger: 1000,
  frequentQuestions: 1000,
  uniqueExperience: 1000,
  targetAudience: 1000,
  shortTermMonetization: 500,
  longTermVision: 500,
  excludeAudience: 500,
  contentFormats: 500,
  outputFrequency: 200,
  rememberedVibe: 200,
  extraInfo: 1000,
}

export const EMPTY_INTAKE: IpPositioningIntake = {
  stage: null,
  industry: "",
  keyExperiences: "",
  resources: "",
  contrarianTrigger: "",
  frequentQuestions: "",
  uniqueExperience: "",
  targetAudience: "",
  shortTermMonetization: "",
  longTermVision: "",
  excludeAudience: "",
  contentFormats: "",
  outputFrequency: "",
  rememberedVibe: "",
  extraInfo: "",
}

const REQUIRED_INTAKE_KEYS = [
  "industry",
  "keyExperiences",
  "resources",
  "contrarianTrigger",
  "frequentQuestions",
  "uniqueExperience",
  "targetAudience",
  "shortTermMonetization",
  "longTermVision",
  "contentFormats",
  "outputFrequency",
  "rememberedVibe",
] as const satisfies readonly (keyof IpPositioningIntake)[]

type RequiredIntakeKey = (typeof REQUIRED_INTAKE_KEYS)[number]

export const INTAKE_FIELD_LABELS: Record<RequiredIntakeKey, string> = {
  industry: "当前职业 / 行业",
  keyExperiences: "关键经历与代表成果",
  resources: "现有资源 / 人脉 / 客户基础",
  contrarianTrigger: "你最看不惯行业里的什么「常识」",
  frequentQuestions: "别人总会来问你什么问题",
  uniqueExperience: "你经历过什么别人没经历过",
  targetAudience: "你希望吸引哪类人",
  shortTermMonetization: "你短期最想变现什么",
  longTermVision: "长期想成为什么",
  contentFormats: "你更适合哪种内容形式",
  outputFrequency: "你能稳定输出的频率",
  rememberedVibe: "你想被记住的气质",
}

export function getMissingIntakeFieldLabels(intake: IpPositioningIntake): string[] {
  return REQUIRED_INTAKE_KEYS.filter((key) => !intake[key]?.trim()).map(
    (key) => INTAKE_FIELD_LABELS[key],
  )
}

function clampText(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : ""
  return text.length > max ? text.slice(0, max) : text
}

function parseStage(value: unknown): StageId | null {
  if (value === "novice" || value === "growth" || value === "mature") return value
  return null
}

/** 兼容旧版 flat body → 新版 intake */
export function normalizeIntake(body: IpPositioningRequestBody): IpPositioningIntake {
  const intake = body.intake ?? {}
  const stage =
    parseStage(intake.stage) ??
    parseStage(body.stage) ??
    (typeof body.stage === "string" && body.stage.includes("新手")
      ? "novice"
      : typeof body.stage === "string" && body.stage.includes("成长")
        ? "growth"
        : typeof body.stage === "string" && body.stage.includes("成熟")
          ? "mature"
          : null)

  return {
    stage,
    industry: clampText(intake.industry ?? body.industry, INTAKE_FIELD_LIMITS.industry),
    keyExperiences: clampText(
      intake.keyExperiences ?? body.background,
      INTAKE_FIELD_LIMITS.keyExperiences,
    ),
    resources: clampText(intake.resources ?? body.skills, INTAKE_FIELD_LIMITS.resources),
    contrarianTrigger: clampText(intake.contrarianTrigger, INTAKE_FIELD_LIMITS.contrarianTrigger),
    frequentQuestions: clampText(intake.frequentQuestions, INTAKE_FIELD_LIMITS.frequentQuestions),
    uniqueExperience: clampText(intake.uniqueExperience, INTAKE_FIELD_LIMITS.uniqueExperience),
    targetAudience: clampText(intake.targetAudience, INTAKE_FIELD_LIMITS.targetAudience),
    shortTermMonetization: clampText(
      intake.shortTermMonetization,
      INTAKE_FIELD_LIMITS.shortTermMonetization,
    ),
    longTermVision: clampText(intake.longTermVision, INTAKE_FIELD_LIMITS.longTermVision),
    excludeAudience: clampText(intake.excludeAudience, INTAKE_FIELD_LIMITS.excludeAudience),
    contentFormats: clampText(intake.contentFormats, INTAKE_FIELD_LIMITS.contentFormats),
    outputFrequency: clampText(intake.outputFrequency, INTAKE_FIELD_LIMITS.outputFrequency),
    rememberedVibe: clampText(intake.rememberedVibe, INTAKE_FIELD_LIMITS.rememberedVibe),
    extraInfo: clampText(intake.extraInfo ?? body.extraInfo, INTAKE_FIELD_LIMITS.extraInfo),
  }
}

export function validateIntake(intake: IpPositioningIntake): string | null {
  const missing = getMissingIntakeFieldLabels(intake)
  if (missing.length === 0) return null
  return `缺少必填：${missing.join("、")}`
}

export function resolveIpPositioningModel(requested?: string): {
  modelId: string
  error?: string
} {
  const preferred =
    requested && IP_POSITIONING_ALLOWED_MODELS.includes(requested as (typeof IP_POSITIONING_ALLOWED_MODELS)[number])
      ? requested
      : DEFAULT_IP_POSITIONING_MODEL

  const tryOrder =
    preferred === DEFAULT_IP_POSITIONING_MODEL
      ? [DEFAULT_IP_POSITIONING_MODEL, FALLBACK_IP_POSITIONING_MODEL]
      : [FALLBACK_IP_POSITIONING_MODEL, DEFAULT_IP_POSITIONING_MODEL]

  for (const modelId of tryOrder) {
    const def = getSonettoModel(modelId)
    if (!def) continue
    if (isSonettoProviderConfigured(def.provider)) {
      return { modelId }
    }
  }

  return {
    modelId: preferred,
    error: "未配置 NEWAPI_KEY（或 SONETTO_GPT_API_KEY / SONETTO_CLAUDE_API_KEY），无法生成 IP 定位报告",
  }
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === "string")
}

function validatePlatformPlan(value: unknown): value is PlatformPlan {
  if (!value || typeof value !== "object") return false
  const o = value as Record<string, unknown>
  return (
    typeof o.platform === "string" &&
    typeof o.priority === "number" &&
    typeof o.reason === "string" &&
    typeof o.contentStrategy === "string"
  )
}

function validateMonetizationStep(value: unknown): value is MonetizationStep {
  if (!value || typeof value !== "object") return false
  const o = value as Record<string, unknown>
  return (
    typeof o.stage === "string" &&
    typeof o.offer === "string" &&
    typeof o.priceRange === "string" &&
    typeof o.whyNow === "string"
  )
}

function validateActionItem(value: unknown): value is ActionItem {
  if (!value || typeof value !== "object") return false
  const o = value as Record<string, unknown>
  return typeof o.week === "string" && isStringArray(o.actions)
}

export function validateIpPositioningReport(value: unknown): value is IpPositioningReport {
  if (!value || typeof value !== "object") return false
  const o = value as Record<string, unknown>
  return (
    typeof o.oneLiner === "string" &&
    typeof o.sharpDiagnosis === "string" &&
    typeof o.cognitivePosition === "string" &&
    typeof o.whyYouNotOthers === "string" &&
    typeof o.differentiationLever === "string" &&
    typeof o.contrarianBelief === "string" &&
    typeof o.uniqueMechanism === "string" &&
    typeof o.audienceProfile === "string" &&
    typeof o.corePainAndDesire === "string" &&
    isStringArray(o.avoidDirections) &&
    Array.isArray(o.platformPlans) &&
    o.platformPlans.every(validatePlatformPlan) &&
    isStringArray(o.contentPillars) &&
    isStringArray(o.starterTopics) &&
    Array.isArray(o.monetizationLadder) &&
    o.monetizationLadder.every(validateMonetizationStep) &&
    Array.isArray(o.thirtyDayPlan) &&
    o.thirtyDayPlan.every(validateActionItem) &&
    typeof o.confidenceScore === "number"
  )
}

/** 从 AI 回复中提取 JSON（兼容 markdown code block 包裹） */
export function extractJsonFromText(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1]!.trim()

  const firstBrace = text.indexOf("{")
  const lastBrace = text.lastIndexOf("}")
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1)
  }

  return text
}

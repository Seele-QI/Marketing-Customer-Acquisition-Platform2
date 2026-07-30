/**
 * 数字人视频创作（新）— 大模型分镜规划。
 * 模型 URL、Key、Model 与调用顺序完全来自云端功能绑定。
 */

import { readServerEnv } from "@/lib/server-env"
import {
  completeCloudFeatureChat,
  listCloudFeatureProviderCandidates,
  type CloudChatContentPart,
  type CloudChatMessage,
  type CloudFeatureProviderCandidate,
} from "@/lib/llm/cloud-feature-completion"
import {
  assessScriptDuration,
  countScriptChars,
  buildLocalScriptPlan,
  DH_V2_DIALOGUE_CHARS_MAX,
  DH_V2_DIALOGUE_CHARS_MIN,
  type DhV2ScriptPlan,
} from "./script-plan"
import { extractPlanJsonBlock, mergeAiPlanFromResponse } from "./plan-script-parse"
import {
  calculateDhV2PlanMaxTokens,
  runDhV2PlanProviderChain,
} from "./plan-provider-chain"
const PLAN_LLM_TEMPERATURE = 0.2
const DEFAULT_PLAN_PROVIDER_TIMEOUT_MS = 60_000
const DEFAULT_PLAN_TOTAL_TIMEOUT_MS = 150_000
const PLAN_SCRIPT_FEATURE_ID = "video.dh.plan_script"

export type DhV2PlanLlmProvider = string

const SYSTEM_PROMPT = `你是一位精通 Seedance 2.0 的数字人视频导演。

用户会提供完整口播文案、视频创作想法，以及参考图（@图1 为视频固定首帧人物）。

请按语义将口播拆成多段，每段对应固定 15 秒视频，并为每段生成：
1. dialogue：该段口播台词（必须从原文截取/重组，保持语义完整，顺序不变）
2. shot_details：本分镜画面细节（场景、人物状态、光线、构图，中文 40-80 字）
3. video_prompt：Seedance 2.0 视频生成提示词，须含【主体】【动作】【环境】【镜头】【风格】【时间轴】【约束】等标签

【时间轴】硬性要求（最重要，video_prompt 内必须严格执行）：
- 将 dialogue 的全部台词按时间段拆分写入【时间轴】，每段格式：Xs-Ys：口播「该时段要说的原文字句」+ 简要动作/表情/镜头
- 每句/短语时长按有效字数 ÷ 3.45 字/秒估算（有效字不含标点与空格），区间可变，禁止固定 0-5-10-15 均分
- 时间段须从 0 到 15 秒连续覆盖，首尾相接、无空档
- 口播「」内必须是 dialogue 字段的原文摘录，字句一致，仅可按标点自然切分，禁止改写、概括、省略
- dialogue 每一个有效字都必须出现在【时间轴】某一时段的口播引号内，不得遗漏
- 禁止只写「0-4s 引出观点」「4-9s 强调卖点」这类语义概括；必须写「0-4s：口播「……原文……」」
- 有音频参考时，在对应时段注明 @音频1 驱动口型

【时间轴】示例（15 秒段，可变区间）：
【时间轴】0-6s：口播「实体店做IP，少拍产品多拍人，反而卖得更多。」@图1 正面看镜头；6-13s：口播「百分之九十九的老板都搞错了，一拿起手机就对着产品一顿拍。」手势强调；13-15s：口播「这才是正确做法。」点头收尾

其他硬性规则：
- 语速 3.3–3.6 字/秒（有效字不含标点与空格）；每段 dialogue 有效字数必须在 ${DH_V2_DIALOGUE_CHARS_MIN}–${DH_V2_DIALOGUE_CHARS_MAX} 字之间
- 禁止输出 dialogue 为空的段
- 参考图用 @图1；多图时可用 @图2
- 有音频参考时注明 @音频1 驱动口型
- 多段时第 2 段起注明「承接前段叙事」，服装场景一致
- 结合参考图描述人物外貌、场景、光线与构图
- 每次请求须重新创作，禁止套用固定模板或重复上一轮的套话

只输出 JSON，无 markdown：
{
  "segments": [
    {"dialogue": "...", "shot_details": "...", "video_prompt": "..."}
  ]
}`

export type DhV2PlanScriptAiInput = {
  script: string
  creative_idea: string
  images_base64?: string[]
  has_audio_ref?: boolean
}

export type DhV2PlanScriptAiResult =
  | { ok: true; plan: DhV2ScriptPlan; plan_source: DhV2PlanLlmProvider }
  | { ok: false; status: number; detail: string }

export function getAvailablePlanLlmProviders(): CloudFeatureProviderCandidate[] {
  return listCloudFeatureProviderCandidates(PLAN_SCRIPT_FEATURE_ID)
}

export function isLlmPlanAvailable(): boolean {
  return getAvailablePlanLlmProviders().length > 0
}

/** @deprecated 使用 isLlmPlanAvailable */
export function isSonettoPlanAvailable(): boolean {
  return isLlmPlanAvailable()
}

function toImageUrl(data: string): string {
  const raw = (data || "").trim()
  if (raw.startsWith("data:")) return raw
  return `data:image/jpeg;base64,${raw}`
}

function buildUserText(input: DhV2PlanScriptAiInput): string {
  const assessment = assessScriptDuration(input.script)
  const lines = [
    `完整口播文案：${input.script.trim()}`,
    `视频创作想法：${(input.creative_idea || "").trim() || "专业数字人口播，竖屏 9:16"}`,
    `总字数约 ${assessment.char_count} 字，建议 ${assessment.segment_count} 段 × 15 秒`,
    `每段台词有效字数要求：${DH_V2_DIALOGUE_CHARS_MIN}–${DH_V2_DIALOGUE_CHARS_MAX} 字（标点与空格不计，语速 3.3–3.6 字/秒）`,
    `请求编号：${Date.now()}`,
  ]
  if (input.has_audio_ref) lines.push("已上传参考音频：是（提示词中注明 @音频1）")
  lines.push(
    "video_prompt 的【时间轴】须逐段写明口播原文（口播「…」），按句字数推算可变秒数、连续覆盖 0-15s，禁止固定 5 秒均分，且与 dialogue 字段字句完全一致，禁止语义概括。",
  )
  lines.push("\n请结合参考图，按语义拆段并输出 JSON segments 数组。")
  return lines.join("\n")
}

function buildCloudUserContent(input: DhV2PlanScriptAiInput): CloudChatContentPart[] {
  const parts: CloudChatContentPart[] = []
  const imgs = (input.images_base64 || []).slice(0, 3)
  for (const img of imgs) {
    parts.push({ type: "image_url", image_url: { url: toImageUrl(img) } })
  }
  parts.push({ type: "text", text: buildUserText(input) })
  return parts
}

function readBoundedTimeout(name: string, fallback: number, max: number): number {
  const raw = readServerEnv(name)
  const parsed = Number(raw)
  if (!raw || !Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(max, Math.max(5_000, Math.floor(parsed)))
}

export function readDhV2PlanProviderTimeoutMs(): number {
  return readBoundedTimeout(
    "DH_V2_PLAN_PROVIDER_TIMEOUT_MS",
    DEFAULT_PLAN_PROVIDER_TIMEOUT_MS,
    120_000,
  )
}

export function readDhV2PlanTotalTimeoutMs(): number {
  return readBoundedTimeout(
    "DH_V2_PLAN_TOTAL_TIMEOUT_MS",
    DEFAULT_PLAN_TOTAL_TIMEOUT_MS,
    300_000,
  )
}

function parsePlanFromLlmText(
  script: string,
  text: string,
): { ok: true; plan: DhV2ScriptPlan } | { ok: false; detail: string } {
  try {
    const data = extractPlanJsonBlock(text)
    const segs = data.segments
    if (!Array.isArray(segs) || segs.length === 0) {
      return { ok: false, detail: "AI 未返回有效 segments" }
    }
    const parsed = segs
      .filter((s): s is Record<string, unknown> => typeof s === "object" && s !== null)
      .map((s) => ({
        dialogue: String(s.dialogue ?? ""),
        shot_details: String(s.shot_details ?? ""),
        video_prompt: String(s.video_prompt ?? ""),
      }))
    const plan = mergeAiPlanFromResponse(script, parsed)
    if (plan.segments.length === 0) {
      return { ok: false, detail: "请填写有效口播台词" }
    }
    return { ok: true, plan }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, detail: `分镜 JSON 解析失败: ${msg}` }
  }
}

async function callPlanProvider(
  provider: CloudFeatureProviderCandidate,
  input: DhV2PlanScriptAiInput,
  timeoutMs: number,
  maxTokens: number,
): Promise<{ ok: true; text: string } | { ok: false; status: number; detail: string }> {
  const messages: CloudChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: buildCloudUserContent(input) },
  ]
  const result = await completeCloudFeatureChat({
    providers: [provider],
    messages,
    maxTokens,
    timeoutMs,
    temperature: PLAN_LLM_TEMPERATURE,
    structuredJson: true,
    disableReasoning: true,
  })
  if (!result.ok) return result
  return { ok: true, text: result.text }
}

/** 从 AI 文本中提取 JSON — 再导出供测试 */
export { extractPlanJsonBlock, mergeAiPlanFromResponse } from "./plan-script-parse"

export async function generateDhV2PlanWithLlm(
  input: DhV2PlanScriptAiInput,
): Promise<DhV2PlanScriptAiResult> {
  if (!countScriptChars(input.script)) {
    return { ok: false, status: 400, detail: "请填写口播文案" }
  }

  const providers = getAvailablePlanLlmProviders()
  if (providers.length === 0) {
    return {
      ok: false,
      status: 503,
      detail: "云端未给 video.dh.plan_script 下发可用模型，请在模型配置中心绑定并启用模型。",
    }
  }

  const assessment = assessScriptDuration(input.script)
  const maxTokens = calculateDhV2PlanMaxTokens(assessment.segment_count)
  const providerById = new Map(providers.map((provider) => [String(provider.id), provider]))
  const chain = await runDhV2PlanProviderChain({
    providers: providers.map((provider) => String(provider.id)),
    providerTimeoutMs: readDhV2PlanProviderTimeoutMs(),
    totalTimeoutMs: readDhV2PlanTotalTimeoutMs(),
    call: async (providerId, timeoutMs) => {
      const provider = providerById.get(providerId)
      if (!provider) {
        return { ok: false as const, status: 503, detail: `云端模型 ${providerId} 不存在` }
      }
      const startedAt = Date.now()
      const llm = await callPlanProvider(provider, input, timeoutMs, maxTokens)
      const durationMs = Date.now() - startedAt
      console.info(
        `[dh-v2-plan] provider_id=${provider.id} provider=${provider.name} model=${provider.model} duration_ms=${durationMs} timeout_ms=${timeoutMs} ok=${llm.ok}`,
      )
      if (!llm.ok) return llm
      const parsed = parsePlanFromLlmText(input.script, llm.text)
      if (!parsed.ok) return { ok: false as const, status: 502, detail: parsed.detail }
      return { ok: true as const, value: parsed.plan }
    },
  })

  if (chain.ok) {
    const provider = providerById.get(chain.provider)
    return {
      ok: true,
      plan: chain.value,
      plan_source: provider ? `${provider.name} / ${provider.model}` : chain.provider,
    }
  }
  console.warn(`[dh-v2-plan] all cloud providers failed; using deterministic local plan: ${chain.detail}`)
  return {
    ok: true,
    plan: buildLocalScriptPlan(
      input.script,
      input.creative_idea,
      Boolean(input.has_audio_ref),
    ),
    plan_source: "本地可靠分镜（云模型暂不可用）",
  }
}

/** @deprecated 使用 generateDhV2PlanWithLlm */
export async function generateDhV2PlanWithSonetto(
  input: DhV2PlanScriptAiInput,
): Promise<DhV2PlanScriptAiResult> {
  return generateDhV2PlanWithLlm(input)
}

/** 读取并发段数上限（pipeline 在 Python 侧） */
export function readDhV2MaxParallelSegments(): number {
  const raw = readServerEnv("DH_V2_MAX_PARALLEL_SEGMENTS")
  const n = parseInt(raw || "4", 10)
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 8) : 4
}

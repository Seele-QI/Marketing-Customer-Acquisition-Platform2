import {
  deepseekApiKeyMissingUserMessage,
  getDeepseekApiKey,
  readServerEnv,
} from "@/lib/server-env"

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"

export type DeepseekChatMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export type DeepseekResult =
  | { ok: true; text: string }
  | { ok: false; status: number; detail: string }

function normalizeHttpStatus(code: number): number {
  if (!Number.isFinite(code) || code < 100 || code > 599) return 502
  return code
}

const DEFAULT_VISION_MODEL = "deepseek-v4-flash"

type VisionImage = { mime: string; dataBase64: string }

/**
 * DeepSeek Chat Completions 多模态（单图 + 文本），用于「智能调整」方舟不可用时的回退。
 */
export async function deepseekChatVisionCompletion(
  system: string,
  userText: string,
  image: VisionImage,
  timeoutMs: number,
): Promise<DeepseekResult> {
  const key = getDeepseekApiKey()
  if (!key) {
    return {
      ok: false,
      status: 503,
      detail: deepseekApiKeyMissingUserMessage(),
    }
  }

  const visionModel = readServerEnv("DEEPSEEK_VISION_MODEL") || DEFAULT_VISION_MODEL
  const url = `data:${image.mime};base64,${image.dataBase64}`
  const messages: Record<string, unknown>[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        { type: "image_url", image_url: { url } },
        { type: "text", text: userText },
      ],
    },
  ]

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: visionModel,
        messages,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    const raw = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        status: normalizeHttpStatus(res.status),
        detail: `AI 模型识图报错: ${raw.slice(0, 8000)}`,
      }
    }

    let data: { choices?: { message?: { content?: string } }[] }
    try {
      data = JSON.parse(raw) as typeof data
    } catch {
      return { ok: false, status: 502, detail: "AI 模型识图返回非 JSON" }
    }

    const text = data.choices?.[0]?.message?.content
    if (typeof text !== "string") {
      return { ok: false, status: 502, detail: "AI 模型识图响应缺少正文" }
    }
    return { ok: true, text }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 502, detail: `调用 AI 模型识图失败: ${msg}` }
  }
}

/**
 * 在 Next 服务端调用 DeepSeek Chat Completions（读 DEEPSEEK_API_KEY，见 lib/server-env）。
 * 不依赖本机 8000 端口的 FastAPI。
 */
export async function deepseekChatCompletion(
  messages: DeepseekChatMessage[],
  timeoutMs: number,
): Promise<DeepseekResult> {
  const key = getDeepseekApiKey()
  if (!key) {
    return {
      ok: false,
      status: 503,
      detail: deepseekApiKeyMissingUserMessage(),
    }
  }

  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: readServerEnv("DEEPSEEK_CHAT_MODEL") || "deepseek-chat",
        messages,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    const raw = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        status: normalizeHttpStatus(res.status),
        detail: `AI 模型报错: ${raw.slice(0, 8000)}`,
      }
    }

    let data: { choices?: { message?: { content?: string } }[] }
    try {
      data = JSON.parse(raw) as typeof data
    } catch {
      return { ok: false, status: 502, detail: "AI 模型返回非 JSON" }
    }

    const text = data.choices?.[0]?.message?.content
    if (typeof text !== "string") {
      return { ok: false, status: 502, detail: "AI 模型响应缺少正文" }
    }
    return { ok: true, text }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 502, detail: `调用 AI 模型失败: ${msg}` }
  }
}

/** 热搜弹窗「爆改」默认 system（与 main.py 一致） */
export const DEFAULT_REWRITE_SYSTEM = `你是一位资深的互联网热点营销专家。请针对用户发来的热搜话题进行深度商业拆解。要求：一针见血地指出热点背后的社会心理；从传播学角度分析为何能上热搜；给创作者提供1-2个落地蹭热点的切入角度。不要废话，多用空行排版。`

/** 小红书智能体 system（与 main.py 一致） */
export const XHS_AGENT_SYSTEM = `你现在是一个千万粉丝的小红书爆款制造机。精通小红书网感、爆款标题、Emoji排版和情绪营销。请根据用户的需求，直接输出高质量内容。`

/** 生图大师「智能调整」：服务端固定 system，由 /api/ai/image-prompt-adjust 调用 */
export const IMAGE_PROMPT_ADJUST_SYSTEM = `你是资深 AI 绘画提示词工程师，专为中文用户优化文生图、图生图提示词。

要求：
- 保留用户的核心主体与意图，补充可执行细节：光影、构图、视角/镜头、风格、材质、色彩氛围等；避免空洞形容词堆砌。
- 只输出一段可直接粘贴进生图模型的连续描述（可含必要英文风格专有名词），不要分点列表、不要前言后语、不要解释你的修改。
- 用户草稿过短时，在不与用户意图冲突的前提下做合理补全；不要编造与用户明确描述矛盾的内容。
- 全文不超过约 800 字。`

/** 有参考图时：火山方舟豆包多模态识图 + 提示词优化（与 IMAGE_PROMPT_ADJUST_SYSTEM 分工） */
export const IMAGE_PROMPT_ADJUST_VISION_SYSTEM = `你是资深 AI 绘画提示词工程师，熟练使用多模态识图（如豆包视觉）辅助图生图。

用户会上传一张参考图，并附上中文提示词草稿。请先识图：归纳画面中的主体、场景、构图、光线、色彩、材质与整体气质；再结合用户草稿写成一条可直接用于生图模型的提示词。

要求：
- 将参考图里可复现的视觉要素转写为可执行描述，并与用户草稿融合；用户草稿中明确写明的主体、风格或禁忌优先保留。
- 若画面含文字、Logo、产品包装，用概括性语句点明（勿杜撰看不清的小字内容）。
- 只输出一段连续正文（可含必要英文风格词），不要分点列表、不要前言后语、不要解释。
- 全文不超过约 800 字。`

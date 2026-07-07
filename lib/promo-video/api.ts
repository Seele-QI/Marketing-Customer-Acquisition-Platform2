/** 宣传视频 API 客户端 — 同源 Next.js 代理 /api/promo-video/* */

const JSON_HEADERS = { "Content-Type": "application/json" }
const FETCH_OPTS: RequestInit = { credentials: "include" }

const NETWORK_HINT =
  "无法连接后端服务，请确认已启动 FastAPI（pnpm dev:all 或 uvicorn main:app --port 8000）"

async function promoFetch(path: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { ...FETCH_OPTS, ...init })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/failed to fetch|networkerror|load failed/i.test(msg)) {
      throw new Error(NETWORK_HINT)
    }
    throw e
  }
}

function parseDetail(data: { detail?: unknown }): string {
  const d = data.detail
  if (typeof d === "string") return d
  if (d && typeof d === "object") {
    const o = d as { message?: string; code?: string }
    if (o.message) return o.message
    if (o.code) return o.code
  }
  return "请求失败"
}

/** 将后端/RH 原始错误转为用户可读文案 */
export function formatPromoError(raw: string): string {
  const s = raw.trim()
  if (!s) {
    return "分镜生成失败（未收到详细错误，请查看后端日志或重试）"
  }
  if (/无 taskId|未返回 taskId|RH 提交未返回/i.test(s)) {
    return `分镜工作流未成功提交到 RunningHub：${s}。请检查 API Key 权限或切换「官方」路线后重试。`
  }
  if (/server disconnected|connection reset|eof/i.test(s)) {
    return "RunningHub 连接中断，请稍后点击「返回重试」。若反复出现，可在控制台切换「官方」路线或联系 RH 客服。"
  }
  if (/LLM API returned empty content/i.test(s)) {
    return "RunningHub 内部 LLM 返回空内容，请简化宣传文案后重试，或切换「官方」路线。"
  }
  if (/下载校验失败/i.test(s)) {
    return s
  }
  if (/1007|Could not decode image/i.test(s)) {
    return "分镜图未正确上传，请重试生成视频"
  }
  if (/下载九宫格|下载失败|ConnectError|connection attempts failed|网络连接/i.test(s)) {
    return "九宫格分镜图下载失败（多为网络/代理问题）。请点击「重试裁切」或「返回重试」；若反复失败，请关闭系统代理后重试。"
  }
  if (/not_found|Storyboard not found|分镜任务不存在|任务已失效|接口不存在/i.test(s)) {
    return "分镜任务已失效（服务可能已重启）。请点击「返回上一步」或回到步骤 2 重新生成分镜后再试。"
  }
  return s
}

export type PromoStoryboardPayload = {
  product_prompt: string
  promo_script: string
  product_image?: string
  audio_base64?: string
  duration: number
  frame_count: number
  ratio: string
  channel: string
  resolution: string
  image_mode: string
  instance_type: string
  /** @deprecated backward compat — ignored when promo_script is set */
  product_name?: string
  selling_points?: string[]
  target_audience?: string
  style?: string
}

export type PromoStoryboardStatus = {
  status: string
  progress?: number
  frame_urls?: string[]
  creative_prompt?: string
  error?: string
  stage?: string
  stage_label?: string
  rh_task_id?: string
  rh_crop_task_id?: string
  frame_count?: number
  failed_stage?: string
}

export type PromoVideoStatus = {
  status: string
  progress?: number
  video_url?: string
  error?: string
  rh_video_task_ids?: string[]
  segment_count?: number
  segments_completed?: number
}

export async function submitPromoStoryboard(payload: PromoStoryboardPayload) {
  const r = await promoFetch("/api/promo-video/submit", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(parseDetail(data))
  return data as { task_id: string }
}

export async function queryPromoStoryboardStatus(taskId: string): Promise<PromoStoryboardStatus> {
  const r = await promoFetch(
    `/api/promo-video/storyboard-status?taskId=${encodeURIComponent(taskId)}`,
  )
  if (!r.ok) {
    const data = await r.json().catch(() => ({}))
    throw new Error(parseDetail(data))
  }
  return r.json()
}

export async function requestPromoAutoPrompt(input: {
  promo_script: string
  duration: number
  selected_count: number
  visual_style?: string
  has_audio_ref?: boolean
}) {
  const r = await promoFetch("/api/promo-video/auto-prompt", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(parseDetail(data))
  return data as { prompt?: string }
}

export async function submitPromoVideo(payload: {
  storyboard_task_id: string
  selected_indices: number[]
  video_prompt: string
  duration?: number
  promo_script?: string
  video_resolution?: string
  real_person_mode?: boolean
  instance_type?: string
  ratio?: string
}) {
  const r = await promoFetch("/api/promo-video/generate-video", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })
  const raw = await r.text()
  let data: { detail?: unknown; task_id?: string } = {}
  try {
    data = raw ? (JSON.parse(raw) as typeof data) : {}
  } catch {
    throw new Error(
      r.status >= 500
        ? "服务器内部错误，请查看后端日志或稍后重试"
        : raw.slice(0, 200) || "请求失败",
    )
  }
  if (!r.ok) throw new Error(formatPromoError(parseDetail(data)))
  return data as { task_id: string }
}

export async function queryPromoVideoStatus(taskId: string): Promise<PromoVideoStatus> {
  const r = await promoFetch(
    `/api/promo-video/video-status?taskId=${encodeURIComponent(taskId)}`,
  )
  if (!r.ok) {
    const data = await r.json().catch(() => ({}))
    throw new Error(parseDetail(data))
  }
  return r.json()
}

export async function retryPromoCrop(taskId: string) {
  const r = await promoFetch("/api/promo-video/retry-crop", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ taskId }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(parseDetail(data))
  return data as { task_id: string; status: string }
}

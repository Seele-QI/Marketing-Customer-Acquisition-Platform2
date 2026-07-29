/** 数字人视频创作（新）API 客户端 — Next.js 代理 /api/dh-video-v2/* */

import { parseApiErrorResponse } from "@/lib/api/parse-detail"
import { promptLoginRequired } from "@/lib/auth/prompt-login"
import type {
  DhV2PlanScriptRequest,
  DhVideoV2Status,
  DhVideoV2SubmitPayload,
  DhVideoV2SubmitResponse,
} from "./types"
import type { DhV2ScriptPlan } from "./script-plan"

export type { DhV2PlanScriptRequest, DhV2ScriptPlan }

/** 分镜 AI 慢速阈值（毫秒） */
export const PLAN_SCRIPT_SLOW_MS = 120_000

/** 安装包 sync 后等待 Next 注入 Key 的轮询上限 */
const PLAN_READY_POLL_MS = 90_000
const PLAN_READY_INTERVAL_MS = 1_500

const JSON_HEADERS = { "Content-Type": "application/json" }
const FETCH_OPTS: RequestInit = { credentials: "include" }
const STATUS_POLL_TIMEOUT_MS = 20_000

const NETWORK_HINT =
  typeof window !== "undefined" && window.electronAPI?.isElectron
    ? "无法连接本地服务，请稍候重试；若持续失败请从托盘打开日志文件夹查看 next.log"
    : "无法连接后端服务，请确认已启动 FastAPI（pnpm dev:all 或 uvicorn main:app --port 8000）"

async function dhV2Fetch(
  path: string,
  init?: RequestInit,
  timeoutMs?: number,
): Promise<Response> {
  const timeoutController = timeoutMs && !init?.signal ? new AbortController() : null
  let timedOut = false
  const timeoutId = timeoutController
    ? setTimeout(() => {
        timedOut = true
        timeoutController.abort()
      }, timeoutMs)
    : null
  try {
    return await fetch(path, {
      ...FETCH_OPTS,
      ...init,
      ...(timeoutController ? { signal: timeoutController.signal } : {}),
    })
  } catch (e) {
    if (timedOut) {
      throw new Error("视频任务状态查询超时，将自动重试")
    }
    const msg = e instanceof Error ? e.message : String(e)
    if (/failed to fetch|fetch failed|networkerror|load failed/i.test(msg)) {
      throw new Error(NETWORK_HINT)
    }
    throw e
  } finally {
    if (timeoutId != null) clearTimeout(timeoutId)
  }
}

function parseDetail(data: { detail?: unknown; error?: { message?: string } }): string {
  if (data.error?.message) return data.error.message
  const d = data.detail
  if (typeof d === "string") return d
  if (d && typeof d === "object") {
    const o = d as { message?: string; code?: string }
    if (o.message) return o.message
    if (o.code) return o.code
  }
  return "请求失败"
}

function throwDhV2ApiError(
  status: number,
  data: { detail?: unknown; error?: { message?: string } },
): never {
  const msg = parseApiErrorResponse(status, { detail: data.detail ?? data.error }, parseDetail(data))
  if (status === 401) promptLoginRequired(msg)
  throw new Error(formatDhVideoV2Error(msg, status, data.detail))
}

export function formatDhVideoV2Error(
  raw: string,
  status?: number,
  detail?: unknown,
): string {
  const s = raw.trim()
  if (!s) return "视频生成失败，请稍后重试"

  const code =
    detail && typeof detail === "object"
      ? String((detail as { code?: string }).code || "")
      : ""

  if (code === "PLAN_LLM_NOT_CONFIGURED" || /PLAN_LLM_NOT_CONFIGURED|未配置分镜大模型/i.test(s)) {
    return s.includes("桌面安装包")
      ? s
      : "未配置分镜大模型 API Key。桌面安装包请先登录并等待云端配置同步；开发机请配置 NEWAPI_KEY 或 DEEPSEEK_API_KEY。"
  }
  if (code === "PLAN_LLM_ALL_FAILED" || (status === 502 && /NewAPI|DeepSeek|sonetto|分镜/i.test(s))) {
    if (/NewAPI|DeepSeek|sonetto|timeout|ETIMEDOUT|ECONNREFUSED|fetch failed/i.test(s)) {
      return `分镜大模型调用失败（可能是外网不通或代理干扰）：${s}`
    }
    return s.startsWith("分镜") ? s : `分镜生成失败：${s}`
  }

  if (/尚未接入|501/i.test(s)) return "后端接口预留中，敬请期待"
  // 勿把「未配置分镜…API Key」吞成笼统引擎密钥错误
  if (/Authorization|401|403/i.test(s) && !/分镜|NEWAPI|DEEPSEEK/i.test(s)) {
    return "引擎 API 密钥无效或未配置"
  }
  if (/API Key/i.test(s) && !/分镜|NEWAPI|DEEPSEEK|未配置分镜/i.test(s)) {
    return "引擎 API 密钥无效或未配置"
  }
  if (/too many images|超过.*9.*图/i.test(s)) return "参考图最多 9 张，请减少后重试"
  if (/too many audios|音频.*3/i.test(s)) return "音频参考最多 3 个，请减少后重试"
  if (/unsupported resolution|1080p/i.test(s)) return "当前模型不支持该分辨率，请改用 720p 或切换 Xinghe 2.0"
  return s
}

export type PlanScriptReady = { ready: boolean; providers: string[] }

export async function queryDhVideoV2PlanScriptReady(): Promise<PlanScriptReady> {
  const r = await dhV2Fetch("/api/dh-video-v2/plan-script/ready")
  const data = (await r.json().catch(() => ({}))) as {
    ready?: boolean
    providers?: string[]
  }
  return {
    ready: Boolean(data.ready),
    providers: Array.isArray(data.providers) ? data.providers.map(String) : [],
  }
}

/**
 * 桌面安装包：触发云端 Key sync，并轮询直到分镜 LLM 可用（或超时）。
 * 开发机（非 Electron）：仅探测一次，不可用则抛出明确错误。
 */
export async function ensureDhVideoV2PlanScriptReady(options?: {
  onStatus?: (msg: string) => void
}): Promise<PlanScriptReady> {
  const onStatus = options?.onStatus
  const isElectron = Boolean(window.electronAPI?.isElectron)

  // 绝大多数请求本地配置已经可用。先探测可避免每次创作都走一次云端同步，
  // 也避免同步命中新版本时重启本地服务、打断当前请求。
  try {
    const current = await queryDhVideoV2PlanScriptReady()
    if (current.ready) return current
    if (!isElectron) {
      throw new Error(
        "未配置分镜大模型 API Key。桌面安装包请先登录并等待云端配置同步；开发机请配置 NEWAPI_KEY 或 DEEPSEEK_API_KEY。",
      )
    }
  } catch (e) {
    if (!isElectron) throw e
  }

  if (isElectron && window.electronAPI?.syncConfig) {
    onStatus?.("正在同步云端配置…")
    try {
      await window.electronAPI.syncConfig()
    } catch {
      // sync 失败仍继续探测（可能已有缓存 Key）
    }
  }

  const deadline = Date.now() + PLAN_READY_POLL_MS
  for (;;) {
    try {
      const ready = await queryDhVideoV2PlanScriptReady()
      if (ready.ready) return ready
      if (!isElectron || Date.now() >= deadline) {
        throw new Error(
          "未配置分镜大模型 API Key。桌面安装包请先登录并等待云端配置同步；开发机请配置 NEWAPI_KEY 或 DEEPSEEK_API_KEY。",
        )
      }
      onStatus?.("等待分镜大模型配置就绪…")
      await new Promise((r) => setTimeout(r, PLAN_READY_INTERVAL_MS))
    } catch (e) {
      if (e instanceof Error && /未配置分镜大模型/.test(e.message)) throw e
      if (!isElectron || Date.now() >= deadline) throw e
      onStatus?.("本地服务重启中，请稍候…")
      await new Promise((r) => setTimeout(r, PLAN_READY_INTERVAL_MS))
    }
  }
}

/** 从上游原始响应提取 task_id */
export function extractDhVideoV2TaskId(data: Record<string, unknown>): string {
  const candidates = [
    data.task_id,
    data.id,
    (data.data as Record<string, unknown> | undefined)?.task_id,
    (data.data as Record<string, unknown> | undefined)?.id,
  ]
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim()
  }
  return ""
}

/** 从上游原始响应提取视频 URL */
export function extractDhVideoV2VideoUrl(data: Record<string, unknown>): string {
  const dataObj = data.data as Record<string, unknown> | undefined
  const candidates = [
    data.stable_video_url,
    data.video_url,
    data.result_url,
    data.url,
    dataObj?.video_url,
    dataObj?.result_url,
    dataObj?.url,
    Array.isArray(data.results) ? (data.results[0] as Record<string, unknown>)?.url : undefined,
    Array.isArray(data.data) ? (data.data[0] as Record<string, unknown>)?.url : undefined,
  ]
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim()
  }
  return ""
}

export async function submitDhVideoV2(
  payload: DhVideoV2SubmitPayload,
): Promise<DhVideoV2SubmitResponse> {
  const r = await dhV2Fetch("/api/dh-video-v2/submit", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  })
  const data = (await r.json().catch(() => ({}))) as DhVideoV2SubmitResponse &
    Record<string, unknown> & { detail?: unknown; error?: { message?: string } }
  if (!r.ok) {
    throwDhV2ApiError(r.status, data)
  }
  const taskId = data.task_id || extractDhVideoV2TaskId(data)
  if (!taskId) {
    throw new Error("提交成功但未返回 task_id")
  }
  return { ...data, task_id: taskId }
}

export async function queryDhVideoV2Status(
  taskId: string,
  options?: { timeoutMs?: number },
): Promise<DhVideoV2Status> {
  const r = await dhV2Fetch(
    `/api/dh-video-v2/status?taskId=${encodeURIComponent(taskId)}`,
    undefined,
    options?.timeoutMs ?? STATUS_POLL_TIMEOUT_MS,
  )
  const data = (await r.json().catch(() => ({}))) as DhVideoV2Status &
    Record<string, unknown> & { detail?: unknown; error?: { message?: string } }
  if (!r.ok) {
    throwDhV2ApiError(r.status, data)
  }
  const videoUrl = data.video_url || extractDhVideoV2VideoUrl(data)
  return {
    task_id: data.task_id || extractDhVideoV2TaskId(data) || taskId,
    status: String(data.status ?? "unknown"),
    progress: typeof data.progress === "number" ? data.progress : undefined,
    stage_label: data.stage_label,
    video_url: videoUrl || undefined,
    result_url: typeof data.result_url === "string" ? data.result_url : videoUrl || undefined,
    poll_url: typeof data.poll_url === "string" ? data.poll_url : undefined,
    error: data.error,
    provider: data.provider,
    model: typeof data.model === "string" ? data.model : undefined,
    segment_count: typeof data.segment_count === "number" ? data.segment_count : undefined,
    segments_completed:
      typeof data.segments_completed === "number" ? data.segments_completed : undefined,
    segments: Array.isArray(data.segments)
      ? (data.segments as DhVideoV2Status["segments"])
      : undefined,
  }
}

export async function retryDhVideoV2Segment(
  taskId: string,
  segmentIndex: number,
): Promise<{ ok: boolean; task_id: string; segment_index: number }> {
  const r = await dhV2Fetch("/api/dh-video-v2/retry-segment", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ taskId, segmentIndex }),
  })
  const data = (await r.json().catch(() => ({}))) as {
    ok?: boolean
    task_id?: string
    segment_index?: number
    detail?: unknown
  }
  if (!r.ok) {
    throwDhV2ApiError(r.status, data)
  }
  return {
    ok: Boolean(data.ok),
    task_id: data.task_id || taskId,
    segment_index: typeof data.segment_index === "number" ? data.segment_index : segmentIndex,
  }
}

export async function requestDhVideoV2ScriptPlan(
  body: DhV2PlanScriptRequest,
  options?: { signal?: AbortSignal },
): Promise<{ plan: DhV2ScriptPlan }> {
  const r = await dhV2Fetch("/api/dh-video-v2/plan-script", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
    signal: options?.signal,
  })
  const data = (await r.json().catch(() => ({}))) as { plan?: DhV2ScriptPlan; detail?: unknown }
  if (!r.ok) {
    throwDhV2ApiError(r.status, data)
  }
  if (!data.plan?.segments?.length) {
    throw new Error("AI 未返回有效分镜脚本")
  }
  return { plan: data.plan }
}

export async function requestDhVideoV2AutoPrompt(
  body: { script: string; duration: number; image_count: number; mode?: string; visual_style?: string; has_audio_ref?: boolean },
): Promise<{ prompt: string }> {
  const r = await dhV2Fetch("/api/dh-video-v2/auto-prompt", {
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  })
  const data = (await r.json().catch(() => ({}))) as { prompt?: string; detail?: unknown }
  if (!r.ok) {
    throwDhV2ApiError(r.status, data)
  }
  if (!data.prompt?.trim()) {
    throw new Error("AI 未返回有效提示词")
  }
  return { prompt: data.prompt.trim() }
}

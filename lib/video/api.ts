/**
 * 视频模块 API 客户端
 *
 * 集中管理对 FastAPI / Next API Route 的视频相关请求。
 * 所有实际 API 调用均通过此模块发起，便于后续替换 Mock 为真实服务。
 */
import type {
  VideoGenerateRequest,
  VideoGenerateResponse,
  VideoStatusResponse,
  VideoEditRequest,
  VideoEditResponse,
  VoiceCloneRequest,
  VoiceCloneResponse,
  ImageToVideoRequest,
  ImageToVideoResponse,
  MashupVideoRequest,
  MashupVideoResponse,
} from "./types"
import { getFastapiBase } from "@/lib/fastapi-base"

// ── 文案提取 API 类型 ──────────────────────────────────────────

export type ExtractCopyRequest = { url: string; platform?: string }
export type ExtractCopyResponse = { task_id: string; status: string }
export type ExtractCopyStatusResponse = {
  task_id: string
  status: string       // "queued" | "downloading" | "transcribing" | "completed" | "failed"
  step: string         // 中文步骤描述
  progress: number     // 0-100
  text?: string
  title?: string
  duration?: number
  source?: string      // "subtitles" | "asr"
  error?: string
}

/**
 * 提交视频生成任务 → FastAPI POST /api/video/generate
 */
export async function submitVideoGeneration(
  req: VideoGenerateRequest,
): Promise<VideoGenerateResponse> {
  const base = getFastapiBase()
  const res = await fetch(`${base}/api/video/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "提交任务失败")
  }
  return data as VideoGenerateResponse
}

/**
 * 查询视频任务状态 → FastAPI GET /api/video/status?taskId=xxx
 */
export async function queryVideoStatus(
  taskId: string,
): Promise<VideoStatusResponse> {
  const base = getFastapiBase()
  const res = await fetch(`${base}/api/video/status?taskId=${taskId}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data.detail === "string" ? data.detail : "查询状态失败")
  }
  return (await res.json()) as VideoStatusResponse
}

/**
 * 应用剪辑效果 → Next POST /api/video/edit (Remotion)
 */
export async function applyEdit(
  req: VideoEditRequest,
): Promise<VideoEditResponse> {
  const res = await fetch("/api/video/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "剪辑失败")
  }
  return data as VideoEditResponse
}

/**
 * 音色克隆 → FastAPI POST /api/video/clone-voice
 */
export async function cloneVoice(
  req: VoiceCloneRequest,
): Promise<VoiceCloneResponse> {
  const base = getFastapiBase()
  const res = await fetch(`${base}/api/video/clone-voice`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "音色克隆失败")
  }
  return data as VoiceCloneResponse
}

/**
 * 图文视频创作 → FastAPI POST /api/video/image-to-video
 */
export async function submitImageToVideo(
  req: ImageToVideoRequest,
): Promise<ImageToVideoResponse> {
  const base = getFastapiBase()
  const res = await fetch(`${base}/api/video/image-to-video`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "图文视频创作失败")
  }
  return data as ImageToVideoResponse
}

/**
 * 视频混剪创作 → FastAPI POST /api/video/mashup
 */
export async function submitMashup(
  req: MashupVideoRequest,
): Promise<MashupVideoResponse> {
  const base = getFastapiBase()
  const res = await fetch(`${base}/api/video/mashup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "视频混剪创作失败")
  }
  return data as MashupVideoResponse
}

// ── 文案提取 API ───────────────────────────────────────────────

/**
 * 提交文案提取任务 → FastAPI POST /api/copywriting/extract
 */
export async function startCopyExtraction(
  req: ExtractCopyRequest,
): Promise<ExtractCopyResponse> {
  const base = getFastapiBase()
  const res = await fetch(`${base}/api/copywriting/extract`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "提交提取任务失败")
  }
  return data as ExtractCopyResponse
}

/**
 * 查询文案提取任务状态 → FastAPI GET /api/copywriting/extract/status
 */
export async function queryExtractStatus(
  taskId: string,
): Promise<ExtractCopyStatusResponse> {
  const base = getFastapiBase()
  const res = await fetch(`${base}/api/copywriting/extract/status?task_id=${encodeURIComponent(taskId)}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data.detail === "string" ? data.detail : "查询提取状态失败")
  }
  return (await res.json()) as ExtractCopyStatusResponse
}

// ── 自动字幕生成 API ────────────────────────────────────────────

export type AutoSubtitleRequest = {
  source: "local" | "url"
  video_path?: string
  video_url?: string
  subtitle_format?: "ass" | "srt"
  merge_gap_ms?: number
}

export type AutoSubtitleResponse = {
  task_id: string
  status: string          // "queued" | "processing" | "completed" | "failed"
  subtitle_path?: string  // 生成的字幕文件路径
  subtitle_text?: string  // 字幕纯文本（供预览）
  sentence_count?: number
  error?: string
}

/**
 * 提交自动字幕生成任务 → FastAPI POST /api/video/auto-subtitle
 */
export async function startAutoSubtitle(
  req: AutoSubtitleRequest,
): Promise<AutoSubtitleResponse> {
  const base = getFastapiBase()
  const res = await fetch(`${base}/api/video/auto-subtitle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(typeof data.detail === "string" ? data.detail : "提交字幕生成失败")
  }
  return data as AutoSubtitleResponse
}

/**
 * 查询自动字幕任务状态 → FastAPI GET /api/video/auto-subtitle/status
 */
export async function queryAutoSubtitleStatus(
  taskId: string,
): Promise<AutoSubtitleResponse> {
  const base = getFastapiBase()
  const res = await fetch(`${base}/api/video/auto-subtitle/status?task_id=${encodeURIComponent(taskId)}`)
  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(typeof data.detail === "string" ? data.detail : "查询字幕状态失败")
  }
  return (await res.json()) as AutoSubtitleResponse
}

/**
 * 视频模块 API 客户端 — 浏览器侧统一走同源 Next 代理（转发 session cookie）。
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
  ImageToVideoStatusResponse,
  MashupVideoRequest,
  MashupVideoResponse,
  MashupStatusResponse,
} from "./types"
import { parseApiDetail, parseApiErrorResponse } from "@/lib/api/parse-detail"

const JSON_HEADERS = { "Content-Type": "application/json" }
const FETCH_INIT: RequestInit = { credentials: "include" }

async function readError(res: Response, fallback: string): Promise<never> {
  const data = (await res.json().catch(() => ({}))) as { detail?: unknown }
  throw new Error(parseApiErrorResponse(res.status, data, fallback))
}

export type ExtractCopyRequest = { url: string; platform?: string }
export type ExtractCopyResponse = { task_id: string; status: string }
export type ExtractCopyStatusResponse = {
  task_id: string
  status: string
  step: string
  progress: number
  text?: string
  title?: string
  duration?: number
  source?: string
  error?: string
}

export async function submitVideoGeneration(
  req: VideoGenerateRequest,
): Promise<VideoGenerateResponse> {
  const res = await fetch("/api/video/generate", {
    ...FETCH_INIT,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(req),
  })
  const data = await res.json()
  if (!res.ok) await readError(res, "提交任务失败")
  return data as VideoGenerateResponse
}

export async function queryVideoStatus(taskId: string): Promise<VideoStatusResponse> {
  const res = await fetch(
    `/api/video/status?taskId=${encodeURIComponent(taskId)}`,
    FETCH_INIT,
  )
  if (!res.ok) await readError(res, "查询状态失败")
  return (await res.json()) as VideoStatusResponse
}

export async function cancelVideoTask(taskId: string): Promise<void> {
  const res = await fetch("/api/video/cancel", {
    ...FETCH_INIT,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ task_id: taskId }),
  })
  if (!res.ok) await readError(res, "取消任务失败")
}

/** Remotion 预设剪辑 */
export async function applyEdit(req: VideoEditRequest): Promise<VideoEditResponse> {
  const res = await fetch("/api/video/remotion-edit", {
    ...FETCH_INIT,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(req),
  })
  const data = await res.json()
  if (!res.ok) await readError(res, "剪辑失败")
  return data as VideoEditResponse
}

export async function cloneVoice(req: VoiceCloneRequest): Promise<VoiceCloneResponse> {
  const res = await fetch("/api/video/clone-voice", {
    ...FETCH_INIT,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(req),
  })
  const data = await res.json()
  if (!res.ok) await readError(res, "音色克隆失败")
  return data as VoiceCloneResponse
}

export async function submitImageToVideo(
  req: ImageToVideoRequest,
): Promise<ImageToVideoResponse> {
  const res = await fetch("/api/video/image-to-video", {
    ...FETCH_INIT,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(req),
  })
  const data = await res.json()
  if (!res.ok) await readError(res, "图文视频创作失败")
  return data as ImageToVideoResponse
}

export async function queryImageToVideoStatus(
  taskId: string,
): Promise<ImageToVideoStatusResponse> {
  const res = await fetch(
    `/api/video/image-to-video/status?taskId=${encodeURIComponent(taskId)}`,
    FETCH_INIT,
  )
  if (!res.ok) await readError(res, "查询图文视频状态失败")
  return (await res.json()) as ImageToVideoStatusResponse
}

export async function cancelImageToVideo(taskId: string): Promise<void> {
  const res = await fetch("/api/video/image-to-video/cancel", {
    ...FETCH_INIT,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ task_id: taskId }),
  })
  if (!res.ok) await readError(res, "取消图文视频任务失败")
}

export async function submitMashup(req: MashupVideoRequest): Promise<MashupVideoResponse> {
  const res = await fetch("/api/video/mashup", {
    ...FETCH_INIT,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(req),
  })
  const data = await res.json()
  if (!res.ok) await readError(res, "视频混剪创作失败")
  return data as MashupVideoResponse
}

export async function queryMashupStatus(taskId: string): Promise<MashupStatusResponse> {
  const res = await fetch(
    `/api/video/mashup/status?taskId=${encodeURIComponent(taskId)}`,
    FETCH_INIT,
  )
  if (!res.ok) await readError(res, "查询混剪状态失败")
  return (await res.json()) as MashupStatusResponse
}

export async function cancelMashup(taskId: string): Promise<void> {
  const res = await fetch("/api/video/mashup/cancel", {
    ...FETCH_INIT,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify({ task_id: taskId }),
  })
  if (!res.ok) await readError(res, "取消混剪任务失败")
}

export async function startCopyExtraction(
  req: ExtractCopyRequest,
): Promise<ExtractCopyResponse> {
  const res = await fetch("/api/copywriting/extract", {
    ...FETCH_INIT,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(req),
  })
  if (!res.ok) await readError(res, "提交提取任务失败")
  return (await res.json()) as ExtractCopyResponse
}

export async function queryExtractStatus(
  taskId: string,
): Promise<ExtractCopyStatusResponse> {
  const res = await fetch(
    `/api/copywriting/extract/status?task_id=${encodeURIComponent(taskId)}`,
    FETCH_INIT,
  )
  if (!res.ok) await readError(res, "查询提取状态失败")
  return (await res.json()) as ExtractCopyStatusResponse
}

export type AutoSubtitleRequest = {
  source: "local" | "url"
  video_path?: string
  video_url?: string
  subtitle_format?: "ass" | "srt"
  merge_gap_ms?: number
  /** 用户原文案；有则后端走 ASR 校对对齐 */
  script?: string
}

export type AutoSubtitleResponse = {
  task_id: string
  status: string
  subtitle_path?: string
  subtitle_text?: string
  sentence_count?: number
  error?: string
}

export async function startAutoSubtitle(
  req: AutoSubtitleRequest,
): Promise<AutoSubtitleResponse> {
  const res = await fetch("/api/video/auto-subtitle", {
    ...FETCH_INIT,
    method: "POST",
    headers: JSON_HEADERS,
    body: JSON.stringify(req),
  })
  const data = await res.json()
  if (!res.ok) await readError(res, "提交字幕生成失败")
  return data as AutoSubtitleResponse
}

export async function queryAutoSubtitleStatus(
  taskId: string,
): Promise<AutoSubtitleResponse> {
  const res = await fetch(
    `/api/video/auto-subtitle/status?task_id=${encodeURIComponent(taskId)}`,
    FETCH_INIT,
  )
  if (!res.ok) await readError(res, "查询字幕状态失败")
  return (await res.json()) as AutoSubtitleResponse
}

export { parseApiDetail, parseApiErrorResponse }

/**
 * 视频模块共享类型定义
 *
 * 本文件集中管理视频创作+视频混剪模块的所有 TypeScript 类型，
 * 其他模块（文案创作、热点等）如需引用视频类型应从此处导入。
 */

import type { VideoPromptMode } from "./video-prompt-presets"

/* ================================================================== */
/*  视频创作（VideoCreationWorkflow）                                     */
/* ================================================================== */

export type StepId = 1 | 2 | 3 | 4

export type StepStatus = "pending" | "active" | "loading" | "done" | "error"

export type UploadedImage = {
  file: File
  previewUrl: string
  base64: string
}

export type UploadedAudio = {
  file: File
  name: string
  duration: string
  base64: string
}

export type EditingPreset = {
  id: string
  name: string
  icon: React.ComponentType<{ className?: string }>
  description: string
}

export type VideoGender = "male" | "female"

/* ================================================================== */
/*  视频剪接（BatchEdit / 批量混剪）                                      */
/* ================================================================== */

export type ClipItem = {
  id: string
  name: string
  previewUrl: string
  file: File
}

/* ================================================================== */
/*  创作历史记录（VideoHistory）                                          */
/* ================================================================== */

export type HistoryVideoSource = "digital-human" | "image-video" | "mashup"

export type HistoryRecord = {
  id: string
  createdAt: number
  script: string
  videoUrl: string
  coverUrl: string
  /** 本地持久化缩略图（JPEG data URL，约 5–15KB），coverUrl 为空时用于卡片展示 */
  coverThumbnail?: string
  /** 仅数字人口播必填 */
  gender?: VideoGender
  /** 创作来源，用于标签展示；旧记录无此字段时 UI 默认当作 digital-human */
  source?: HistoryVideoSource
  status: "success" | "failed"
  errorMessage?: string
}

export const HISTORY_STORAGE_KEY = "video-history"
export const HISTORY_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

/* ================================================================== */
/*  一键分发共享视频（ShareDistribute + VideoHistory）                     */
/* ================================================================== */

export type ShareVideo = {
  id: string
  title: string
  url: string
  thumbnail?: string
  duration?: string
  source: "manual" | "video-creation" | "batch-edit"
  createdAt: number
}

export const SHARE_VIDEOS_KEY = "share-videos"

/* ================================================================== */
/*  API 请求 / 响应体                                                    */
/* ================================================================== */

export type VideoGenerateRequest = {
  image_base64: string
  audio_base64: string
  script: string
  gender: VideoGender
  video_prompt?: string
  video_prompt_mode?: VideoPromptMode
  resolution?: string
  bg_color?: string
}

export type VideoGenerateResponse = {
  task_id?: string
  taskId?: string
  status: string
  estimatedMinutes?: number
  message?: string
}

export type VideoStatusResponse = {
  task_id?: string
  taskId?: string
  status: string
  progress?: number
  video_url?: string
  videoUrl?: string
  cover_url?: string
  coverUrl?: string
  audio_url?: string
  error?: string
  detail?: string
  estimated_minutes?: number
}

export type VideoEditRequest = {
  videoUrl: string
  preset: string
  subtitleText?: string
  bgMusicUrl?: string
  brollUrls?: string[]
}

export type VideoEditResponse = {
  editedVideoUrl?: string
  status: string
  detail?: string
}

export type VoiceCloneRequest = {
  audio_base64: string
  script: string
}

export type VoiceCloneResponse = {
  audio_url?: string
  task_id?: string
  message?: string
}

/* ================================================================== */
/*  图文视频（ImageToVideo）                                              */
/* ================================================================== */

export type ImageToVideoRequest = {
  images_base64: string[]
  audio_base64: string
  script: string
  bgm_volume?: number
}

export type ImageToVideoResponse = {
  task_id: string
  status: string
  video_url?: string
  audio_url?: string
  error?: string
}

export type ClipTaskStatusResponse = {
  task_id: string
  status: string
  progress?: number
  video_url?: string
  audio_url?: string
  error?: string
  stage?: string
  stage_label?: string
  stage_history?: string[]
  stage_updated_at?: number
}

export type ImageToVideoStatusResponse = ClipTaskStatusResponse

/* ================================================================== */
/*  视频混剪（MashupVideo）                                              */
/* ================================================================== */

export type MashupVideoRequest = {
  videos_base64: string[]
  audio_base64: string
  script: string
  bgm_volume?: number
}

export type MashupVideoResponse = {
  task_id: string
  status: string
  video_url?: string
  audio_url?: string
  error?: string
}

export type MashupStatusResponse = ClipTaskStatusResponse

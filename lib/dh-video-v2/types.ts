/** 数字人视频创作（新）— 类型契约 */

export type DhVideoV2Provider = "seedance" | "xinghe"
export type DhVideoV2Mode = "multimodal" | "first_frame" | "text"
export type DhVideoV2Resolution = "720p" | "1080p"
export type DhVideoV2Ratio = "auto" | "16:9" | "9:16" | "1:1"
export type DhVideoV2SeedanceModel = "seedance2.0-fast"
export type DhVideoV2XingheModel = "xinghe-mini" | "xinghe-fast" | "xinghe-2.0"
export type DhVideoV2Model = DhVideoV2SeedanceModel | DhVideoV2XingheModel

export type DhV2SegmentSubmit = {
  index: number
  time_range: string
  dialogue: string
  shot_details: string
  video_prompt: string
  dialogue_warning?: "ok" | "too_short" | "too_long" | "empty"
}

export type DhVideoV2SubmitPayload = {
  provider: DhVideoV2Provider
  mode: DhVideoV2Mode
  model: DhVideoV2Model
  segments: DhV2SegmentSubmit[]
  images_base64?: string[]
  audios_base64?: string[]
  audio_urls?: string[]
  aspect_ratio?: DhVideoV2Ratio
  ratio?: "16:9" | "9:16"
  resolution: DhVideoV2Resolution
  duration: number | "auto"
  seconds?: number
  client_task_id?: string
}

export type DhVideoV2SubmitResponse = {
  task_id: string
  id?: string
  status?: string
  poll_url?: string
  provider?: DhVideoV2Provider
}

export type DhV2SegmentRuntimeStatus = {
  index: number
  status: "pending" | "submitting" | "processing" | "completed" | "failed" | "timeout"
  video_url?: string
  error?: string
  time_range?: string
  dialogue?: string
}

export type DhVideoV2Status = {
  task_id: string
  status: string
  progress?: number
  stage_label?: string
  video_url?: string
  result_url?: string
  poll_url?: string
  error?: string
  detail?: string
  provider?: DhVideoV2Provider
  model?: string
  segment_count?: number
  segments_completed?: number
  segments?: DhV2SegmentRuntimeStatus[]
}

export type DhV2PlanScriptRequest = {
  script: string
  creative_idea: string
  business_task_id: string
  image_count?: number
  images_base64?: string[]
  has_audio_ref: boolean
  /** @deprecated AI 自行语义拆段 */
  dialogue_slices?: string[]
  plan_duration?: number
  segment_count?: number
}

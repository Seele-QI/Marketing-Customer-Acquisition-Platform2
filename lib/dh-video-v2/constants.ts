/** 数字人视频创作（新）— 常量（对齐 aicost.xyz Seedance / Xinghe 文档） */

import type {
  DhVideoV2Mode,
  DhVideoV2Provider,
  DhVideoV2Ratio,
  DhVideoV2Resolution,
  DhVideoV2SubmitPayload,
  DhVideoV2XingheModel,
  DhV2SegmentSubmit,
} from "./types"

export const DH_V2_UPSTREAM_BASE_URL = "https://www.aicost.xyz"

export const DH_V2_STEP_LABELS = [
  { id: 1 as const, label: "填写素材" },
  { id: 2 as const, label: "生成中" },
  { id: 3 as const, label: "成片预览" },
]

export const DH_V2_SEGMENT_SEC = 15 as const

export function dataUrlToRawBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(",")
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl
}

export const DH_V2_MAX_IMAGES = 9
export const DH_V2_MAX_AUDIOS = 3

export const DH_V2_MAX_ASSET_BYTES = 50 * 1024 * 1024

export const DH_V2_ACCEPTED_IMAGES = "image/jpeg,image/png,image/webp,image/gif,image/bmp"
export const DH_V2_ACCEPTED_AUDIOS = "audio/mpeg,audio/wav,audio/mp3,.mp3,.wav"

/** Xinghe 支持 4-15 秒；Seedance 文档固定 15 秒 */
export const DH_V2_XINGHE_DURATIONS = [4, 5, 6, 8, 10, 12, 15] as const
export const DH_V2_SEEDANCE_DURATION = 15 as const

export const DH_V2_SEEDANCE_RESOLUTIONS: DhVideoV2Resolution[] = ["720p"]

export const DH_V2_XINGHE_RESOLUTIONS: { value: DhVideoV2Resolution; label: string; models: DhVideoV2XingheModel[] }[] = [
  { value: "720p", label: "720p", models: ["xinghe-mini", "xinghe-fast", "xinghe-2.0"] },
  { value: "1080p", label: "1080p（仅 xinghe-2.0）", models: ["xinghe-2.0"] },
]

export const DH_V2_SEEDANCE_RATIOS: { value: DhVideoV2Ratio; label: string }[] = [
  { value: "auto", label: "自适应" },
  { value: "16:9", label: "16:9 横屏" },
  { value: "9:16", label: "9:16 竖屏" },
  { value: "1:1", label: "1:1 方形" },
]

export const DH_V2_XINGHE_RATIOS = [
  { value: "16:9" as const, label: "16:9 横屏" },
  { value: "9:16" as const, label: "9:16 竖屏" },
]

export const DH_V2_MODES: { value: DhVideoV2Mode; label: string; hint: string }[] = [
  {
    value: "multimodal",
    label: "参考图生视频",
    hint: "上传参考图（最多 9 张），可搭配音频参考",
  },
  {
    value: "first_frame",
    label: "首帧图生",
    hint: "首图固定为视频开头，提示词追加 @图1 首帧语义",
  },
  {
    value: "text",
    label: "文生视频",
    hint: "仅提示词，不传图片与音频",
  },
]

export const DH_V2_PROVIDERS: { value: DhVideoV2Provider; label: string; desc: string }[] = [
  { value: "seedance", label: "Seedance 2.0 Fast", desc: "POST /v1/videos · 固定 720p · 15s" },
  { value: "xinghe", label: "星河 2.0", desc: "POST /v1/video/create · 4-15s" },
]

export const DH_V2_XINGHE_MODELS: { value: DhVideoV2XingheModel; label: string }[] = [
  { value: "xinghe-mini", label: "Xinghe Mini" },
  { value: "xinghe-fast", label: "Xinghe Fast" },
  { value: "xinghe-2.0", label: "Xinghe 2.0" },
]

export const DH_V2_PROMPT_TAG_TEMPLATES = [
  "@图1",
  "@图2",
  "@图3",
  "[图1]",
  "[音频1]",
] as const

export const DH_V2_FIRST_FRAME_SUFFIX =
  "\n\n@图1 当前图片为视频固定首帧"

export const DH_V2_MOCK_ENABLED =
  typeof process !== "undefined" &&
  process.env.NEXT_PUBLIC_DH_VIDEO_V2_MOCK === "1"

export function estimateDhVideoV2Cost(
  _provider: DhVideoV2Provider,
  planDuration: number,
  resolution: DhVideoV2Resolution,
): number {
  const sec = Math.max(DH_V2_SEGMENT_SEC, planDuration)
  const perSecond = resolution === "1080p" ? 18 : 12
  return perSecond * sec
}

export function validateDhVideoV2Compose(input: {
  imageCount: number
  script: string
}): string | null {
  if (input.imageCount < 1) return "请上传至少 1 张参考图"
  if (!input.script.trim()) return "请填写口播文案"
  return null
}

export function validateDhVideoV2ScriptPlan(plan: {
  segments: Array<{ video_prompt?: string }>
}): string | null {
  if (!plan.segments.length) return "分镜脚本为空"
  for (let i = 0; i < plan.segments.length; i++) {
    if (!plan.segments[i].video_prompt?.trim()) {
      return `段 ${i + 1} 缺少视频提示词`
    }
  }
  return null
}

export function validateDhVideoV2Materials(input: {
  mode: DhVideoV2Mode
  prompt: string
  imageCount: number
  audioCount: number
}): string | null {
  const { mode, prompt, imageCount, audioCount } = input

  if (mode === "text") {
    if (!prompt.trim()) return "文生视频模式需填写提示词"
    return null
  }

  if (mode === "first_frame") {
    if (imageCount < 1) return "首帧图生模式需上传至少 1 张参考图"
    if (!prompt.trim()) return "请填写运动与镜头描述提示词"
    return null
  }

  if (imageCount < 1) {
    return "参考图生视频模式需上传至少 1 张参考图"
  }
  if (audioCount > 0 && imageCount < 1) {
    return "音频参考需搭配至少 1 张参考图"
  }
  return null
}

export function buildSubmitPayload(input: {
  provider: DhVideoV2Provider
  mode: DhVideoV2Mode
  imagesDataUrl: string[]
  audiosDataUrl: string[]
  aspectRatio: DhVideoV2Ratio
  xingheRatio: "16:9" | "9:16"
  resolution: DhVideoV2Resolution
  xingheModel: DhVideoV2XingheModel
  segments: DhV2SegmentSubmit[]
  clientTaskId?: string
}): DhVideoV2SubmitPayload {
  const {
    provider,
    mode,
    imagesDataUrl,
    audiosDataUrl,
    aspectRatio,
    xingheRatio,
    resolution,
    xingheModel,
    segments,
    clientTaskId,
  } = input

  if (provider === "seedance") {
    return {
      provider,
      mode,
      model: "seedance2.0-fast",
      segments,
      images_base64: imagesDataUrl.length ? imagesDataUrl : undefined,
      audios_base64: audiosDataUrl.length ? audiosDataUrl : undefined,
      aspect_ratio: aspectRatio,
      resolution: "720p",
      duration: "auto",
      seconds: DH_V2_SEGMENT_SEC,
      client_task_id: clientTaskId,
    }
  }

  return {
    provider,
    mode,
    model: xingheModel,
    segments,
    images_base64: imagesDataUrl.length ? imagesDataUrl : undefined,
    audio_urls: audiosDataUrl.length ? audiosDataUrl : undefined,
    ratio: xingheRatio,
    resolution,
    duration: DH_V2_SEGMENT_SEC,
    client_task_id: clientTaskId,
  }
}

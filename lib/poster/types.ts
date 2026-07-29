export const POSTER_RATIO_FAMILIES = ["1:1", "3:4", "9:16", "9:25"] as const

export type PosterRatioFamily = (typeof POSTER_RATIO_FAMILIES)[number]
export type PosterOrientation = "portrait" | "landscape"
export type PosterAspectRatio =
  | "1:1"
  | "3:4"
  | "4:3"
  | "9:16"
  | "16:9"
  | "9:25"
  | "25:9"
export type PosterResolution = "1k" | "2k"
export type PosterTaskStatus = "queued" | "running" | "success" | "failed"

export const POSTER_ASPECT_RATIOS: readonly PosterAspectRatio[] = [
  "1:1",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
  "9:25",
  "25:9",
]

const LANDSCAPE_RATIOS: Record<PosterRatioFamily, PosterAspectRatio> = {
  "1:1": "1:1",
  "3:4": "4:3",
  "9:16": "16:9",
  "9:25": "25:9",
}

export function resolvePosterAspectRatio(
  family: PosterRatioFamily,
  orientation: PosterOrientation,
): PosterAspectRatio {
  return orientation === "landscape" ? LANDSCAPE_RATIOS[family] : family
}

export function parsePosterGenerationRequest(value: unknown): {
  prompt: string
  aspect_ratio: PosterAspectRatio
  resolution: PosterResolution
  count: 2
} {
  const input =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : ""
  if (!prompt) throw new Error("缺少提示词 prompt")

  const aspectRatio =
    typeof input.aspect_ratio === "string" ? input.aspect_ratio.trim() : ""
  if (!POSTER_ASPECT_RATIOS.includes(aspectRatio as PosterAspectRatio)) {
    throw new Error("不支持的海报比例")
  }

  const resolution =
    typeof input.resolution === "string" ? input.resolution.trim().toLowerCase() : ""
  if (resolution !== "1k" && resolution !== "2k") {
    throw new Error("不支持的分辨率")
  }
  if (input.count !== 2) throw new Error("海报固定生成 2 张")

  return {
    prompt,
    aspect_ratio: aspectRatio as PosterAspectRatio,
    resolution,
    count: 2,
  }
}

export type PosterStatusResponse = {
  poster_task_id: string
  status: PosterTaskStatus | string
  image_urls: string[]
  warning?: string
  error?: string
  stage_label?: string
  aspect_ratio?: PosterAspectRatio
}

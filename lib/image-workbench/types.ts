export const IMAGE_RATIO_FAMILIES = ["1:1", "3:4", "9:16", "9:25"] as const
export const IMAGE_ASPECT_RATIOS = [
  "1:1",
  "3:4",
  "4:3",
  "9:16",
  "16:9",
  "9:25",
  "25:9",
] as const
export const IMAGE_RESOLUTIONS = ["1k", "2k"] as const
export const REFERENCE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const
export const REFERENCE_MODES = [
  "preserve_subject",
  "style_only",
  "remix",
] as const

export type ImageWorkbenchMode = "poster" | "image"
export type ImageOrientation = "portrait" | "landscape"
export type ImageRatioFamily = (typeof IMAGE_RATIO_FAMILIES)[number]
export type ImageAspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number]
export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number]
export type ReferenceRole = "subject" | "style" | "general"
export type ReferenceMode = (typeof REFERENCE_MODES)[number]
export type ImageTaskStatus = "queued" | "running" | "success" | "failed"

export type WorkbenchReferencePayload = {
  role: ReferenceRole
  mime_type: (typeof REFERENCE_MIME_TYPES)[number]
  data_base64: string
}

export type WorkbenchReferenceImage = {
  id: string
  name: string
  role: ReferenceRole
  mimeType: (typeof REFERENCE_MIME_TYPES)[number]
  dataBase64: string
  previewUrl: string
}

export type ImageWorkbenchGenerateRequest = {
  mode: ImageWorkbenchMode
  prompt: string
  aspect_ratio: ImageAspectRatio
  resolution: ImageResolution
  count: 2
  reference_images: WorkbenchReferencePayload[]
  reference_mode?: ReferenceMode
}

export type ImageWorkbenchStatusResponse = {
  task_id: string
  mode: ImageWorkbenchMode
  status: ImageTaskStatus | string
  image_urls: string[]
  warning?: string
  error?: string
  stage_label?: string
  aspect_ratio?: ImageAspectRatio
}

const LANDSCAPE_RATIOS: Record<ImageRatioFamily, ImageAspectRatio> = {
  "1:1": "1:1",
  "3:4": "4:3",
  "9:16": "16:9",
  "9:25": "25:9",
}

export function resolveImageAspectRatio(
  family: ImageRatioFamily,
  orientation: ImageOrientation,
): ImageAspectRatio {
  return orientation === "landscape" ? LANDSCAPE_RATIOS[family] : family
}

function parseMode(value: unknown): ImageWorkbenchMode {
  if (value === "poster" || value === "image") return value
  throw new Error("不支持的图片创作模式")
}

function stripDataUrlPrefix(value: string): string {
  const match = /^data:image\/[^;]+;base64,([\s\S]+)$/i.exec(value.trim())
  return (match?.[1] ?? value).replace(/\s/g, "")
}

export function parseImageWorkbenchRequest(
  value: unknown,
): ImageWorkbenchGenerateRequest {
  const input =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const mode = parseMode(input.mode)
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : ""
  if (!prompt) throw new Error("缺少提示词 prompt")

  const aspectRatio =
    typeof input.aspect_ratio === "string" ? input.aspect_ratio.trim() : ""
  if (!IMAGE_ASPECT_RATIOS.includes(aspectRatio as ImageAspectRatio)) {
    throw new Error("不支持的图片比例")
  }

  const resolution =
    typeof input.resolution === "string"
      ? input.resolution.trim().toLowerCase()
      : ""
  if (!IMAGE_RESOLUTIONS.includes(resolution as ImageResolution)) {
    throw new Error("不支持的分辨率")
  }
  if (input.count !== 2) throw new Error("图片工作台固定生成 2 张候选图")

  const rawReferences = Array.isArray(input.reference_images)
    ? input.reference_images
    : []
  const maxReferences = mode === "poster" ? 2 : 4
  if (rawReferences.length > maxReferences) {
    throw new Error(
      mode === "poster" ? "海报最多添加 2 张参考图" : "图片创作最多添加 4 张参考图",
    )
  }

  const referenceImages = rawReferences.map((raw, index) => {
    const record =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
    const mimeType =
      typeof record.mime_type === "string" ? record.mime_type.trim() : ""
    if (!REFERENCE_MIME_TYPES.includes(mimeType as WorkbenchReferencePayload["mime_type"])) {
      throw new Error(`第 ${index + 1} 张参考图格式不受支持`)
    }
    const dataBase64 =
      typeof record.data_base64 === "string"
        ? stripDataUrlPrefix(record.data_base64)
        : ""
    if (!dataBase64) throw new Error(`第 ${index + 1} 张参考图内容为空`)

    const rawRole = typeof record.role === "string" ? record.role : ""
    let role: ReferenceRole = "general"
    if (mode === "poster") {
      if (rawRole !== "subject" && rawRole !== "style") {
        throw new Error("海报参考图必须指定商品/主体或风格角色")
      }
      role = rawRole
    }

    return {
      role,
      mime_type: mimeType as WorkbenchReferencePayload["mime_type"],
      data_base64: dataBase64,
    }
  })

  let referenceMode: ReferenceMode | undefined
  if (mode === "image" && referenceImages.length > 0) {
    const rawReferenceMode =
      typeof input.reference_mode === "string" ? input.reference_mode : "remix"
    if (!REFERENCE_MODES.includes(rawReferenceMode as ReferenceMode)) {
      throw new Error("不支持的参考方式")
    }
    referenceMode = rawReferenceMode as ReferenceMode
  }

  return {
    mode,
    prompt,
    aspect_ratio: aspectRatio as ImageAspectRatio,
    resolution: resolution as ImageResolution,
    count: 2,
    reference_images: referenceImages,
    ...(referenceMode ? { reference_mode: referenceMode } : {}),
  }
}

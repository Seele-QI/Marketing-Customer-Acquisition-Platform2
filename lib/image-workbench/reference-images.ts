import { fileToBase64Parts } from "@/lib/image-base64"
import type {
  ImageWorkbenchMode,
  ReferenceRole,
  WorkbenchReferenceImage,
} from "@/lib/image-workbench/types"

const MAX_REFERENCE_BYTES = 10 * 1024 * 1024
const ALLOWED_REFERENCE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])

type ReferenceFileLike = {
  name: string
  type: string
  size: number
}

export function validateReferenceFile(file: ReferenceFileLike): string {
  if (!ALLOWED_REFERENCE_TYPES.has(file.type)) {
    return "仅支持 JPG、PNG、WebP 图片"
  }
  if (file.size > MAX_REFERENCE_BYTES) {
    return "单张参考图不能超过 10MB"
  }
  return ""
}

export function canAddReference(
  mode: ImageWorkbenchMode,
  currentCount: number,
): boolean {
  return currentCount < (mode === "poster" ? 2 : 4)
}

export function sortPosterReferences(
  images: WorkbenchReferenceImage[],
): WorkbenchReferenceImage[] {
  const weight: Record<ReferenceRole, number> = {
    subject: 0,
    style: 1,
    general: 2,
  }
  return [...images].sort((left, right) => weight[left.role] - weight[right.role])
}

export async function fileToWorkbenchReference(
  file: File,
  role: ReferenceRole,
): Promise<WorkbenchReferenceImage> {
  const validationError = validateReferenceFile(file)
  if (validationError) throw new Error(validationError)
  const { mimeType, dataBase64 } = await fileToBase64Parts(file)
  const normalizedMime =
    mimeType === "image/png" || mimeType === "image/webp"
      ? mimeType
      : "image/jpeg"
  return {
    id:
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: file.name,
    role,
    mimeType: normalizedMime,
    dataBase64,
    previewUrl: `data:${normalizedMime};base64,${dataBase64}`,
  }
}

function extensionForMime(mimeType: string): string {
  if (mimeType === "image/png") return "png"
  if (mimeType === "image/webp") return "webp"
  return "jpg"
}

export async function generatedImageUrlToReference(
  url: string,
  role: ReferenceRole,
  fetcher: typeof fetch = fetch,
): Promise<WorkbenchReferenceImage> {
  const response = await fetcher(url)
  if (!response.ok) throw new Error("生成结果读取失败")
  const blob = await response.blob()
  const mimeType =
    blob.type === "image/png" || blob.type === "image/webp"
      ? blob.type
      : "image/jpeg"
  const file = new File(
    [blob],
    `generated-${Date.now()}.${extensionForMime(mimeType)}`,
    { type: mimeType },
  )
  const reference = await fileToWorkbenchReference(file, role)
  return {
    ...reference,
    previewUrl: url,
  }
}

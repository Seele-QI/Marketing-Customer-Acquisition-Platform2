import type { Dispatch, SetStateAction } from "react"

export type PendingImage = {
  id: string
  file: File
  previewUrl: string
}

export const MAX_PENDING_IMAGES = 6
export const MAX_IMAGE_FILE_BYTES = 20 * 1024 * 1024

const COMPRESS_MAX_SIDE = 1280
const COMPRESS_QUALITY = 0.7

/** 将图片通过 Canvas 压缩到合理大小（最大 1280px 边长，JPEG 质量 0.7），避免 base64 过大导致请求失败 */
export function compressImageFile(file: File): Promise<File> {
  return new Promise((resolve) => {
    if (file.size < 200 * 1024) {
      resolve(file)
      return
    }
    const img = new window.Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      let { width, height } = img
      if (width <= COMPRESS_MAX_SIDE && height <= COMPRESS_MAX_SIDE && file.size < 500 * 1024) {
        resolve(file)
        return
      }
      if (width > COMPRESS_MAX_SIDE || height > COMPRESS_MAX_SIDE) {
        const ratio = Math.min(COMPRESS_MAX_SIDE / width, COMPRESS_MAX_SIDE / height)
        width = Math.round(width * ratio)
        height = Math.round(height * ratio)
      }
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")
      if (!ctx) {
        resolve(file)
        return
      }
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file)
            return
          }
          resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }))
        },
        "image/jpeg",
        COMPRESS_QUALITY,
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

export function fileToBase64Data(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result
      if (typeof r !== "string") {
        reject(new Error("读文件失败"))
        return
      }
      const comma = r.indexOf(",")
      resolve(comma >= 0 ? r.slice(comma + 1) : r)
    }
    reader.onerror = () => reject(reader.error ?? new Error("读文件失败"))
    reader.readAsDataURL(file)
  })
}

export type ChatImagePayload = {
  mimeType: string
  dataBase64: string
}

export async function buildChatImagePayload(
  images: PendingImage[],
): Promise<ChatImagePayload[]> {
  return Promise.all(
    images.map(async (p) => {
      const compressed = await compressImageFile(p.file)
      const mimeType = compressed.type || "image/jpeg"
      const dataBase64 = (await fileToBase64Data(compressed)).replace(/\s/g, "")
      return { mimeType, dataBase64 }
    }),
  )
}

export function addImageFilesToPending(
  files: File[],
  setPending: Dispatch<SetStateAction<PendingImage[]>>,
): void {
  for (const file of files) {
    if (!file.type.startsWith("image/")) continue
    if (file.size > MAX_IMAGE_FILE_BYTES) continue
    setPending((prev) => {
      if (prev.length >= MAX_PENDING_IMAGES) return prev
      const id = crypto.randomUUID()
      return [...prev, { id, file, previewUrl: URL.createObjectURL(file) }]
    })
  }
}

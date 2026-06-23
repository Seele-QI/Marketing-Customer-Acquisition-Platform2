/** 浏览器内将 File 转为 API 可用的纯 Base64 + MIME（不含 data URL 前缀） */
export async function fileToBase64Parts(file: File): Promise<{ mimeType: string; dataBase64: string }> {
  const buf = await file.arrayBuffer()
  const bytes = new Uint8Array(buf)
  let binary = ""
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  const mimeType = file.type && file.type.startsWith("image/") ? file.type : "image/jpeg"
  return { mimeType, dataBase64: btoa(binary) }
}

function uint8ToBase64Binary(bytes: Uint8Array): string {
  let binary = ""
  const chunk = 8192
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/**
 * 将参考图压成 JPEG 再 Base64，专供「智能调整」识图接口，避免原图过大导致 JSON/Base64 超限。
 */
export async function fileToVisionAdjustPayload(
  file: File,
  options?: { maxLongEdge?: number; quality?: number },
): Promise<{ mimeType: string; dataBase64: string }> {
  const maxLongEdge = options?.maxLongEdge ?? 2048
  const quality = options?.quality ?? 0.82

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return fileToBase64Parts(file)
  }

  try {
    const w = bitmap.width
    const h = bitmap.height
    const scale = Math.min(1, maxLongEdge / Math.max(w, h, 1))
    const cw = Math.max(1, Math.round(w * scale))
    const ch = Math.max(1, Math.round(h * scale))

    const canvas = document.createElement("canvas")
    canvas.width = cw
    canvas.height = ch
    const ctx = canvas.getContext("2d")
    if (!ctx) return fileToBase64Parts(file)

    ctx.drawImage(bitmap, 0, 0, cw, ch)
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
    })
    if (!blob) return fileToBase64Parts(file)

    const buf = await blob.arrayBuffer()
    const out = { mimeType: "image/jpeg" as const, dataBase64: uint8ToBase64Binary(new Uint8Array(buf)) }

    if (out.dataBase64.length > 5_000_000 && maxLongEdge > 1400) {
      return fileToVisionAdjustPayload(file, { maxLongEdge: 1280, quality: 0.72 })
    }
    if (out.dataBase64.length > 5_000_000 && maxLongEdge > 900) {
      return fileToVisionAdjustPayload(file, { maxLongEdge: 960, quality: 0.65 })
    }
    return out
  } finally {
    bitmap.close()
  }
}

/** 方舟图生图参考图上限约 10MiB；但为了适应 Netlify Serverless 6MB 请求体限制，压至 3.5MiB 以下 */
const ARK_REFERENCE_IMAGE_BYTE_LIMIT = 3.5 * 1024 * 1024

async function loadImageBitmapForEncode(file: File): Promise<ImageBitmap | null> {
  try {
    return await createImageBitmap(file)
  } catch {
    const url = URL.createObjectURL(file)
    try {
      const img = new Image()
      img.decoding = "async"
      const waitLoad = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error("img-decode"))
      })
      img.src = url
      await waitLoad
      try {
        return await createImageBitmap(img)
      } catch {
        return null
      }
    } catch {
      return null
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

async function bitmapToJpegBlob(
  bitmap: ImageBitmap,
  maxLongEdge: number,
  quality: number,
): Promise<Blob | null> {
  const w = bitmap.width
  const h = bitmap.height
  const scale = Math.min(1, maxLongEdge / Math.max(w, h, 1))
  const cw = Math.max(1, Math.round(w * scale))
  const ch = Math.max(1, Math.round(h * scale))
  const canvas = document.createElement("canvas")
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext("2d")
  if (!ctx) return null
  ctx.drawImage(bitmap, 0, 0, cw, ch)
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality)
  })
}

/**
 * 供火山方舟图生图参考图：大图压成 JPEG 并控制体积，避免 InvalidParameter.OversizeImage（如原图 12MiB）。
 * 小文件仍走原样 Base64，以保留 PNG 等格式。
 */
export async function fileToArkReferencePayload(file: File): Promise<{ mimeType: string; dataBase64: string }> {
  /** 小于此值的原文件直接上传，避免无谓重编码（Netlify 限制约 6MB JSON 负载，因此原图体积应控制在 3MB 左右） */
  const RAW_OK_BYTES = 3 * 1024 * 1024
  if (file.size <= RAW_OK_BYTES) {
    return fileToBase64Parts(file)
  }

  const bitmap = await loadImageBitmapForEncode(file)
  if (!bitmap) {
    if (file.size > ARK_REFERENCE_IMAGE_BYTE_LIMIT) {
      throw new Error(
        "无法在浏览器内读取该参考图（可能为不支持的格式）。请将图片转为 JPG/PNG 或缩小到约 10MB 以下后再试。",
      )
    }
    return fileToBase64Parts(file)
  }

  try {
    let maxLongEdge = 2048
    let quality = 0.82
    for (let round = 0; round < 28; round++) {
      const blob = await bitmapToJpegBlob(bitmap, maxLongEdge, quality)
      if (!blob) break
      if (blob.size <= ARK_REFERENCE_IMAGE_BYTE_LIMIT) {
        const buf = await blob.arrayBuffer()
        return { mimeType: "image/jpeg", dataBase64: uint8ToBase64Binary(new Uint8Array(buf)) }
      }
      if (quality > 0.48) {
        quality = Math.max(0.45, quality - 0.06)
      } else if (maxLongEdge > 384) {
        maxLongEdge = Math.max(384, Math.round(maxLongEdge * 0.85))
        quality = 0.78
      } else {
        quality = Math.max(0.28, quality - 0.04)
      }
    }
    for (const q of [0.32, 0.28]) {
      const last = await bitmapToJpegBlob(bitmap, 320, q)
      if (last && last.size <= ARK_REFERENCE_IMAGE_BYTE_LIMIT) {
        const buf = await last.arrayBuffer()
        return { mimeType: "image/jpeg", dataBase64: uint8ToBase64Binary(new Uint8Array(buf)) }
      }
    }
  } finally {
    bitmap.close()
  }

  throw new Error("参考图经自动压缩后仍超过接口大小限制，请在本地缩小分辨率或换用更小的图片后再试。")
}

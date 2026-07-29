/**
 * 视频模块通用工具函数
 */
import { getFastapiBase } from "@/lib/fastapi-base"

/* ------------------------------------------------------------------ */
/*  文件处理                                                             */
/* ------------------------------------------------------------------ */

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result as string
      const idx = r.indexOf(",")
      resolve(idx >= 0 ? r.slice(idx + 1) : r)
    }
    reader.onerror = () => reject(reader.error ?? new Error("读取失败"))
    reader.readAsDataURL(file)
  })
}

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/** 静态视频/封面 URL 仍由 FastAPI 挂载 /static/* */
export function resolveMediaUrl(url: string): string {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return url

  const fastapiBase =
    getFastapiBase() || (typeof window !== "undefined" ? window.location.origin : "")
  const staticPostprocess = "/static/video-postprocess/"

  if (url.startsWith("http")) {
    try {
      const parsed = new URL(url)
      if (parsed.pathname.includes(staticPostprocess)) {
        const path = parsed.pathname + parsed.search
        const base = fastapiBase.replace(/\/$/, "")
        if (base && !url.startsWith(base)) {
          return `${base}${path}`
        }
      }
    } catch {
      /* keep original */
    }
    return url
  }

  const base = fastapiBase
  return `${base.replace(/\/$/, "")}${url.startsWith("/") ? url : `/${url}`}`
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("failed to load image"))
    img.src = src
  })
}

function drawToJpegThumbnail(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxEdge: number,
): string {
  const scale = Math.min(maxEdge / width, maxEdge / height, 1)
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement("canvas")
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("canvas context unavailable")
  ctx.drawImage(source, 0, 0, w, h)
  return canvas.toDataURL("image/jpeg", 0.75)
}

/** Canvas 压缩为 JPEG data URL，控制 localStorage 体积 */
export function createImageThumbnail(dataUrlOrBase64: string, maxEdge = 240): Promise<string> {
  const src = dataUrlOrBase64.startsWith("data:")
    ? dataUrlOrBase64
    : `data:image/jpeg;base64,${dataUrlOrBase64}`
  return loadImageElement(src).then((img) =>
    drawToJpegThumbnail(img, img.naturalWidth, img.naturalHeight, maxEdge),
  )
}

/** 从视频首帧截图为 JPEG data URL */
export function createVideoThumbnail(file: File, maxEdge = 240): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video")
    video.muted = true
    video.playsInline = true
    const objectUrl = URL.createObjectURL(file)

    const cleanup = () => URL.revokeObjectURL(objectUrl)

    video.onloadeddata = () => {
      video.currentTime = 0
    }

    video.onseeked = () => {
      try {
        const { videoWidth, videoHeight } = video
        if (!videoWidth || !videoHeight) {
          cleanup()
          reject(new Error("invalid video dimensions"))
          return
        }
        const dataUrl = drawToJpegThumbnail(video, videoWidth, videoHeight, maxEdge)
        cleanup()
        resolve(dataUrl)
      } catch (err) {
        cleanup()
        reject(err)
      }
    }

    video.onerror = () => {
      cleanup()
      reject(new Error("failed to load video"))
    }

    video.src = objectUrl
  })
}

/* ------------------------------------------------------------------ */
/*  排列组合（批量混剪用）                                                */
/* ------------------------------------------------------------------ */

export function generatePermutations<T>(arr: T[], maxCount = 20): T[][] {
  if (arr.length <= 1) return [arr]
  const results: T[][] = []
  function permute(prefix: T[], remaining: T[]) {
    if (results.length >= maxCount) return
    if (remaining.length === 0) {
      results.push(prefix)
      return
    }
    for (let i = 0; i < remaining.length; i++) {
      const next = remaining.slice(0, i).concat(remaining.slice(i + 1))
      permute([...prefix, remaining[i]], next)
      if (results.length >= maxCount) return
    }
  }
  permute([], arr)
  return results
}

export function factorial(n: number): number {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

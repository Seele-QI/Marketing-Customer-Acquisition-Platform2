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

/** 文案提取允许的平台域名（与 main.py `_COPYWRITING_HOSTS` 对齐） */
const COPYWRITING_HOSTS = new Set([
  "www.douyin.com",
  "douyin.com",
  "v.douyin.com",
  "iesdouyin.com",
  "www.kuaishou.com",
  "kuaishou.com",
  "v.kuaishou.com",
  "www.bilibili.com",
  "bilibili.com",
  "b23.tv",
  "m.bilibili.com",
  "channels.weixin.qq.com",
  "www.xiaohongshu.com",
  "xiaohongshu.com",
  "xhslink.com",
  "www.youtube.com",
  "youtube.com",
  "youtu.be",
])

/**
 * 从抖音等平台「分享口令」整段文本中抠出第一条白名单视频链接。
 * 例：`…赚钱新机遇 # AI … https://v.douyin.com/xxx/ 复制此链接…` → `https://v.douyin.com/xxx/`
 */
export function extractVideoUrlFromShareText(raw: string): string | null {
  const text = (raw || "").trim()
  if (!text) return null

  // 每次新建正则，避免全局 lastIndex 污染
  const urlRe = /https?:\/\/[^\s<>"'`（）()【】\[\]《》\u3000]+/gi
  const trailRe = /[，。！？、；：,.!?;:]+$/
  const trailChars = "，。！？、；：,.!?;:）)」』】\"'"

  for (const match of text.matchAll(urlRe)) {
    let candidate = match[0].replace(trailRe, "")
    while (candidate && trailChars.includes(candidate[candidate.length - 1]!)) {
      candidate = candidate.slice(0, -1)
    }
    if (!candidate) continue
    try {
      const host = new URL(candidate).hostname.toLowerCase()
      if (COPYWRITING_HOSTS.has(host)) return candidate
    } catch {
      // ignore malformed
    }
  }

  if (/^https?:\/\//i.test(text)) {
    return text.split(/\s+/)[0] ?? null
  }
  return null
}

/** 由 FastAPI 挂载的本地静态资源路径前缀 */
const LOCAL_STATIC_PREFIXES = ["/static/video-postprocess/", "/static/video-generated/"] as const

/** 与 electron/utils/paths.ts UVICORN_PORT 保持一致 */
const DESKTOP_UVICORN_PORT = "8010"

function isLocalStaticMediaPath(url: string): boolean {
  try {
    const path = url.startsWith("http") ? new URL(url).pathname : url
    return LOCAL_STATIC_PREFIXES.some((prefix) => path.startsWith(prefix) || path.includes(prefix))
  } catch {
    return LOCAL_STATIC_PREFIXES.some((prefix) => url.includes(prefix))
  }
}

function localStaticPathFromUrl(url: string): string {
  if (url.startsWith("http")) {
    const parsed = new URL(url)
    return `${parsed.pathname}${parsed.search}`
  }
  return url.startsWith("/") ? url : `/${url}`
}

/** 桌面 Electron：页面在 3010，静态文件由 uvicorn 8010 直接提供（比 Next rewrite 更可靠） */
function getDesktopFastapiOrigin(bakedApi: string): string | null {
  if (typeof window === "undefined") return null

  const fromPreload = window.electronAPI?.localFastapiBase?.trim()
  if (fromPreload) {
    return fromPreload.replace(/\/$/, "")
  }

  const { hostname, port } = window.location
  const onDesktop =
    (hostname === "127.0.0.1" || hostname === "localhost") &&
    (port === "3010" || port === "")
  if (!onDesktop) return null

  if (bakedApi) {
    try {
      const parsed = new URL(bakedApi)
      if (
        (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost") &&
        parsed.port
      ) {
        return parsed.origin
      }
    } catch {
      /* fall through */
    }
  }
  return `http://127.0.0.1:${DESKTOP_UVICORN_PORT}`
}

/** 静态视频/封面 URL 仍由 FastAPI 挂载 /static/* */
export function resolveMediaUrl(url: string): string {
  if (!url || url.startsWith("blob:") || url.startsWith("data:")) return url

  const origin = typeof window !== "undefined" ? window.location.origin : ""
  const bakedApi = getFastapiBase()
  const staticPostprocess = "/static/video-postprocess/"

  const desktopApi = getDesktopFastapiOrigin(bakedApi)
  if (desktopApi && isLocalStaticMediaPath(url)) {
    return `${desktopApi}${localStaticPathFromUrl(url)}`
  }

  const fastapiBase = bakedApi || origin

  if (url.startsWith("http")) {
    try {
      const parsed = new URL(url)
      if (parsed.pathname.includes(staticPostprocess) || parsed.pathname.includes("/static/video-generated/")) {
        const path = parsed.pathname + parsed.search
        const base = fastapiBase.replace(/\/$/, "")
        if (base && !url.startsWith(base)) {
          if (desktopApi) {
            return `${desktopApi}${path}`
          }
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

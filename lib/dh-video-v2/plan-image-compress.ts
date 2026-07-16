/**
 * 分镜 plan-script 参考图压缩：缩小边长并转 JPEG，降低安装包弱网下 base64 POST 失败率。
 * 仅用于分镜 LLM（最多 3 张视觉输入），不影响 Seedance 提交用原图。
 */

const PLAN_IMAGE_MAX_SIDE = 1280
const PLAN_IMAGE_QUALITY = 0.72

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error("参考图解码失败"))
    img.src = dataUrl
  })
}

/** data URL → 压缩后的纯 base64（无 data: 前缀）；失败则回退原图 raw base64 */
export async function compressDataUrlForPlanScript(dataUrl: string): Promise<string> {
  const raw = (dataUrl || "").trim()
  if (!raw) return ""

  const comma = raw.indexOf(",")
  const originalB64 = comma >= 0 ? raw.slice(comma + 1) : raw
  // 已较小则跳过（约 < 200KB base64）
  if (originalB64.length < 200_000) return originalB64

  try {
    const src = raw.startsWith("data:") ? raw : `data:image/jpeg;base64,${raw}`
    const img = await loadImageFromDataUrl(src)
    let { width, height } = img
    if (width <= 0 || height <= 0) return originalB64

    if (width > PLAN_IMAGE_MAX_SIDE || height > PLAN_IMAGE_MAX_SIDE) {
      const ratio = Math.min(PLAN_IMAGE_MAX_SIDE / width, PLAN_IMAGE_MAX_SIDE / height)
      width = Math.round(width * ratio)
      height = Math.round(height * ratio)
    }

    const canvas = document.createElement("canvas")
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext("2d")
    if (!ctx) return originalB64
    ctx.drawImage(img, 0, 0, width, height)

    const jpegUrl = canvas.toDataURL("image/jpeg", PLAN_IMAGE_QUALITY)
    const idx = jpegUrl.indexOf(",")
    return idx >= 0 ? jpegUrl.slice(idx + 1) : originalB64
  } catch {
    return originalB64
  }
}

/** 分镜识图最多 3 张；压缩后返回 raw base64 列表 */
export async function compressImagesForPlanScript(dataUrls: string[]): Promise<string[]> {
  const slice = dataUrls.slice(0, 3)
  return Promise.all(slice.map((u) => compressDataUrlForPlanScript(u)))
}

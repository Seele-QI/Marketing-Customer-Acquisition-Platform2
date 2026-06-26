/** Remotion 服务端 fetch 资产 URL 白名单校验（防 SSRF）。 */

const HOST_WHITELIST = new Set([
  "rh-images.oss-cn-hongkong.aliyuncs.com",
  "rh-result.aliyuncs.com",
  "rh-image-upload.cn-shanghai.aliyuncs.com",
])

const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1"])

export function isSafeRemotionAsset(url: string): boolean {
  const trimmed = (url || "").trim()
  if (!trimmed) return false

  if (trimmed.startsWith("/static/video-postprocess/")) return true
  if (trimmed.startsWith("/output/")) return true

  try {
    const u = new URL(trimmed)
    if (u.protocol !== "https:" && u.protocol !== "http:") return false
    const host = u.hostname.toLowerCase()
    if (BLOCKED_HOSTS.has(host)) return false
    if (host.endsWith(".local") || host.endsWith(".internal")) return false
    if (u.protocol === "http:" && !host.startsWith("127.0.0.1")) {
      // 生产只允许 https 远程资源；本地 dev 允许 http://127.0.0.1
      if (process.env.NODE_ENV === "production") return false
    }
    return HOST_WHITELIST.has(host)
  } catch {
    return false
  }
}

export function assertSafeRemotionAssets(urls: Array<string | undefined | null>): string | null {
  for (const u of urls) {
    if (!u) continue
    if (!isSafeRemotionAsset(u)) return u
  }
  return null
}

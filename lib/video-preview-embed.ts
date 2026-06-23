/**
 * 从用户粘贴的链接解析可预览的嵌入地址（B 站官方 iframe；抖音尝试整页嵌入，常受平台策略限制）。
 */

export type VideoPreviewParsed =
  | { kind: "bilibili"; embedUrl: string; watchUrl: string }
  | { kind: "douyin"; embedUrl: string; watchUrl: string }
  | { kind: "youtube"; embedUrl: string; watchUrl: string }
  | { kind: "link_only"; watchUrl: string; label: string }
  | { kind: "empty" }

function normalizeHref(raw: string): string {
  const t = raw.trim()
  if (!t) return ""
  if (/^https?:\/\//i.test(t)) return t
  return `https://${t}`
}

/** 从抖音域名 URL 中解析数字视频 id */
function parseDouyinVideoId(url: URL): string | null {
  const modal = url.searchParams.get("modal_id") || url.searchParams.get("group_id")
  if (modal && /^\d{10,20}$/.test(modal)) return modal
  const m = /\/video\/(\d{10,20})/.exec(url.pathname)
  return m ? m[1] : null
}

/** 从 B 站 pathname 解析 BV 号（不含 b23.tv 短链跳转） */
function parseBilibiliBvid(url: URL): string | null {
  const m = /\/video\/(BV[\w]+)/i.exec(url.pathname)
  return m ? m[1] : null
}

function parseYoutubeId(url: URL): string | null {
  const host = url.hostname.toLowerCase()
  if (host === "youtu.be") {
    const id = url.pathname.replace(/^\//, "").split("/")[0]
    return id && /^[\w-]{11}$/.test(id) ? id : null
  }
  if (host.includes("youtube.com")) {
    const v = url.searchParams.get("v")
    if (v && /^[\w-]{11}$/.test(v)) return v
    const m = /\/embed\/([\w-]{11})/.exec(url.pathname)
    return m ? m[1] : null
  }
  return null
}

export function parseVideoPreviewLink(raw: string): VideoPreviewParsed {
  const href = normalizeHref(raw)
  if (!href) return { kind: "empty" }

  let url: URL
  try {
    url = new URL(href)
  } catch {
    return { kind: "link_only", watchUrl: href, label: "当前链接" }
  }

  const host = url.hostname.toLowerCase()

  if (host.includes("bilibili.com")) {
    const bvid = parseBilibiliBvid(url)
    if (bvid) {
      const watchUrl = `https://www.bilibili.com/video/${bvid}`
      const embedUrl = `https://player.bilibili.com/player.html?bvid=${encodeURIComponent(bvid)}&high_quality=1&danmaku=0&autoplay=0`
      return { kind: "bilibili", embedUrl, watchUrl }
    }
  }

  if (host.includes("douyin.com") || host.includes("iesdouyin.com")) {
    const id = parseDouyinVideoId(url)
    if (id) {
      const watchUrl = `https://www.douyin.com/video/${id}`
      return { kind: "douyin", embedUrl: watchUrl, watchUrl }
    }
  }

  if (host.includes("youtube.com") || host === "youtu.be") {
    const id = parseYoutubeId(url)
    if (id) {
      const watchUrl = `https://www.youtube.com/watch?v=${id}`
      return { kind: "youtube", embedUrl: `https://www.youtube.com/embed/${id}?rel=0`, watchUrl }
    }
  }

  if (host.includes("xiaohongshu.com") || host.includes("xhslink.com")) {
    return { kind: "link_only", watchUrl: href, label: "小红书" }
  }

  return { kind: "link_only", watchUrl: href, label: "该链接" }
}

/**
 * 为每条热点生成稳定、可区分且贴近「近期」的相对发布时间文案（用于列表与弹窗）。
 */
const RELATIVE_TIME_POOL = [
  "刚刚",
  "3 分钟前",
  "8 分钟前",
  "18 分钟前",
  "26 分钟前",
  "42 分钟前",
  "54 分钟前",
  "1 小时前",
  "2 小时前",
  "3 小时前",
  "4 小时前",
  "5 小时前",
  "6 小时前",
  "8 小时前",
  "11 小时前",
  "昨天 08:20",
  "昨天 12:45",
  "昨天 15:30",
  "昨天 19:05",
  "昨天 22:18",
  "前天 09:50",
  "前天 14:12",
  "前天 20:40",
  "本周一 16:25",
] as const

export function publishTimeFromSeed(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i += 1) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0
  }
  const idx = Math.abs(h) % RELATIVE_TIME_POOL.length
  return RELATIVE_TIME_POOL[idx] ?? RELATIVE_TIME_POOL[0]
}

/** 取「抖音 · 话题」中的主平台名 */
export function primaryPlatformLabel(platform: string): string {
  const s = platform.trim()
  if (!s) return "未知来源"
  const dot = s.indexOf("·")
  if (dot === -1) return s
  const head = s.slice(0, dot).trim()
  return head || s
}

/** 取「抖音 · 话题」中的频道/场景后缀 */
export function platformChannelSuffix(platform: string): string {
  const s = platform.trim()
  const dot = s.indexOf("·")
  if (dot === -1) return ""
  return s.slice(dot + 1).trim()
}

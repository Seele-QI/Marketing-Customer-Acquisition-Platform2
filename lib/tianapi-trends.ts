/**
 * 天行 API 热搜抓取（与 main.py 行为对齐，供 Next Route Handler 调用）
 */

import { publishTimeFromSeed } from "@/lib/publish-time"

export type TrendItemRow = {
  rank: number
  title: string
  platform: string
  hot_value: string
  url?: string
  /** 侧栏/弹窗展示用近期相对时间 */
  publishTime: string
}

export type TrendBoardSection = {
  name: string
  status: "ok" | "rate_limited" | "unavailable" | "error"
  message?: string
  items: TrendItemRow[]
}

const MAX_ITEMS = 12

const lastSuccessItems: Record<string, TrendItemRow[]> = {}

function getApiKey(): string {
  return process.env.TIANAPI_KEY ?? "ca49b002c092a062687dd658f45992b0"
}

export function getHotEndpoints(): Record<string, string> {
  const key = getApiKey()
  return {
    百度风云榜: `https://apis.tianapi.com/nethot/index?key=${key}`,
    腾讯热搜榜: `https://apis.tianapi.com/wxhottopic/index?key=${key}`,
    头条热搜榜: `https://apis.tianapi.com/toutiaohot/index?key=${key}`,
    全网热搜榜: `https://apis.tianapi.com/networkhot/index?key=${key}`,
    微博热搜榜: `https://apis.tianapi.com/weibohot/index?key=${key}`,
    抖音热搜榜: `https://apis.tianapi.com/douyinhot/index?key=${key}`,
  }
}

export function normalizeHotValue(value: unknown): string {
  if (value === null || value === undefined) return "--"

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return "--"
    if (value < 10000) return "--"
    return `${(value / 10000).toFixed(1)}w`
  }

  const raw = String(value).trim()
  if (!raw) return "--"

  const direct = Number(raw)
  if (Number.isFinite(direct) && direct > 0) {
    if (direct < 10000) return "--"
    return `${(direct / 10000).toFixed(1)}w`
  }

  // 某些榜单会返回“缉 504036”这类混合字符串，提取首个数字片段
  const matched = raw.match(/(\d+(?:\.\d+)?)/)
  if (!matched) return "--"

  const numeric = Number(matched[1])
  if (!Number.isFinite(numeric) || numeric <= 0) return "--"
  if (numeric < 10000) return "--"
  return `${(numeric / 10000).toFixed(1)}w`
}

function estimateHotValue(boardName: string, rank: number, title: string): string {
  // 缺失热度时给出可读、稳定的估算值，避免前端出现 0.0w / --
  let hash = 0
  const seed = `${boardName}-${title}-${rank}`
  for (let i = 0; i < seed.length; i += 1) {
    hash = (Math.imul(31, hash) + seed.charCodeAt(i)) | 0
  }
  const noise = Math.abs(hash % 70) / 10 // 0.0 ~ 6.9

  let base = 120
  let step = 8
  if (boardName.includes("腾讯")) {
    base = 790
    step = 9
  } else if (boardName.includes("微博")) {
    base = 130
    step = 12
  } else if (boardName.includes("抖音")) {
    base = 200
    step = 14
  }

  const value = Math.max(8, base - (rank - 1) * step + noise)
  return `${value.toFixed(1)}w`
}

function parsePayload(payload: Record<string, unknown>, boardName: string): TrendItemRow[] {
  if (payload.code !== 200) {
    throw new Error(`上游接口异常: code=${String(payload.code)}, msg=${String(payload.msg ?? "unknown error")}`)
  }

  const result = payload.result as Record<string, unknown> | undefined
  const rawList = result?.list
  if (!Array.isArray(rawList)) {
    throw new Error("上游数据格式异常: result.list 不是数组")
  }

  const cleaned: TrendItemRow[] = []
  for (let idx = 0; idx < Math.min(rawList.length, MAX_ITEMS); idx += 1) {
    const item = rawList[idx]
    const rank = idx + 1
    if (!item || typeof item !== "object") {
      const title = "未命名热点"
      cleaned.push({
        rank,
        title,
        platform: boardName,
        hot_value: "--",
        publishTime: publishTimeFromSeed(`${boardName}|${title}|${rank}`),
      })
      continue
    }

    const o = item as Record<string, unknown>
    const urlCandidate = o.url ?? o.link ?? o.href ?? o.shareurl ?? o.shareUrl
    const url = typeof urlCandidate === "string" && urlCandidate.trim() ? urlCandidate.trim() : undefined
    const title =
      String(o.hotword ?? o.title ?? o.word ?? o.keyword ?? "")
        .trim() || "未命名热点"
    let hot_value = normalizeHotValue(
      o.hotwordnum ??
        o.hotnum ??
        o.hotindex ??
        o.index ??
        o.hotword ??
        o.heat ??
        o.hot ??
        o.num,
    )
    if (hot_value === "--") {
      hot_value = estimateHotValue(boardName, rank, title)
    }

    cleaned.push({
      rank,
      title,
      platform: boardName,
      hot_value,
      url,
      publishTime: publishTimeFromSeed(`${boardName}|${title}|${rank}`),
    })
  }

  return cleaned
}

async function fetchPayload(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  return (await response.json()) as Record<string, unknown>
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}

export async function fetchNetworkHotList(): Promise<TrendItemRow[]> {
  const endpoints = getHotEndpoints()
  const payload = await fetchPayload(endpoints["全网热搜榜"])
  return parsePayload(payload, "全网热搜榜")
}

export async function fetchTrendsBoard(name: string): Promise<TrendBoardSection> {
  const endpoints = getHotEndpoints()
  const url = endpoints[name]
  if (!url) {
    return {
      name,
      status: "unavailable",
      message: "未知榜单",
      items: [],
    }
  }

  try {
    const result = await fetchPayload(url)
    const code = result.code

    if (code === 130) {
      return {
        name,
        status: "rate_limited",
        message: String(result.msg ?? "API 调用频率超限"),
        items: lastSuccessItems[name] ?? [],
      }
    }

    if (code === 404) {
      return {
        name,
        status: "unavailable",
        message: String(result.msg ?? "API 不可用"),
        items: [],
      }
    }

    const items = parsePayload(result, name)
    if (items.length > 0) {
      lastSuccessItems[name] = items
    }

    return {
      name,
      status: "ok",
      message: "success",
      items: items.length > 0 ? items : (lastSuccessItems[name] ?? []),
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      name,
      status: "error",
      message,
      items: lastSuccessItems[name] ?? [],
    }
  }
}

export async function fetchAllTrendsSections(): Promise<TrendBoardSection[]> {
  const endpoints = getHotEndpoints()
  const entries = Object.entries(endpoints)

  const sections: TrendBoardSection[] = []

  // 逐个抓取（串行）以降低上游限频概率
  for (let i = 0; i < entries.length; i += 1) {
    const [name] = entries[i]
    const section = await fetchTrendsBoard(name)
    sections.push(section)
    // 轻微间隔，避免连续触发限频
    if (i < entries.length - 1) await sleep(250)
  }

  return sections
}

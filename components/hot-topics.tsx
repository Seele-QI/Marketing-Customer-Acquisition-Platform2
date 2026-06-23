"use client"

import { useEffect, useState, useCallback } from "react"
import { Flame, ArrowUp, Rocket, Zap, Radio, ArrowLeft } from "lucide-react"
import { VideoDetailModal } from "@/components/video-detail-modal"
import { publishTimeFromSeed } from "@/lib/publish-time"

type Topic = {
  rank: number
  title: string
  platform: string
  heat: string
  trend: "rising" | "hot" | "new" | "live"
  url?: string
  publishTime: string
}

const topicsSeed: Omit<Topic, "publishTime">[] = [
  { rank: 1, title: "AI 数字分身爆火", platform: "抖音 · 话题", heat: "128.0w", trend: "hot" },
  { rank: 2, title: "小红书爆款封面三段式", platform: "小红书 · 笔记", heat: "94.2w", trend: "rising" },
  { rank: 3, title: "2026 新消费品牌增长白皮书", platform: "微信 · 公众号", heat: "62.1w", trend: "new" },
  { rank: 4, title: "视频号直播一键切片", platform: "视频号 · 工具", heat: "48.9w", trend: "live" },
  { rank: 5, title: "抖音本地生活 POI 玩法", platform: "抖音 · 本地", heat: "35.4w", trend: "rising" },
  { rank: 6, title: "B 端获客：企微 SOP 拆解", platform: "企微 · 运营", heat: "22.7w", trend: "hot" },
  { rank: 7, title: "AIGC 爆款文案结构模型", platform: "知乎 · 精选", heat: "18.3w", trend: "new" },
  { rank: 8, title: "直播间停留时长优化清单", platform: "抖音 · 直播", heat: "16.8w", trend: "live" },
  { rank: 9, title: "品牌短剧投放 ROI 复盘", platform: "微博 · 品牌", heat: "15.2w", trend: "rising" },
  { rank: 10, title: "私域内容矩阵一周排期模板", platform: "企微 · 私域", heat: "14.0w", trend: "new" },
  { rank: 11, title: "短视频评论区高转化引导词", platform: "视频号 · 运营", heat: "13.2w", trend: "hot" },
  { rank: 12, title: "本地商家团购爆款标题合集", platform: "抖音 · 本地", heat: "12.4w", trend: "rising" },
]

const topics: Topic[] = topicsSeed.map((t) => ({
  ...t,
  publishTime: publishTimeFromSeed(`sidebar-default|${t.rank}|${t.title}|${t.platform}`),
}))

type FullBoardSection = {
  name: string
  status?: "ok" | "rate_limited" | "unavailable" | "error"
  message?: string
  items: { title: string; heat: string; cover: string; url?: string; publishTime?: string }[]
}

function isValidHeat(heat: string) {
  const value = heat.trim()
  return value !== "--" && value !== "0.0w"
}

function getHeatFallbackByRank(rank: number) {
  const safeRank = Math.max(1, rank)
  const heat = Math.max(12, 96 - (safeRank - 1) * 9.5)
  return `${heat.toFixed(1)}w`
}

function normalizeHeat(heat: string | undefined, rank: number) {
  const value = (heat ?? "").trim()
  return isValidHeat(value) ? value : getHeatFallbackByRank(rank)
}

const fullBoardSections: FullBoardSection[] = [
  {
    name: "抖音热度榜",
    items: [
      { title: "AI 数字分身爆火", heat: "128.0w", cover: "https://picsum.photos/seed/dy-1/160/100" },
      { title: "本地生活 POI 转化打法", heat: "116.2w", cover: "https://picsum.photos/seed/dy-2/160/100" },
      { title: "探店短视频 3 秒钩子模板", heat: "97.3w", cover: "https://picsum.photos/seed/dy-3/160/100" },
      { title: "直播切片复投策略", heat: "88.4w", cover: "https://picsum.photos/seed/dy-4/160/100" },
      { title: "同城团购引流话术合集", heat: "76.9w", cover: "https://picsum.photos/seed/dy-5/160/100" },
      { title: "短剧混剪高完播结构", heat: "69.8w", cover: "https://picsum.photos/seed/dy-6/160/100" },
    ],
  },
  {
    name: "小红书热度榜",
    items: [
      { title: "小红书爆款封面三段式", heat: "94.2w", cover: "https://picsum.photos/seed/xhs-1/160/100" },
      { title: "护肤赛道对比测评模板", heat: "85.1w", cover: "https://picsum.photos/seed/xhs-2/160/100" },
      { title: "反差感开头文案模型", heat: "79.8w", cover: "https://picsum.photos/seed/xhs-3/160/100" },
      { title: "旅行笔记高收藏结构", heat: "68.5w", cover: "https://picsum.photos/seed/xhs-4/160/100" },
      { title: "通勤穿搭 7 天合集模板", heat: "62.7w", cover: "https://picsum.photos/seed/xhs-5/160/100" },
      { title: "评论区引导高互动句式", heat: "56.3w", cover: "https://picsum.photos/seed/xhs-6/160/100" },
    ],
  },
  {
    name: "视频号热度榜",
    items: [
      { title: "视频号直播一键切片", heat: "48.9w", cover: "https://picsum.photos/seed/sph-1/160/100" },
      { title: "私域带货复盘框架", heat: "44.6w", cover: "https://picsum.photos/seed/sph-2/160/100" },
      { title: "企业号增长 7 日任务", heat: "39.7w", cover: "https://picsum.photos/seed/sph-3/160/100" },
      { title: "高留存口播脚本拆解", heat: "35.2w", cover: "https://picsum.photos/seed/sph-4/160/100" },
      { title: "社群裂变活动 SOP", heat: "30.4w", cover: "https://picsum.photos/seed/sph-5/160/100" },
      { title: "知识付费直播转化清单", heat: "27.8w", cover: "https://picsum.photos/seed/sph-6/160/100" },
    ],
  },
  {
    name: "公众号热度榜",
    items: [
      { title: "2026 新消费品牌增长白皮书", heat: "62.1w", cover: "https://picsum.photos/seed/gzh-1/160/100" },
      { title: "B 端获客：企微 SOP 拆解", heat: "22.7w", cover: "https://picsum.photos/seed/gzh-2/160/100" },
      { title: "AIGC 爆款文案结构模型", heat: "18.3w", cover: "https://picsum.photos/seed/gzh-3/160/100" },
      { title: "品牌年度叙事模板", heat: "16.9w", cover: "https://picsum.photos/seed/gzh-4/160/100" },
      { title: "高转化标题 20 例拆解", heat: "15.4w", cover: "https://picsum.photos/seed/gzh-5/160/100" },
      { title: "私域沉淀路径设计", heat: "13.8w", cover: "https://picsum.photos/seed/gzh-6/160/100" },
    ],
  },
  {
    name: "微博热搜榜",
    items: [
      { title: "城市演唱会夜经济升温", heat: "73.5w", cover: "https://picsum.photos/seed/wb-1/160/100" },
      { title: "春季户外穿搭关键词", heat: "61.8w", cover: "https://picsum.photos/seed/wb-2/160/100" },
      { title: "智能家居体验测评", heat: "55.1w", cover: "https://picsum.photos/seed/wb-3/160/100" },
      { title: "轻量健身打卡挑战", heat: "49.7w", cover: "https://picsum.photos/seed/wb-4/160/100" },
      { title: "假日周边游攻略合集", heat: "42.9w", cover: "https://picsum.photos/seed/wb-5/160/100" },
      { title: "新中式家装灵感图鉴", heat: "39.6w", cover: "https://picsum.photos/seed/wb-6/160/100" },
    ],
  },
  {
    name: "B站热视频榜",
    items: [
      { title: "10 分钟学会剪映关键帧", heat: "58.9w", cover: "https://picsum.photos/seed/bz-1/160/100" },
      { title: "品牌片分镜头脚本拆解", heat: "46.4w", cover: "https://picsum.photos/seed/bz-2/160/100" },
      { title: "低成本布光教程合集", heat: "39.2w", cover: "https://picsum.photos/seed/bz-3/160/100" },
      { title: "AI 配音拟真度评测", heat: "31.6w", cover: "https://picsum.photos/seed/bz-4/160/100" },
      { title: "Vlog 转场技巧 30 例", heat: "28.4w", cover: "https://picsum.photos/seed/bz-5/160/100" },
      { title: "产品测评镜头语言指南", heat: "24.1w", cover: "https://picsum.photos/seed/bz-6/160/100" },
    ],
  },
  {
    name: "知乎热榜",
    items: [
      { title: "新消费品牌如何做私域", heat: "29.8w", cover: "https://picsum.photos/seed/zh-1/160/100" },
      { title: "内容团队效率提升方案", heat: "25.2w", cover: "https://picsum.photos/seed/zh-2/160/100" },
      { title: "AIGC 在电商中的应用边界", heat: "22.6w", cover: "https://picsum.photos/seed/zh-3/160/100" },
      { title: "如何构建稳定选题机制", heat: "19.4w", cover: "https://picsum.photos/seed/zh-4/160/100" },
      { title: "品牌调性与转化如何平衡", heat: "17.6w", cover: "https://picsum.photos/seed/zh-5/160/100" },
      { title: "短视频团队岗位协作模板", heat: "15.1w", cover: "https://picsum.photos/seed/zh-6/160/100" },
    ],
  },
]

const trendMap = {
  hot: { icon: Flame, label: "热", style: "bg-rose-500/10 text-rose-500" },
  rising: { icon: ArrowUp, label: "升", style: "bg-blue-500/10 text-blue-500" },
  new: { icon: Rocket, label: "新", style: "bg-amber-500/10 text-amber-500" },
  live: { icon: Radio, label: "播", style: "bg-purple-500/10 text-purple-500" },
} as const

function getRankColorClass(rank: number): string {
  // 让榜单名次更丰富：黑/绿/黄等（同时兼顾暗色模式可读性）
  const palette = [
    "text-rose-600 dark:text-rose-400",
    "text-blue-600 dark:text-blue-400",
    "text-amber-600 dark:text-amber-400",
    "text-emerald-600 dark:text-emerald-400",
    "text-fuchsia-600 dark:text-fuchsia-400",
    "text-orange-600 dark:text-orange-400",
    "text-indigo-600 dark:text-indigo-400",
    "text-lime-600 dark:text-lime-400", // 绿
    "text-cyan-600 dark:text-cyan-400",
    "text-yellow-600 dark:text-yellow-400", // 黄
    "text-violet-600 dark:text-violet-400",
    "text-pink-600 dark:text-pink-400",
  ] as const

  const safe = Number.isFinite(rank) ? Math.max(1, Math.floor(rank)) : 1
  return palette[(safe - 1) % palette.length]
}

type HotTopicsProps = {
  variant?: "mini" | "full"
}

/** 侧栏热点等与仪表盘摘要文案共用的展示条数 */
export const HOT_TOPICS_HIGHLIGHT_COUNT = 12
const DISPLAY_COUNT = HOT_TOPICS_HIGHLIGHT_COUNT
const MINI_DISPLAY_COUNT = 7

/** 「一键抓取 / 实时更新」每日上限（自然日 0 点起算，本地计数） */
const DAILY_CRAWL_LIMIT = 10
const CRAWL_COUNT_STORAGE_KEY = "hot_topics_crawl_daily_v1"

type CrawlDailyPayload = { date: string; count: number }

function getTodayLocalDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function getCrawlCountToday(): number {
  if (typeof window === "undefined") return 0
  try {
    const raw = localStorage.getItem(CRAWL_COUNT_STORAGE_KEY)
    if (!raw) return 0
    const p = JSON.parse(raw) as CrawlDailyPayload
    const today = getTodayLocalDate()
    if (!p || p.date !== today) return 0
    const n = Number(p.count)
    return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
  } catch {
    return 0
  }
}

function incrementCrawlCountOnSuccess(): void {
  if (typeof window === "undefined") return
  const today = getTodayLocalDate()
  try {
    const cur = getCrawlCountToday()
    const payload: CrawlDailyPayload = { date: today, count: cur + 1 }
    localStorage.setItem(CRAWL_COUNT_STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / 隐私模式 */
  }
}

const BOARD_PRIORITY: Record<string, number> = {
  全网热搜榜: 0,
  抖音热搜榜: 1,
  头条热搜榜: 2,
  微博热搜榜: 3,
}

function sortBoardSectionsByPriority(sections: FullBoardSection[]): FullBoardSection[] {
  return [...sections].sort((a, b) => {
    const pa = BOARD_PRIORITY[a.name] ?? 999
    const pb = BOARD_PRIORITY[b.name] ?? 999
    if (pa !== pb) return pa - pb
    return a.name.localeCompare(b.name, "zh-CN")
  })
}

function ensureSectionDisplayCount(section: FullBoardSection, sectionIndex: number): FullBoardSection {
  const items = [...section.items]
  while (items.length < DISPLAY_COUNT) {
    const rank = items.length + 1
    const title = "暂无更多热点"
    items.push({
      title,
      heat: getHeatFallbackByRank(rank),
      cover: `https://picsum.photos/seed/fallback-section-${sectionIndex + 1}-${rank}/160/100`,
      publishTime: publishTimeFromSeed(`board-fallback|${sectionIndex}|${title}|${rank}`),
    })
  }
  return { ...section, items: items.slice(0, DISPLAY_COUNT) }
}

export function HotTopics({ variant = "mini" }: HotTopicsProps) {
  const [showFullBoard, setShowFullBoard] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [topicList, setTopicList] = useState<Topic[]>(topics)
  const [boardSections, setBoardSections] = useState<FullBoardSection[]>(
    () => fullBoardSections.map((section, sectionIndex) => ensureSectionDisplayCount(section, sectionIndex)),
  )
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailTopic, setDetailTopic] = useState<Topic | null>(null)
  const [crawlUsedToday, setCrawlUsedToday] = useState(0)
  const STORAGE_KEY = "hot_topics_cached_data_v3"

  useEffect(() => {
    setCrawlUsedToday(getCrawlCountToday())
  }, [])

  const closeDetail = useCallback(() => {
    setDetailOpen(false)
  }, [])

  const hasCriticalBoardsReady = useCallback((sections: FullBoardSection[]) => {
    const requiredBoards = ["抖音热搜榜", "微博热搜榜"]
    return requiredBoards.every((name) => {
      const s = sections.find((it) => it.name === name)
      return Boolean(s && s.status === "ok" && s.items.length > 0)
    })
  }, [])

  const resolveTrendByRank = (rank: number): Topic["trend"] => {
    if (rank === 1) return "hot"
    if (rank === 2 || rank === 5) return "rising"
    if (rank === 3 || rank === 6) return "new"
    if (rank === 4) return "live"

    // 7+ 让颜色更丰富（升/新/播循环）
    const cycle: Topic["trend"][] = ["rising", "new", "live"]
    return cycle[(Math.max(7, rank) - 7) % cycle.length]
  }

  const openDetailFromBoardItem = useCallback(
    (boardName: string, index: number, item: { title: string; heat: string; url?: string; publishTime?: string }) => {
      const rank = index + 1
      setDetailTopic({
        rank,
        title: item.title,
        platform: boardName,
        heat: item.heat,
        url: item.url,
        trend: resolveTrendByRank(rank),
        publishTime: item.publishTime ?? publishTimeFromSeed(`board-open|${boardName}|${item.title}|${rank}`),
      })
      setDetailOpen(true)
    },
    [resolveTrendByRank],
  )

  const handleFetchTopics = async () => {
    if (loading) return
    if (getCrawlCountToday() >= DAILY_CRAWL_LIMIT) {
      setError(`今日抓取次数已用完（每日最多 ${DAILY_CRAWL_LIMIT} 次），请明日再试`)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/trends/fetch-all", {
        method: "GET",
        headers: { Accept: "application/json" },
      })
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

      const data = (await response.json()) as Array<{
        name: string
        status?: "ok" | "rate_limited" | "unavailable" | "error"
        message?: string
        items: Array<{
          rank: number
          title: string
          platform: string
          hot_value: string
          url?: string
        }>
      }>

      if (!Array.isArray(data)) {
        throw new Error("返回格式错误")
      }

      const nextSections: FullBoardSection[] = data.map((section, sectionIndex) => {
        const mappedItems = (Array.isArray(section.items) ? section.items : []).slice(0, DISPLAY_COUNT).map((item, itemIndex) => {
          const title = item.title || "未命名热点"
          return {
            title,
            heat: normalizeHeat(item.hot_value, itemIndex + 1),
            url: item.url,
            cover: `https://picsum.photos/seed/fetch-section-${sectionIndex + 1}-${itemIndex + 1}-${encodeURIComponent(title)}/160/100`,
            publishTime: publishTimeFromSeed(`fetch-board|${section.name}|${title}|${itemIndex}`),
          }
        })
        return ensureSectionDisplayCount(
          {
            name: section.name || `热度榜${sectionIndex + 1}`,
            status: section.status,
            message: section.message,
            items: mappedItems,
          },
          sectionIndex,
        )
      })

      const mainSection = data.find((section) => section.name === "全网热搜榜") ?? data[0]

      const normalized: Topic[] = (mainSection?.items ?? []).slice(0, DISPLAY_COUNT).map((item, index) => {
        const rank = Number(item.rank) || index + 1
        const title = item.title || "未命名热点"
        const platform = item.platform || mainSection?.name || "未知平台"
        return {
          rank,
          title,
          platform,
          heat: normalizeHeat(item.hot_value, rank),
          url: item.url,
          trend: resolveTrendByRank(rank),
          publishTime: publishTimeFromSeed(`fetch-main|${platform}|${title}|${rank}`),
        }
      })

      if (normalized.length === 0) {
        const status = mainSection?.status
        const baseTitle =
          status === "unavailable"
            ? "接口不可用（未开通/不支持）"
            : status === "rate_limited"
              ? "接口限频（可稍后重试）"
              : status === "error"
                ? "抓取失败（可稍后重试）"
                : "暂无可用数据"
        for (let i = 1; i <= DISPLAY_COUNT; i += 1) {
          normalized.push({
            rank: i,
            title: baseTitle,
            platform: mainSection?.name || "全网热搜榜",
            heat: getHeatFallbackByRank(i),
            trend: resolveTrendByRank(i),
            publishTime: publishTimeFromSeed(`fetch-empty|${baseTitle}|${i}`),
          })
        }
      } else {
        while (normalized.length < DISPLAY_COUNT) {
          const rank = normalized.length + 1
          normalized.push({
            rank,
            title: "暂无更多热点",
            platform: mainSection?.name || "全网热搜榜",
            heat: getHeatFallbackByRank(rank),
            trend: resolveTrendByRank(rank),
            publishTime: publishTimeFromSeed(`fetch-pad|${mainSection?.name}|${rank}`),
          })
        }
      }

      // 图一严格跟随图二的真实爬取，不回退静态 mock
      setTopicList(normalized)
      const fallbackSections = fullBoardSections.map((section, sectionIndex) =>
        ensureSectionDisplayCount(section, sectionIndex),
      )
      setBoardSections(sortBoardSectionsByPriority(nextSections.length > 0 ? nextSections : fallbackSections))
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            topicList: normalized,
            boardSections: sortBoardSectionsByPriority(nextSections.length > 0 ? nextSections : fallbackSections),
          })
        )
      } catch {
        // Ignore storage write errors (private mode/quota/full).
      }

      incrementCrawlCountOnSuccess()
      setCrawlUsedToday(getCrawlCountToday())
      if (!hasCriticalBoardsReady(nextSections)) {
        setError("抖音或微博本次未成功抓取，可继续点击重试")
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "网络异常"
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as {
        topicList?: Topic[]
        boardSections?: FullBoardSection[]
      }

      const looksLikeOldTencentHotCache =
        Array.isArray(parsed.boardSections) &&
        parsed.boardSections.some((s) => typeof s?.message === "string" && s.message.includes("tencenthot/index"))

      if (Array.isArray(parsed.topicList) && parsed.topicList.length > 0) {
        setTopicList(
          parsed.topicList.map((row) => ({
            ...row,
            publishTime:
              row.publishTime ??
              publishTimeFromSeed(`cache-topic|${row.rank}|${row.title}|${row.platform}`),
          })),
        )
      }
      if (!looksLikeOldTencentHotCache && Array.isArray(parsed.boardSections) && parsed.boardSections.length > 0) {
        setBoardSections(
          sortBoardSectionsByPriority(
            parsed.boardSections.map((section, sectionIndex) => ensureSectionDisplayCount(section, sectionIndex)),
          ),
        )
      }
    } catch {
      // Ignore corrupted cache and fallback to defaults.
    }
  }, [])


  if (variant === "full") {
    return (
      <section className="rounded-2xl border border-border/60 bg-card/95 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="text-[18px] font-bold leading-tight tracking-tight text-foreground">完整热度榜</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">按平台分区展示 · 点击即可实时抓取</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/85">
              {crawlUsedToday >= DAILY_CRAWL_LIMIT
                ? `今日抓取已达 ${DAILY_CRAWL_LIMIT} 次上限，明日 0 点起重置`
                : `今日剩余抓取 ${Math.max(0, DAILY_CRAWL_LIMIT - crawlUsedToday)} / ${DAILY_CRAWL_LIMIT} 次`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleFetchTopics}
            disabled={loading || crawlUsedToday >= DAILY_CRAWL_LIMIT}
            title={
              crawlUsedToday >= DAILY_CRAWL_LIMIT
                ? `每日最多抓取 ${DAILY_CRAWL_LIMIT} 次，请明日再试`
                : undefined
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Zap className="h-3 w-3" />
            {loading ? "抓取中..." : crawlUsedToday >= DAILY_CRAWL_LIMIT ? "今日已满" : "实时更新"}
          </button>
        </div>

        <div className="h-px bg-border/60" />
        {error ? (
          <div className="border-b border-border/60 bg-rose-50/70 px-4 py-2 text-[11px] text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
            抓取失败：{error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2">
          {boardSections.map((section) => (
            <section
              key={section.name}
              className="rounded-2xl border border-border/60 bg-background/60 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-foreground">{section.name}</h4>
                <div className="flex items-center gap-2">
                  {section.status && section.status !== "ok" ? (
                    <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      {section.status === "rate_limited"
                        ? "限频"
                        : section.status === "unavailable"
                          ? "不可用"
                          : "异常"}
                    </span>
                  ) : null}
                </div>
              </div>
              <ol className="space-y-2">
                {section.items.length === 0 ? (
                  <li className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                    <div>
                      {section.status === "unavailable"
                        ? "接口不可用（可能未开通/不支持）。"
                        : section.status === "rate_limited"
                          ? "接口限频，稍后可再次点击“实时更新”。"
                          : section.status === "error"
                            ? "抓取失败，稍后可再次点击“实时更新”。"
                            : "暂无可用数据，稍后可再次点击“实时更新”。"}
                    </div>
                    {section.message ? (
                      <div className="mt-1 break-words text-[11px] text-muted-foreground/80">{section.message}</div>
                    ) : null}
                  </li>
                ) : (
                  section.items.map((item, idx) => (
                    <li
                      key={item.title}
                      className="flex items-center justify-between rounded-xl border border-transparent px-2 py-1.5 transition-all hover:border-border/60 hover:bg-accent/40"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <img
                          src={item.cover}
                          alt={item.title}
                          className="h-11 w-16 shrink-0 rounded-lg object-cover ring-1 ring-border/60"
                          loading="lazy"
                        />
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="w-4 shrink-0 text-[11px] font-semibold text-muted-foreground">{idx + 1}</span>
                          <span className="truncate text-xs font-medium text-foreground">{item.title}</span>
                        </div>
                      </div>
                      {isValidHeat(item.heat) ? (
                        <span className="ml-3 shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                          {item.heat}
                        </span>
                      ) : (
                        <span className="ml-3 shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground/70">
                          {getHeatFallbackByRank(idx + 1)}
                        </span>
                      )}
                    </li>
                  ))
                )}
              </ol>
            </section>
          ))}
        </div>
      </section>
    )
  }

  return (
    <>
      <aside className="flex h-full animate-slide-in-right flex-col rounded-2xl border border-border/60 bg-card/95 shadow-sm backdrop-blur">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="text-[18px] font-bold leading-tight tracking-tight text-foreground">全网热点</h2>
            <p className="mt-1 text-[12px] text-muted-foreground">点一下爬一下</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground/85">
              {crawlUsedToday >= DAILY_CRAWL_LIMIT
                ? `今日抓取已达 ${DAILY_CRAWL_LIMIT} 次上限，明日再试`
                : `今日剩余 ${Math.max(0, DAILY_CRAWL_LIMIT - crawlUsedToday)} / ${DAILY_CRAWL_LIMIT} 次`}
            </p>
          </div>
          <button
            type="button"
            onClick={handleFetchTopics}
            disabled={loading || crawlUsedToday >= DAILY_CRAWL_LIMIT}
            title={
              crawlUsedToday >= DAILY_CRAWL_LIMIT
                ? `每日最多抓取 ${DAILY_CRAWL_LIMIT} 次，请明日再试`
                : undefined
            }
            className="inline-flex items-center gap-1.5 rounded-xl border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs font-semibold text-primary transition-all hover:border-primary/40 hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Zap className="h-3 w-3" />
            {loading ? "抓取中..." : crawlUsedToday >= DAILY_CRAWL_LIMIT ? "今日已满" : "一键抓取"}
          </button>
        </div>

        <div className="h-px bg-border/60" />
        {error ? (
          <div className="border-b border-border/60 bg-rose-50/70 px-4 py-2 text-[11px] text-rose-600 dark:bg-rose-500/10 dark:text-rose-300">
            抓取失败：{error}
          </div>
        ) : null}

        {/* List */}
      <ol className="flex-1 divide-y divide-border/50">
          {topicList.slice(0, MINI_DISPLAY_COUNT).map((t) => {
            const rankColorClass = getRankColorClass(t.rank)
            return (
              <li key={`${t.rank}-${t.title}`} className="animate-slide-up" style={{ animationDelay: `${300 + t.rank * 60}ms` }}>
                <button
                  type="button"
                  onClick={() => {
                    setDetailTopic(t)
                    setDetailOpen(true)
                  }}
                className="group flex w-full items-center gap-3 px-5 py-3.5 text-left transition-all hover:bg-accent/50"
                >
                  {/* Rank */}
                  <span
                  className={`w-6 shrink-0 text-center text-[30px] font-extrabold leading-none ${rankColorClass}`}
                  >
                    {t.rank}
                  </span>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                  <p className="truncate text-[18px] font-semibold leading-tight text-foreground group-hover:text-primary">
                      {t.title}
                    </p>
                  <p className="mt-1 truncate text-[13px] text-muted-foreground">{t.platform}</p>
                  </div>

                  {/* Heat */}
                <span className="shrink-0 text-[14px] font-semibold text-muted-foreground tabular-nums">{t.heat}</span>
                </button>
              </li>
            )
          })}
        </ol>

        {/* Footer */}
        <div className="border-t border-border/60 p-3">
          <button
            type="button"
            onClick={() => setShowFullBoard(true)}
            className="w-full rounded-full bg-background border border-border/60 py-2.5 text-[14px] font-semibold text-foreground transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary soft-shadow-sm"
          >
            查看完整热度榜
          </button>
        </div>
      </aside>

      <VideoDetailModal
        isOpen={detailOpen}
        onClose={closeDetail}
        trendItem={
          detailTopic
            ? {
                rank: detailTopic.rank,
                title: detailTopic.title,
                platform: detailTopic.platform,
                hot_value: detailTopic.heat,
                url: detailTopic.url,
                publishTime: detailTopic.publishTime,
                trend: detailTopic.trend,
              }
            : null
        }
      />

      {showFullBoard && (
        <div className="fixed inset-0 z-50 bg-gradient-to-b from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
          <div className="mx-auto h-full w-full max-w-[1400px] px-6 py-5">
            <div className="mb-4 flex items-center">
              <button
                type="button"
                onClick={() => setShowFullBoard(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border/70 bg-background/80 px-3 py-1.5 text-sm text-foreground backdrop-blur transition-all hover:-translate-x-0.5 hover:bg-accent"
                aria-label="返回"
              >
                <ArrowLeft className="h-4 w-4" />
                返回
              </button>
            </div>

            <div className="mb-5 rounded-2xl border border-border/60 bg-card/90 p-5 shadow-sm backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-2xl font-bold tracking-tight text-foreground">完整热度榜</h3>
                  <p className="mt-1 text-sm text-muted-foreground">按平台分区展示实时热点</p>
                </div>
                <span className="rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  实时更新
                </span>
              </div>
            </div>

            <div className="grid max-h-[calc(100vh-185px)] grid-cols-1 gap-4 overflow-y-scroll pr-1 [scrollbar-color:rgb(148_163_184)_rgb(241_245_249)] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100 md:grid-cols-2">
              {boardSections.map((section) => (
                <section
                  key={section.name}
                  className="rounded-2xl border border-border/60 bg-card/95 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-foreground">{section.name}</h4>
                    <div className="flex items-center gap-2">
                      {section.status && section.status !== "ok" ? (
                        <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                          {section.status === "rate_limited"
                            ? "限频"
                            : section.status === "unavailable"
                              ? "不可用"
                              : "异常"}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <ol className="space-y-2">
                    {section.items.length === 0 ? (
                      <li className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
                        <div>
                          {section.status === "unavailable"
                            ? "接口不可用（可能未开通/不支持）。"
                            : section.status === "rate_limited"
                              ? "接口限频，稍后可再次点击“一键抓取”。"
                              : section.status === "error"
                                ? "抓取失败，稍后可再次点击“一键抓取”。"
                                : "暂无可用数据，稍后可再次点击“一键抓取”。"}
                        </div>
                        {section.message ? (
                          <div className="mt-1 break-words text-[11px] text-muted-foreground/80">{section.message}</div>
                        ) : null}
                      </li>
                    ) : (
                      section.items.map((item, idx) => (
                        <li key={item.title}>
                          <button
                            type="button"
                            onClick={() => openDetailFromBoardItem(section.name, idx, item)}
                            className="flex w-full items-center justify-between rounded-xl border border-transparent px-2 py-1.5 text-left transition-all hover:border-border/60 hover:bg-accent/40"
                          >
                            <div className="flex min-w-0 items-center gap-2.5">
                              <img
                                src={item.cover}
                                alt={item.title}
                                className="h-11 w-16 shrink-0 rounded-lg object-cover ring-1 ring-border/60"
                                loading="lazy"
                              />
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="w-4 shrink-0 text-[11px] font-semibold text-muted-foreground">{idx + 1}</span>
                                <span className="truncate text-xs font-medium text-foreground">{item.title}</span>
                              </div>
                            </div>
                            {isValidHeat(item.heat) ? (
                              <span className="ml-3 shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                {item.heat}
                              </span>
                            ) : (
                              <span className="ml-3 shrink-0 rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground/70">
                                {getHeatFallbackByRank(idx + 1)}
                              </span>
                            )}
                          </button>
                        </li>
                      ))
                    )}
                  </ol>
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

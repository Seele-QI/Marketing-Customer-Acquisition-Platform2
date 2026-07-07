import type { MainView } from "@/components/dashboard-sidebar"

export type GlobalSearchAction =
  | { type: "openAgent"; name: string; meta?: { avatarUrl?: string; role?: string } }
  | { type: "goView"; view: MainView }

export type GlobalSearchItem = {
  id: string
  kind: "智能体" | "模板" | "热点" | "导航"
  title: string
  subtitle?: string
  /** 参与匹配的文本（小写化后仍支持中文 includes） */
  searchBlob: string
  action: GlobalSearchAction
}

const teamAgents: {
  name: string
  role: string
  description: string
  tags: string[]
  avatar: string
}[] = [
  {
    name: "灵犀",
    role: "视频制作导演",
    description: "从选题到分镜脚本，再到数字人口播成片，全流程自动生产短视频内容。",
    tags: ["分镜", "数字人", "剪辑"],
    avatar: "/agents/charlie-munger.jpg",
  },
  {
    name: "行远",
    role: "数据洞察官",
    description: "每日汇总经营与内容数据，自动生成增长洞察与下一步动作建议。",
    tags: ["数据洞察", "增长", "经营简报"],
    avatar: "/agents/peter-drucker.png",
  },
  {
    name: "灵汐",
    role: "灵感探索员",
    description: "实时抓取全网热点 × 跨界爆款，主动给你推送可二创的灵感闪卡。",
    tags: ["热点雷达", "灵感闪卡", "二创"],
    avatar: "/agents/naval-ravikant.jpg",
  },
  {
    name: "知行",
    role: "数据分析师",
    description: "支持自然语言提问，秒级生成增长漏斗、留存与归因图表。",
    tags: ["NL2SQL", "归因", "看板"],
    avatar: "/agents/ray-dalio.webp",
  },
  {
    name: "暖暖",
    role: "私域运营管家",
    description: "企微 SOP 自动跑批，按客户标签发送话术与活动，沉淀转化漏斗。",
    tags: ["企微", "SOP", "复购"],
    avatar: "/agents/warren-buffett.jpg",
  },
  {
    name: "织梦",
    role: "品牌视觉设计师",
    description: "一句话生成符合品牌调性的封面、海报与配色方案，导出即用。",
    tags: ["封面", "配色", "品牌"],
    avatar: "/agents/seth-godin.webp",
  },
  {
    name: "清岚",
    role: "AI面试辅导官",
    description: "覆盖校招与社招：技术面题库、行为面试 STAR、简历亮点提炼与模拟追问，帮你高效备面。",
    tags: ["面试题", "STAR", "简历"],
    avatar: "/agent-1.jpg",
  },
  {
    name: "文砚",
    role: "会议纪要专家",
    description: "把讨论录音或散乱纪要整理成结构化结论：决议、待办、责任人与截止时间，一键可同步到协作工具。",
    tags: ["纪要", "待办", "决议"],
    avatar: "/agent-wenyuan.png",
  },
  {
    name: "商策",
    role: "竞品与市场分析顾问",
    description: "围绕竞品矩阵、价格带、渠道与传播策略输出对比表与 SWOT，辅助你写市场简报与立项材料。",
    tags: ["竞品", "SWOT", "简报"],
    avatar: "/new-avatar.png",
  },
  {
    name: "语禾",
    role: "多语言本地化官",
    description: "中英日韩等多语种卖点、邮件与社媒文案本地化，兼顾文化差异与平台语气，支持术语表统一。",
    tags: ["翻译", "出海", "本地化"],
    avatar: "/avatar-hero.jpg",
  },
  {
    name: "景烁",
    role: "直播运营参谋",
    description: "排品节奏、憋单与逼单话术、福袋与互动设计，结合场次目标输出可执行的直播脚本与复盘提纲。",
    tags: ["排品", "话术", "复盘"],
    avatar: "/agents/miyamoto-musashi.webp",
  },
  {
    name: "律衡",
    role: "合同条款解读助理",
    description: "把合同与协议条款改写成要点清单与白话摘要，标出常见风险表述；输出仅供阅读参考，不构成法律意见。",
    tags: ["风险提示", "条款", "白话"],
    avatar: "/agents/marie-curie.webp",
  },
]

const copyTemplates: { name: string; category: string; description: string }[] = [
  {
    name: "小红书爆款制造机",
    category: "种草",
    description: "精通网感词汇与情绪共鸣，三段式结构一键生成高互动笔记，支持多风格标题与结尾 CTA。",
  },
  {
    name: "专业公文润色专家",
    category: "职场",
    description: "覆盖通知、请示、汇报等正式场景，自动修正语气和格式，让表达更严谨、更符合公文规范。",
  },
  {
    name: "短视频脚本文案",
    category: "视频",
    description: "按开场钩子-冲突转折-结尾引导结构生成脚本，适配 15 秒到 3 分钟多种短视频时长。",
  },
  {
    name: "电商带货话术师",
    category: "电商",
    description: "围绕卖点、痛点和限时机制，输出直播与短视频双场景成交话术，增强下单转化效率。",
  },
  {
    name: "整理资料",
    category: "效率",
    description: "把零散笔记、链接与长文一键归类：生成目录、要点卡片与可检索摘要，方便复习、汇报与二次创作。",
  },
  {
    name: "分析信息",
    category: "分析",
    description: "从数据、报告或方案中提炼结论、风险与机会点，支持对比评估、利益相关方梳理与决策建议表述。",
  },
  {
    name: "拆解逻辑",
    category: "思维",
    description: "梳理论证链条、前提与结论，标出跳跃与隐含假设；可用金字塔、MECE 或问题树帮你把复杂议题拆清楚。",
  },
  {
    name: "优化表达",
    category: "表达",
    description: "在保留原意的前提下压缩冗余、统一语气与术语，输出更顺口、好读、好落地的版本，可多风格并行对比。",
  },
  {
    name: "品牌宣传标语助手",
    category: "品牌",
    description: "从品牌定位和目标客群出发，生成有辨识度的 slogan 与传播短句，兼顾记忆点与调性统一。",
  },
  {
    name: "职场邮件优化官",
    category: "职场",
    description: "自动优化邮件主题、正文和结尾礼貌表达，突出关键事项，帮助你更专业地推进协作进度。",
  },
  {
    name: "AI面试题",
    category: "求职",
    description: "按岗位与职级生成笔试/面试题：含技术深挖、场景设计、行为面试与追问清单，附考察点与参考答案思路。",
  },
  {
    name: "朋友圈撰写文案",
    category: "社交",
    description: "针对日常分享、产品种草与活动宣传，输出有温度、有记忆点的朋友圈文案，支持多语气与多版本快速生成。",
  },
  {
    name: "口播文案创作",
    category: "视频",
    description: "面向口播/数字人/短视频拍摄，输出自然好念、气口清晰、带情绪起伏的口播稿，按秒数与平台节奏可切分。",
  },
]

function buildItems(): GlobalSearchItem[] {
  const team: GlobalSearchItem[] = teamAgents.map((a) => ({
    id: `team-${a.name}`,
    kind: "智能体",
    title: a.name,
    subtitle: a.role,
    searchBlob: [a.name, a.role, a.description, ...a.tags].join(" "),
    action: {
      type: "openAgent",
      name: a.name,
      meta: { avatarUrl: a.avatar, role: a.role },
    },
  }))

  const tpl: GlobalSearchItem[] = copyTemplates.map((t) => ({
    id: `tpl-${t.name}`,
    kind: "模板",
    title: t.name,
    subtitle: `${t.category} · 文案创作`,
    searchBlob: [t.name, t.category, "文案创作", "模板", t.description].join(" "),
    action: { type: "openAgent", name: t.name },
  }))

  const shortcuts: GlobalSearchItem[] = [
    {
      id: "nav-agent-center",
      kind: "智能体",
      title: "智能体中心",
      subtitle: "浏览与管理全部团队智能体",
      searchBlob: "智能体中心 智能体 机器人 agent",
      action: { type: "goView", view: "智能体中心" },
    },
    {
      id: "nav-copywriting",
      kind: "模板",
      title: "文案创作",
      subtitle: "选择文案创作分身与模板",
      searchBlob: "文案创作 文案 模板 创作 写作",
      action: { type: "goView", view: "文案创作" },
    },
    {
      id: "nav-extract",
      kind: "模板",
      title: "文案提取",
      subtitle: "从视频链接提取口播文案",
      searchBlob: "文案提取 视频 提取 字幕 语音转文字 文案 口播",
      action: { type: "goView", view: "文案提取" },
    },
    {
      id: "nav-geo-kb",
      kind: "导航",
      title: "企业知识库搭建",
      subtitle: "GEO优化 · 实体建模与 JSON-LD",
      searchBlob: "GEO 生成式引擎优化 知识库 实体 Schema JSON-LD 企业知识库搭建",
      action: { type: "goView", view: "企业知识库搭建" },
    },
    {
      id: "nav-geo-matrix",
      kind: "导航",
      title: "内容矩阵规划",
      subtitle: "GEO优化 · 主题集群与提示词库",
      searchBlob: "GEO 生成式引擎优化 内容矩阵 主题集群 提示词 矩阵规划",
      action: { type: "goView", view: "内容矩阵规划" },
    },
    {
      id: "nav-geo-article",
      kind: "导航",
      title: "深度优化文章创作",
      subtitle: "GEO优化 · 语义清晰与 FAQ 结构化",
      searchBlob: "GEO 生成式引擎优化 文章创作 深度优化 FAQ 语义",
      action: { type: "goView", view: "深度优化文章创作" },
    },
  ]

  return [...shortcuts, ...team, ...tpl]
}

export const GLOBAL_SEARCH_ITEMS: GlobalSearchItem[] = buildItems()

const MAX_RESULTS = 24

/** 本地日历日 YYYY-MM-DD，用于「推荐」按日随机 */
function localDateKey(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}

function fnv1a32(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  let a = seed >>> 0
  return function () {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const arr = [...items]
  const rnd = mulberry32(seed)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** 聚焦搜索框且无关键词时展示的推荐（全站入口固定在前；其后智能体 / 模板 / 热点按日随机抽取并打乱） */
export function getGlobalSearchRecommendations(): GlobalSearchItem[] {
  const nav = GLOBAL_SEARCH_ITEMS.filter((i) => i.id.startsWith("nav-"))
  const allAgents = GLOBAL_SEARCH_ITEMS.filter((i) => i.id.startsWith("team-"))
  const allTemplates = GLOBAL_SEARCH_ITEMS.filter((i) => i.id.startsWith("tpl-"))

  const day = localDateKey()
  const base = fnv1a32(`agenthub-reco|${day}`)

  const agentsPick = seededShuffle(allAgents, base ^ 0x9e3779b9).slice(0, 3)
  const tplPick = seededShuffle(allTemplates, base ^ 0x85ebca6b).slice(0, 2)

  const tail = seededShuffle([...agentsPick, ...tplPick], base ^ 0x27d4eb2d)
  return [...nav, ...tail]
}

export function filterGlobalSearchItems(query: string): GlobalSearchItem[] {
  const q = query.trim()
  if (!q) return []
  const lower = q.toLowerCase()
  const out: GlobalSearchItem[] = []
  for (const item of GLOBAL_SEARCH_ITEMS) {
    if (
      item.title.toLowerCase().includes(lower) ||
      item.searchBlob.toLowerCase().includes(lower) ||
      (item.subtitle && item.subtitle.toLowerCase().includes(lower))
    ) {
      out.push(item)
      if (out.length >= MAX_RESULTS) break
    }
  }
  return out
}

/**
 * 教程只读 fixture — 不写入业务 storage
 */

import type { IpPositioningReport } from "@/lib/ip-positioning-schema"
import type { DhV2ScriptPlan } from "@/lib/dh-video-v2/script-plan"
import type { HistoryRecord } from "@/lib/video/types"

export type ChatDemoMessage = {
  role: "user" | "assistant"
  content: string
}

export type CopywritingDemoFixture = {
  agentName: string
  messages: ChatDemoMessage[]
  scriptReady: string
}

export type DhVideoV2DemoFixture = {
  script: string
  creativeIdea: string
  aspectRatio: string
  imageUrls: string[]
  audioLabel: string
  scriptPlan: DhV2ScriptPlan
  videoUrl: string
  coverUrl: string
  stageLabels: string[]
}

export type ImageVideoDemoFixture = {
  script: string
  imageCount: number
  imageUrls: string[]
  audioLabel: string
  videoUrl: string
  coverUrl: string
}

export type MashupDemoFixture = {
  script: string
  videoCount: number
  audioLabel: string
  videoUrl: string
  coverUrl: string
}

export type PromoDemoFixture = {
  productPrompt: string
  promoScript: string
  frameUrls: string[]
  videoPrompt: string
  videoUrl: string
  coverUrl: string
}

export type ExtractDemoFixture = {
  url: string
  title: string
  text: string
  duration: number
  source: string
}

export type IpDemoFixture = {
  industry: string
  stageLabel: string
  report: IpPositioningReport
}

export type GeoKnowledgeDemoFixture = {
  companyName: string
  industry: string
  products: string[]
  skillSummary: string
  docNames: string[]
}

export type GeoMatrixCell = {
  day: number
  platform: string
  title: string
  geoIntent: string
  direction: string
}

export type GeoMatrixDemoFixture = {
  projectName: string
  platforms: string[]
  cells: GeoMatrixCell[]
}

export type GeoArticleDemoFixture = {
  title: string
  platform: string
  score: number
  markdown: string
}

export type AgentDemoFixture = {
  agentName: string
  role: string
  messages: ChatDemoMessage[]
}

export type CreditDemoFixture = {
  balance: number
  sampleLedger: Array<{ type: string; amount: number; note: string }>
  sampleCodeHint: string
}

export type DashboardDemoFixture = {
  highlights: string[]
  quickActions: string[]
}

export type SettingsDemoFixture = {
  tips: string[]
}

export type VideoHistoryDemoFixture = {
  records: HistoryRecord[]
}

export type TutorialFixtureMap = {
  dashboard: DashboardDemoFixture
  "ip-positioning": IpDemoFixture
  copywriting: CopywritingDemoFixture
  "copywriting-extract": ExtractDemoFixture
  "dh-video-v2": DhVideoV2DemoFixture
  "image-video": ImageVideoDemoFixture
  mashup: MashupDemoFixture
  "promo-video": PromoDemoFixture
  "video-history": VideoHistoryDemoFixture
  "geo-knowledge": GeoKnowledgeDemoFixture
  "geo-matrix": GeoMatrixDemoFixture
  "geo-article": GeoArticleDemoFixture
  "agent-center": AgentDemoFixture
  credit: CreditDemoFixture
  settings: SettingsDemoFixture
}

const PLACEHOLDER_COVER = "/brand-logo.png"
const PLACEHOLDER_VIDEO = "/tutorial/sample-preview.svg"
const PLACEHOLDER_PORTRAIT = "/tutorial/sample-portrait.svg"
const PLACEHOLDER_PRODUCT = "/tutorial/sample-product.svg"
const PLACEHOLDER_FRAME = "/tutorial/sample-frame.svg"

export const IP_DEMO_REPORT: IpPositioningReport = {
  oneLiner: "帮本地餐饮老板用短视频把「回头客」做成可复制的获客系统",
  sharpDiagnosis:
    "你有丰富的到店服务经验，但内容仍停留在「晒菜品」，缺少可识别的人设机制与转化路径。",
  cognitivePosition: "本地餐饮短视频获客教练 · 重结果轻花活",
  whyYouNotOthers:
    "你亲自操盘过 3 家门店从日均 20 桌到排队，知道哪些内容真能带来预约，而不是只涨播放。",
  differentiationLever: "用「到店转化漏斗」拆解每一条口播，而不是教拍摄技巧。",
  contrarianBelief: "本地餐饮不缺拍摄设备，缺的是把评论区变成预约的话术结构。",
  uniqueMechanism: "钩子 3 秒 → 痛点场景 → 到店福利 → 私信话术模板，四段式口播。",
  audienceProfile: "25–45 岁本地餐饮老板 / 店长，懂一点抖音但转化差。",
  corePainAndDesire: "拍了很多视频没客流；想要稳定到店预约与团购转化。",
  avoidDirections: ["纯美食探店博主路线", "全国性品牌营销课", "过度炫技的运镜教程"],
  platformPlans: [
    {
      platform: "抖音",
      priority: 1,
      reason: "本地生活流量最大，适合口播+团购挂载",
      contentStrategy: "日更 1 条 30–45 秒口播，评论区置顶预约话术",
    },
    {
      platform: "视频号",
      priority: 2,
      reason: "中年老板活跃，适合复用抖音成片",
      contentStrategy: "每周精选 3 条，配门店福利长文案",
    },
  ],
  contentPillars: ["到店转化拆解", "差评应对话术", "新品测款口播", "员工出镜SOP"],
  starterTopics: [
    "为什么你的探店视频没人预约",
    "一条口播如何挂上团购",
    "雨天没客流时店长该拍什么",
  ],
  monetizationLadder: [
    {
      stage: "信任期",
      offer: "免费「口播转化诊断」直播",
      priceRange: "0 元",
      whyNow: "快速积累本地老板私域",
    },
    {
      stage: "产品期",
      offer: "14 天到店获客陪跑",
      priceRange: "1999–3999 元",
      whyNow: "用可量化预约数成交",
    },
  ],
  thirtyDayPlan: [
    {
      week: "第 1 周",
      actions: ["明确人设一句话", "拍 7 条转化口播", "建企微社群"],
    },
    {
      week: "第 2 周",
      actions: ["复盘预约数据", "优化钩子", "做一场诊断直播"],
    },
  ],
  confidenceScore: 0.86,
}

export const DH_V2_DEMO_PLAN: DhV2ScriptPlan = {
  char_count: 104,
  duration_min: 28.9,
  duration_max: 31.5,
  plan_duration: 30,
  segment_count: 2,
  segments: [
    {
      index: 0,
      time_range: "0-15s",
      dialogue: "老板们有没有发现，探店视频播放很高，可预约总是上不来，问题往往出在最后五秒。",
      shot_details: "中景口播，手势指向屏幕下方团购入口",
      video_prompt: "竖屏数字人微笑讲解，背景为简约餐厅，字幕居中",
      dialogue_warning: "ok",
    },
    {
      index: 1,
      time_range: "15-30s",
      dialogue: "用钩子加痛点加到店福利的四段式，把评论区变成预约，私信话术我放在置顶评论了。",
      shot_details: "近景口播，展示手机预约界面示意",
      video_prompt: "竖屏数字人展示手机界面，语气坚定，BGM 轻快",
      dialogue_warning: "ok",
    },
  ],
}

const DEMO_HISTORY_BASE = Date.now() - 2 * 24 * 60 * 60 * 1000

export const TUTORIAL_FIXTURES: TutorialFixtureMap = {
  dashboard: {
    highlights: [
      "左侧主导航可展开「视频创作」「GEO优化」",
      "顶部搜索可直达模块与文案模板",
      "右上角积分徽章显示余额，点开可去充值",
    ],
    quickActions: ["身份定位", "文案创作", "数字人口播", "GEO 内容矩阵"],
  },
  "ip-positioning": {
    industry: "本地餐饮 · 短视频获客",
    stageLabel: "稳定成长期",
    report: IP_DEMO_REPORT,
  },
  copywriting: {
    agentName: "数字人口播文案",
    messages: [
      {
        role: "user",
        content: "我是做社区火锅的，帮我写一条 30 秒引流口播，强调今晚团购。",
      },
      {
        role: "assistant",
        content:
          "【30秒口播示例】\n老板们注意：社区火锅今晚 19 点团购仅 20 份。\n以前要排队一小时，现在下单立减，还送一份鸭血。\n想今晚就吃的，点左下角团购，我在店里等你。",
      },
    ],
    scriptReady:
      "老板们注意：社区火锅今晚 19 点团购仅 20 份。以前要排队一小时，现在下单立减，还送一份鸭血。想今晚就吃的，点左下角团购，我在店里等你。",
  },
  "copywriting-extract": {
    url: "https://www.douyin.com/video/tutorial-demo-sample",
    title: "示例：火锅店到店转化口播",
    text: "很多店播得热闹，预约却很少。把最后五秒改成明确福利和私信话术，评论区才会变成订单。",
    duration: 32,
    source: "douyin",
  },
  "dh-video-v2": {
    script:
      "老板们有没有发现，探店视频播放很高，可预约总是上不来，问题往往出在最后五秒。用钩子加痛点加到店福利的四段式，把评论区变成预约，私信话术我放在置顶评论了。",
    creativeIdea: "本地餐饮获客教练人设，语气笃定、接地气",
    aspectRatio: "9:16",
    imageUrls: [PLACEHOLDER_PORTRAIT],
    audioLabel: "示例音色 · 女声 8s",
    scriptPlan: DH_V2_DEMO_PLAN,
    videoUrl: PLACEHOLDER_VIDEO,
    coverUrl: PLACEHOLDER_COVER,
    stageLabels: ["填写素材", "AI 分镜（示例已生成）", "成片预览（静态样例）"],
  },
  "image-video": {
    script: "七张产品图串成一条图文视频：开场钩子 → 卖点 → 到店福利。",
    imageCount: 7,
    imageUrls: Array.from({ length: 7 }, () => PLACEHOLDER_PRODUCT),
    audioLabel: "示例旁白音色",
    videoUrl: PLACEHOLDER_VIDEO,
    coverUrl: PLACEHOLDER_COVER,
  },
  mashup: {
    script: "五段门店实拍混剪，配统一旁白与字幕，突出排队与出餐节奏。",
    videoCount: 5,
    audioLabel: "示例旁白音色",
    videoUrl: PLACEHOLDER_VIDEO,
    coverUrl: PLACEHOLDER_COVER,
  },
  "promo-video": {
    productPrompt: "社区火锅新品「藤椒牛肉锅」，突出麻香与两人餐价",
    promoScript: "15 秒种草：痛点（不知道吃什么）→ 产品特写 → 下单福利",
    frameUrls: [PLACEHOLDER_FRAME, PLACEHOLDER_FRAME, PLACEHOLDER_FRAME],
    videoPrompt: "产品特写推进，暖色灯光，结尾出现团购价格气泡",
    videoUrl: PLACEHOLDER_VIDEO,
    coverUrl: PLACEHOLDER_COVER,
  },
  "video-history": {
    records: [
      {
        id: "tutorial-hist-dh-v2",
        createdAt: DEMO_HISTORY_BASE,
        script: "探店播放高却没预约？改最后五秒…",
        videoUrl: PLACEHOLDER_VIDEO,
        coverUrl: PLACEHOLDER_COVER,
        source: "dh-video-v2",
        status: "success",
      },
      {
        id: "tutorial-hist-image",
        createdAt: DEMO_HISTORY_BASE + 3600_000,
        script: "七图产品种草旁白示例",
        videoUrl: PLACEHOLDER_VIDEO,
        coverUrl: PLACEHOLDER_COVER,
        source: "image-video",
        status: "success",
      },
      {
        id: "tutorial-hist-promo",
        createdAt: DEMO_HISTORY_BASE + 7200_000,
        script: "藤椒牛肉锅 15 秒宣传片示例",
        videoUrl: PLACEHOLDER_VIDEO,
        coverUrl: PLACEHOLDER_COVER,
        source: "promo-video",
        status: "success",
      },
    ],
  },
  "geo-knowledge": {
    companyName: "招财火锅（示例品牌）",
    industry: "本地餐饮",
    products: ["藤椒牛肉锅", "双人午市套餐", "企业团建锅底"],
    skillSummary:
      "品牌口径：重到店转化、拒绝空泛探店腔；关键词：社区火锅、团购预约、差评应对。",
    docNames: ["品牌手册.pdf", "门店FAQ.md", "竞品对比笔记.txt"],
  },
  "geo-matrix": {
    projectName: "示例 · 两周获客矩阵",
    platforms: ["抖音", "小红书", "公众号"],
    cells: [
      {
        day: 1,
        platform: "抖音",
        title: "探店高播却没预约？",
        geoIntent: "痛点共鸣",
        direction: "口播拆解最后五秒",
      },
      {
        day: 2,
        platform: "小红书",
        title: "社区火锅双人餐怎么选",
        geoIntent: "对比",
        direction: "套餐对比清单",
      },
      {
        day: 3,
        platform: "公众号",
        title: "差评应对话术模板",
        geoIntent: "教程",
        direction: "FAQ 长文",
      },
      {
        day: 4,
        platform: "抖音",
        title: "雨天没客流拍什么",
        geoIntent: "场景种草",
        direction: "情景口播",
      },
    ],
  },
  "geo-article": {
    title: "本地餐饮如何让 AI 搜索愿意引用你的到店攻略",
    platform: "公众号",
    score: 82,
    markdown: `# 本地餐饮如何让 AI 搜索愿意引用你的到店攻略

## 结论先行
AI 搜索更愿意引用「结构清晰、可核验、带本地场景」的内容，而不是空泛种草。

## 三个可执行动作
1. 在文首给出明确结论与适用人群  
2. 用表格对比套餐 / 时段 / 预约方式  
3. 补充真实门店信息与更新时间  

## FAQ
**问：一定要写很长吗？**  
答：不一定，但要有可引用的事实块与步骤。
`,
  },
  "agent-center": {
    agentName: "查理·芒格",
    role: "多元思维模型顾问",
    messages: [
      {
        role: "user",
        content: "本地餐饮短视频投入很大但转化差，该从哪拆？",
      },
      {
        role: "assistant",
        content:
          "先分清「注意力」和「到店」是两个问题。用逆向思维：列出转化失败的常见原因，优先砍掉不产生预约的内容形式，再加倍投放到已验证的钩子结构。",
      },
    ],
  },
  credit: {
    balance: 1280,
    sampleLedger: [
      { type: "兑换充值", amount: 1000, note: "示例兑换码入账" },
      { type: "消费", amount: -20, note: "身份定位报告（真实场景示例说明）" },
      { type: "消费", amount: -2, note: "文案创作 · 经济模型" },
    ],
    sampleCodeHint: "真实兑换请在「充值兑换」输入运营发放的兑换码",
  },
  settings: {
    tips: [
      "可在此管理自动保存的生成图片归档",
      "桌面版可检查应用更新",
      "主题可在顶栏切换浅色 / 深色",
    ],
  },
}

export function getTutorialFixture<K extends keyof TutorialFixtureMap>(
  key: K,
): TutorialFixtureMap[K] {
  return TUTORIAL_FIXTURES[key]
}

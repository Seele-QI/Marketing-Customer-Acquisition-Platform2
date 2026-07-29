/**
 * 教程场景注册表 — 覆盖普通用户侧栏全部可见板块
 */

import { FIXED_SCENE_COSTS, COPYWRITING_LLM_ECONOMY, GEO_ARTICLE_ECONOMY, SEEDANCE_SEGMENT_COST } from "@/lib/credit-pricing/registry"
import {
  TUTORIAL_MODULE_VIEWS,
  type TutorialScenario,
} from "@/lib/tutorial/types"
import { VIDEO_VIEWS } from "@/lib/video/workspace"
import { GEO_VIEWS } from "@/lib/geo/workspace"
import { TUTORIAL_WORKFLOWS } from "@/lib/tutorial/workflows"

/** 模块级短教程（附录）；主推见 TUTORIAL_WORKFLOWS */
export const TUTORIAL_MODULE_SCENARIOS: TutorialScenario[] = [
  {
    id: "dashboard-overview",
    kind: "module",
    module: "dashboard",
    title: "工作台总览",
    description: "认识侧栏、快速创作、搜索与积分入口。",
    estimatedMinutes: 3,
    priority: "p0",
    targetView: "工作台",
    fixtureKey: "dashboard",
    goal: "知道从哪里进入各功能，以及绿点 / 积分代表什么",
    inputs: ["无"],
    outputs: ["能独立找到文案、视频、GEO、充值入口"],
    steps: [
      {
        id: "dash-1",
        title: "侧栏主导航",
        body: "展开「视频创作」「GEO优化」可看到子功能；绿点表示有任务进行中。",
        desktopOnly: true,
        highlightTarget: "nav-视频创作",
        action: { type: "info", title: "侧栏", body: "桌面端左侧为常驻导航。" },
      },
      {
        id: "dash-2",
        title: "快速创作",
        body: "工作台卡片可一键跳到身份定位、文案或视频。",
        highlightTarget: "dashboard-quick-actions",
      },
      {
        id: "dash-3",
        title: "全局搜索",
        body: "顶栏搜索可找模块、文案模板与智能体。",
        highlightTarget: "global-search",
      },
    ],
  },
  {
    id: "ip-positioning-demo",
    module: "ip-positioning",
    title: "身份定位：示例报告",
    description: "浏览一份已生成的 IP 定位报告，了解诊断结构与 30 天计划。",
    estimatedMinutes: 4,
    priority: "p0",
    targetView: "身份定位",
    fixtureKey: "ip-positioning",
    creditHints: [
      {
        scene: "ai_ip_positioning",
        costLabel: `${FIXED_SCENE_COSTS.ai_ip_positioning} 积分`,
        note: "真实生成定位报告",
      },
    ],
    goal: "看懂报告字段，知道真实生成前要填哪些资料",
    inputs: ["阶段、行业、经历、受众等（示例已填）"],
    outputs: ["oneLiner、平台打法、内容支柱、30 天行动"],
    nextModules: ["copywriting"],
    steps: [
      {
        id: "ip-1",
        title: "打开身份定位",
        body: "引导式问答 + 可选上传资料，AI 输出差异化定位。",
        action: { type: "navigate", view: "身份定位" },
      },
      {
        id: "ip-2",
        title: "查看已保存示例报告",
        body: "下方示例为静态样例，不扣积分。真实提交才会调用 AI。",
        action: { type: "showDemo", fixtureKey: "ip-positioning" },
        highlightTarget: "tutorial-demo-panel",
      },
    ],
  },
  {
    id: "copywriting-demo",
    module: "copywriting",
    title: "文案创作：口播示例对话",
    description: "看懂四个文案分身，以及「跳转视频创作」的衔接。",
    estimatedMinutes: 4,
    priority: "p0",
    targetView: "文案创作",
    fixtureKey: "copywriting",
    creditHints: [
      {
        scene: "copywriting_llm",
        costLabel: `${COPYWRITING_LLM_ECONOMY}–15 积分/次`,
        note: "经济模型约 2 积分，高级模型约 15 积分",
      },
    ],
    goal: "能选择正确的文案分身并理解成片跳转",
    inputs: ["需求描述 / 快捷提示词"],
    outputs: ["口播稿 / 旁白 / 宣传脚本"],
    nextModules: ["dh-video-v2", "image-video", "promo-video"],
    steps: [
      {
        id: "cw-1",
        title: "进入文案创作",
        body: "默认打开宣传/口播类分身，可在顶栏切换四个 Agent。",
        action: { type: "navigate", view: "文案创作" },
      },
      {
        id: "cw-2",
        title: "阅读示例对话",
        body: "示例展示一轮完整问答与可复制口播稿，未调用真实模型。",
        action: { type: "showDemo", fixtureKey: "copywriting" },
      },
    ],
  },
  {
    id: "copywriting-extract-demo",
    module: "copywriting-extract",
    title: "文案提取：示例结果",
    description: "从视频链接提取口播文案的流程说明与静态结果。",
    estimatedMinutes: 3,
    priority: "p1",
    targetView: "文案提取",
    fixtureKey: "copywriting-extract",
    creditHints: [
      {
        scene: "copy_extract",
        costLabel: `${FIXED_SCENE_COSTS.copy_extract} 积分`,
        note: "真实提取（含 ASR）",
      },
    ],
    goal: "知道支持哪些平台，以及提取后可改写或去拍视频",
    inputs: ["抖音 / B站 / 快手 / 小红书 / YouTube 链接或分享口令"],
    outputs: ["口播文本、标题、时长"],
    nextModules: ["copywriting", "dh-video-v2"],
    steps: [
      {
        id: "ex-1",
        title: "打开文案提取",
        body: "粘贴分享口令时会自动识别链接。",
        action: { type: "navigate", view: "文案提取" },
      },
      {
        id: "ex-2",
        title: "查看示例提取结果",
        body: "静态样例展示完成后的文案与后续动作。",
        action: { type: "showDemo", fixtureKey: "copywriting-extract" },
      },
    ],
  },
  {
    id: "dh-video-v2-demo",
    module: "dh-video-v2",
    title: "数字人口播：分镜与成片样例",
    description: "走完「素材 → 分镜 → 成片」三步的已保存示例。",
    estimatedMinutes: 5,
    priority: "p1",
    targetView: VIDEO_VIEWS.DH_VIDEO_V2,
    fixtureKey: "dh-video-v2",
    creditHints: [
      {
        scene: "dh_v2_plan_script",
        costLabel: `${FIXED_SCENE_COSTS.dh_v2_plan_script} 积分`,
        note: "AI 分镜",
      },
      {
        scene: "dh_v2_video_segment",
        costLabel: `${SEEDANCE_SEGMENT_COST} 积分/15s 段`,
        note: "成片按段计费",
      },
    ],
    goal: "理解素材要求与分镜确认后再提交",
    inputs: ["参考图、音色、口播文案、创意描述"],
    outputs: ["分镜脚本、竖屏成片、可选封面"],
    nextModules: ["video-history"],
    steps: [
      {
        id: "dh-1",
        title: "打开数字人口播",
        body: "侧栏「视频创作 → 数字人口播视频（新）」。",
        action: { type: "navigate", view: VIDEO_VIEWS.DH_VIDEO_V2 },
      },
      {
        id: "dh-2",
        title: "浏览已保存示例",
        body: "含口播稿、分镜段、静态预览；不会提交 Seedance 任务。",
        action: { type: "showDemo", fixtureKey: "dh-video-v2" },
      },
    ],
  },
  {
    id: "image-video-demo",
    module: "image-video",
    title: "图文视频：三步样例",
    description: "至少 7 张图 + 音色 + 旁白，合成图文视频。",
    estimatedMinutes: 3,
    priority: "p2",
    targetView: VIDEO_VIEWS.IMAGE_VIDEO,
    fixtureKey: "image-video",
    creditHints: [
      {
        scene: "video_image_to_video",
        costLabel: `${FIXED_SCENE_COSTS.video_image_to_video} 积分 + 克隆音色`,
        note: "真实提交图文视频",
      },
    ],
    goal: "清楚最低素材数量与步骤条含义",
    inputs: ["≥7 张图、音色样本、旁白文案"],
    outputs: ["带字幕/BGM 的成片"],
    steps: [
      {
        id: "iv-1",
        title: "打开图文视频",
        action: { type: "navigate", view: VIDEO_VIEWS.IMAGE_VIDEO },
        body: "流程：素材准备 → 配音生成 → 视频合成。",
      },
      {
        id: "iv-2",
        title: "查看示例成片说明",
        action: { type: "showDemo", fixtureKey: "image-video" },
        body: "示例展示素材清单与结果卡片。",
      },
    ],
  },
  {
    id: "mashup-demo",
    module: "mashup",
    title: "视频混剪：三步样例",
    description: "至少 5 段视频素材混剪成片。",
    estimatedMinutes: 3,
    priority: "p2",
    targetView: VIDEO_VIEWS.MASHUP,
    fixtureKey: "mashup",
    creditHints: [
      {
        scene: "video_mashup",
        costLabel: `${FIXED_SCENE_COSTS.video_mashup} 积分 + 克隆音色`,
        note: "真实提交混剪",
      },
    ],
    goal: "知道混剪与图文视频的素材差异",
    inputs: ["≥5 段视频、音色、文案、可选封面图"],
    outputs: ["混剪成片"],
    steps: [
      {
        id: "mv-1",
        title: "打开视频混剪",
        action: { type: "navigate", view: VIDEO_VIEWS.MASHUP },
        body: "上传多段视频后统一旁白与字幕。",
      },
      {
        id: "mv-2",
        title: "查看示例",
        action: { type: "showDemo", fixtureKey: "mashup" },
        body: "静态说明最低素材与结果形态。",
      },
    ],
  },
  {
    id: "promo-video-demo",
    module: "promo-video",
    title: "宣传视频：分镜到成片样例",
    description: "产品图 → 分镜宫格 → 提示词 → 成片。",
    estimatedMinutes: 4,
    priority: "p2",
    targetView: VIDEO_VIEWS.PROMO,
    fixtureKey: "promo-video",
    creditHints: [
      {
        scene: "promo_storyboard",
        costLabel: `${FIXED_SCENE_COSTS.promo_storyboard} 积分`,
        note: "分镜",
      },
      {
        scene: "promo_segment",
        costLabel: `${SEEDANCE_SEGMENT_COST} 积分/15s`,
        note: "成片按段",
      },
    ],
    goal: "理解四步流水线与选帧确认点",
    inputs: ["产品图/描述、可选音色、时长与分辨率"],
    outputs: ["分镜帧、运镜提示词、宣传片"],
    steps: [
      {
        id: "pv-1",
        title: "打开宣传视频",
        action: { type: "navigate", view: VIDEO_VIEWS.PROMO },
        body: "适合电商与品牌短片。",
      },
      {
        id: "pv-2",
        title: "查看分镜与成片样例",
        action: { type: "showDemo", fixtureKey: "promo-video" },
        body: "不发起 RunningHub / Seedance 请求。",
      },
    ],
  },
  {
    id: "video-history-demo",
    module: "video-history",
    title: "历史记录：示例成片列表",
    description: "识别不同来源标签，知道在哪里下载回看。",
    estimatedMinutes: 2,
    priority: "p1",
    targetView: VIDEO_VIEWS.HISTORY,
    fixtureKey: "video-history",
    goal: "能区分数字人 / 图文 / 混剪 / 宣传来源",
    inputs: ["无（系统自动写入）"],
    outputs: ["历史卡片、封面、脚本摘要"],
    steps: [
      {
        id: "vh-1",
        title: "打开历史记录",
        action: { type: "navigate", view: VIDEO_VIEWS.HISTORY },
        body: "任务完成后也会 Toast 提示来这里查看。",
      },
      {
        id: "vh-2",
        title: "浏览示例列表",
        action: { type: "showDemo", fixtureKey: "video-history" },
        body: "教程样例仅展示在演示面板，不会写入你的真实历史。",
      },
    ],
  },
  {
    id: "geo-knowledge-demo",
    module: "geo-knowledge",
    title: "GEO 知识库：实体与 Skill 样例",
    description: "实体建模 → 文档 → 企业 Skill 的三角关系。",
    estimatedMinutes: 4,
    priority: "p2",
    targetView: GEO_VIEWS.KNOWLEDGE_BASE,
    fixtureKey: "geo-knowledge",
    creditHints: [
      {
        scene: "geo_skill_gen",
        costLabel: `${FIXED_SCENE_COSTS.geo_skill_gen} 积分`,
        note: "生成 Enterprise Skill",
      },
    ],
    goal: "明白 Skill 是矩阵与文章的口径来源",
    inputs: ["公司信息、产品、上传文档"],
    outputs: ["企业实体、文档库、Skill 摘要"],
    nextModules: ["geo-matrix"],
    steps: [
      {
        id: "gk-1",
        title: "打开企业知识库",
        action: { type: "navigate", view: GEO_VIEWS.KNOWLEDGE_BASE },
        body: "GEO = 生成式引擎优化，让内容更易被 AI 搜索引用。",
      },
      {
        id: "gk-2",
        title: "查看示例品牌与 Skill",
        action: { type: "showDemo", fixtureKey: "geo-knowledge" },
        body: "静态样例，不调用生成接口。",
      },
    ],
  },
  {
    id: "geo-matrix-demo",
    module: "geo-matrix",
    title: "内容矩阵：两周格子样例",
    description: "多平台 × 日期的选题矩阵如何阅读与编辑。",
    estimatedMinutes: 4,
    priority: "p2",
    targetView: GEO_VIEWS.CONTENT_MATRIX,
    fixtureKey: "geo-matrix",
    creditHints: [
      {
        scene: "geo_matrix_gen",
        costLabel: `${FIXED_SCENE_COSTS.geo_matrix_gen} 积分`,
        note: "生成两周矩阵",
      },
    ],
    goal: "能读懂 geoIntent 与平台列",
    inputs: ["项目、平台、Skill、模型偏好"],
    outputs: ["14 天选题格子"],
    nextModules: ["geo-article"],
    steps: [
      {
        id: "gm-1",
        title: "打开内容矩阵规划",
        action: { type: "navigate", view: GEO_VIEWS.CONTENT_MATRIX },
        body: "先建项目再生成；教程直接展示已有格子。",
      },
      {
        id: "gm-2",
        title: "阅读示例矩阵",
        action: { type: "showDemo", fixtureKey: "geo-matrix" },
        body: "每格含标题、意图与方向。",
      },
    ],
  },
  {
    id: "geo-article-demo",
    module: "geo-article",
    title: "深度文章：示例稿与评分",
    description: "从矩阵批量生成文章后的编辑与 GEO 评分形态。",
    estimatedMinutes: 4,
    priority: "p2",
    targetView: GEO_VIEWS.ARTICLE_EDITOR,
    fixtureKey: "geo-article",
    creditHints: [
      {
        scene: "geo_article",
        costLabel: `${GEO_ARTICLE_ECONOMY}–30 积分/篇`,
        note: "按模型档位计费",
      },
    ],
    goal: "知道文章从矩阵来，以及评分优化的意义",
    inputs: ["矩阵格子或方向模式配置"],
    outputs: ["Markdown 文章、GEO 分数"],
    steps: [
      {
        id: "ga-1",
        title: "打开深度文章创作",
        action: { type: "navigate", view: GEO_VIEWS.ARTICLE_EDITOR },
        body: "建议先完成知识库与矩阵。",
      },
      {
        id: "ga-2",
        title: "阅读示例文章",
        action: { type: "showDemo", fixtureKey: "geo-article" },
        body: "含结构清晰的可引用内容块。",
      },
    ],
  },
  {
    id: "agent-center-demo",
    module: "agent-center",
    title: "智能体中心：顾问对话样例",
    description: "团队智能体与文案分身的区别，以及示例策略对话。",
    estimatedMinutes: 3,
    priority: "p1",
    targetView: "智能体中心",
    fixtureKey: "agent-center",
    creditHints: [
      {
        scene: "ai_chat",
        costLabel: `${FIXED_SCENE_COSTS.ai_chat}+ 积分/次`,
        note: "真实对话按模型计费",
      },
    ],
    goal: "会搜索并召唤合适的顾问角色",
    inputs: ["问题描述 / 快捷提示"],
    outputs: ["策略建议对话"],
    steps: [
      {
        id: "ac-1",
        title: "打开智能体中心",
        action: { type: "navigate", view: "智能体中心" },
        body: "可用搜索筛选团队智能体。",
      },
      {
        id: "ac-2",
        title: "查看示例对话",
        action: { type: "showDemo", fixtureKey: "agent-center" },
        body: "静态 transcript，不走 chat-stream。",
      },
    ],
  },
  {
    id: "credit-demo",
    module: "credit",
    title: "充值兑换：余额与流水说明",
    description: "积分从哪来、怎么花、流水怎么看。",
    estimatedMinutes: 2,
    priority: "p0",
    targetView: "充值兑换",
    fixtureKey: "credit",
    goal: "能完成兑换码充值并读懂流水类型",
    inputs: ["运营发放的兑换码"],
    outputs: ["余额增加、流水记录"],
    steps: [
      {
        id: "cr-1",
        title: "打开充值兑换",
        action: { type: "navigate", view: "充值兑换" },
        body: "登录后可查余额与兑换。",
      },
      {
        id: "cr-2",
        title: "阅读示例流水",
        action: { type: "showDemo", fixtureKey: "credit" },
        body: "数字为演示数据，非你的真实账户。",
      },
    ],
  },
  {
    id: "settings-demo",
    module: "settings",
    title: "设置：常用项说明",
    description: "图片自动归档、主题与桌面更新等。",
    estimatedMinutes: 2,
    priority: "p2",
    targetView: "设置",
    fixtureKey: "settings",
    goal: "知道设置页能管理哪些本地偏好",
    inputs: ["无"],
    outputs: ["归档列表 / 更新检查"],
    steps: [
      {
        id: "st-1",
        title: "打开设置",
        action: { type: "navigate", view: "设置" },
        body: "在侧栏「更多」分组。",
        desktopOnly: true,
      },
      {
        id: "st-2",
        title: "查看要点",
        action: { type: "showDemo", fixtureKey: "settings" },
        body: "教程仅说明能力，不改你的本地配置。",
      },
    ],
  },
  {
    id: "help-center-meta",
    module: "help-center",
    title: "教程中心怎么用",
    description: "学习路径、模块目录、术语表与 FAQ 的使用方式。",
    estimatedMinutes: 2,
    priority: "p0",
    targetView: "帮助中心",
    goal: "能自行找回任意模块的示例与积分说明",
    inputs: ["无"],
    outputs: ["进度标记、可重播入口"],
    steps: [
      {
        id: "hc-1",
        title: "浏览教程中心",
        body: "本页即教程中心：选路径或单模块即可开始。",
        action: { type: "navigate", view: "帮助中心" },
      },
    ],
  },
]

/** 全量场景：工作流优先 + 模块附录 */
export const TUTORIAL_SCENARIOS: TutorialScenario[] = [
  ...TUTORIAL_WORKFLOWS,
  ...TUTORIAL_MODULE_SCENARIOS.map((s) => ({
    ...s,
    kind: (s.kind ?? "module") as TutorialScenario["kind"],
  })),
]

export function getTutorialScenario(id: string): TutorialScenario | undefined {
  return TUTORIAL_SCENARIOS.find((s) => s.id === id)
}

export function listScenariosByModule(moduleId: string): TutorialScenario[] {
  return TUTORIAL_SCENARIOS.filter((s) => s.module === moduleId)
}

/** 工作流 + 准备（主目录） */
export function listPathScenarios(): TutorialScenario[] {
  return TUTORIAL_SCENARIOS.filter(
    (s) => s.kind === "workflow" || s.kind === "prep" || s.priority === "path",
  ).sort((a, b) => (a.pathOrder ?? 99) - (b.pathOrder ?? 99))
}

/** 仅工作流（含 prep / finish） */
export function listWorkflowHubScenarios(): TutorialScenario[] {
  return TUTORIAL_SCENARIOS.filter(
    (s) => s.kind === "workflow" || s.kind === "prep",
  ).sort((a, b) => (a.pathOrder ?? 99) - (b.pathOrder ?? 99))
}

/** 模块附录短教程 */
export function listModuleScenarios(): TutorialScenario[] {
  return TUTORIAL_SCENARIOS.filter((s) => (s.kind ?? "module") === "module")
}

/** 每个用户可见模块至少有一个场景（用于完整性校验） */
export function modulesMissingScenarios(): string[] {
  const covered = new Set(TUTORIAL_SCENARIOS.map((s) => s.module))
  return Object.keys(TUTORIAL_MODULE_VIEWS).filter((m) => !covered.has(m as never))
}

export function getScenarioForView(view: string): TutorialScenario | undefined {
  return (
    listModuleScenarios().find((s) => s.targetView === view) ??
    TUTORIAL_SCENARIOS.find((s) => s.targetView === view && s.fixtureKey)
  )
}

export function scenarioKind(s: TutorialScenario): NonNullable<TutorialScenario["kind"]> {
  return s.kind ?? "module"
}

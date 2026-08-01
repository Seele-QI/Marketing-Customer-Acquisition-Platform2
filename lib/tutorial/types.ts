/**
 * 全软件零算力引导教程 — 类型契约
 *
 * 教程数据与业务草稿 / 任务 / 历史完全隔离：
 * - 仅进度写入 `agenthub-tutorial-progress-v1`
 * - 示例通过只读 fixture 注入 UI，不污染真实 storage
 */

import { GEO_VIEWS } from "@/lib/geo/workspace"
import { VIDEO_VIEWS } from "@/lib/video/workspace"

/** 与侧栏可见板块对齐的模块 ID */
export type TutorialModuleId =
  | "dashboard"
  | "ip-positioning"
  | "copywriting"
  | "copywriting-extract"
  | "dh-video-v2"
  | "image-video"
  | "mashup"
  | "promo-video"
  | "video-history"
  | "geo-knowledge"
  | "geo-matrix"
  | "geo-article"
  | "agent-center"
  | "credit"
  | "settings"
  | "help-center"

export type TutorialPriority = "p0" | "p1" | "p2" | "path"

/** 教程形态：工作流优先；模块短教程为附录 */
export type TutorialKind = "workflow" | "module" | "prep"

export type TutorialWorkflowId =
  | "prep"
  | "positioning-content"
  | "dh-oral"
  | "image-video"
  | "mashup"
  | "promo"
  | "geo-growth"
  | "finish-publish"

/** 教程步骤动作 — 编排层只做导航/高亮/展示，不触发真实 API */
export type TutorialStepAction =
  | { type: "navigate"; view: string }
  | { type: "openAgent"; name: string; copywriting?: boolean }
  | { type: "highlight"; target: string }
  | { type: "info"; title: string; body: string }
  | { type: "showDemo"; fixtureKey: string }
  | { type: "waitForClick"; target: string; label?: string }

export type TutorialStep = {
  id: string
  title: string
  body: string
  /** 桌面端才展示的步骤（移动端无侧栏时跳过） */
  desktopOnly?: boolean
  action?: TutorialStepAction
  /** 对应 data-tutorial-id */
  highlightTarget?: string
  /** 本步验收清单 */
  checklist?: string[]
  /** 公共路径下的流程图，如 /tutorial/flowcharts/02-digital-human.png */
  flowchart?: string
  tip?: string
  warning?: string
  expectedOutcome?: string
}

export type TutorialCreditHint = {
  scene: string
  costLabel: string
  note: string
}

export type TutorialScenario = {
  id: string
  module: TutorialModuleId
  title: string
  description: string
  estimatedMinutes: number
  priority: TutorialPriority
  /** 侧栏 / ContentArea 的 view key */
  targetView: string
  /** 真实使用时会消耗的积分说明（教程本身不扣） */
  creditHints?: TutorialCreditHint[]
  /** 用户目标一句话 */
  goal: string
  /** 前置条件说明 */
  prerequisites?: string[]
  /** 关键输入 */
  inputs: string[]
  /** 期望输出 */
  outputs: string[]
  /** 跨模块去向 */
  nextModules?: TutorialModuleId[]
  steps: TutorialStep[]
  /** 关联 fixture key，用于「查看已保存示例」 */
  fixtureKey?: string
  /** 主学习路径中的顺序（越小越靠前；仅 path / workflow 场景） */
  pathOrder?: number
  /** 默认 module，兼容旧场景 */
  kind?: TutorialKind
  /** 工作流 ID（kind=workflow | prep 时） */
  workflowId?: TutorialWorkflowId
  /** 最终业务成果（工作流卡片展示） */
  finalOutcomes?: string[]
  /** 开始前建议准备 */
  prepRequirements?: string[]
  /** 对应 docs 章节标题 */
  docSection?: string
  /** 工作流总览流程图 */
  flowchart?: string
  /** 适用场景短描述 */
  applicableWhen?: string
}

export type TutorialProgress = {
  version: 1
  completedScenarios: string[]
  lastScenarioId?: string
  lastStepIndex?: number
  dismissedWelcomeAt?: number
  updatedAt: number
}

export type TutorialDemoState = {
  active: boolean
  scenarioId: string | null
  fixtureKey: string | null
  stepIndex: number
}

/** 模块 → 默认 view key 映射（与 sidebar / workspace 对齐） */
export const TUTORIAL_MODULE_VIEWS: Record<TutorialModuleId, string> = {
  dashboard: "工作台",
  "ip-positioning": "身份定位",
  copywriting: "文案创作",
  "copywriting-extract": "文案提取",
  "dh-video-v2": VIDEO_VIEWS.DH_VIDEO_V2,
  "image-video": VIDEO_VIEWS.IMAGE_VIDEO,
  mashup: VIDEO_VIEWS.MASHUP,
  "promo-video": VIDEO_VIEWS.PROMO,
  "video-history": VIDEO_VIEWS.HISTORY,
  "geo-knowledge": GEO_VIEWS.KNOWLEDGE_BASE,
  "geo-matrix": GEO_VIEWS.CONTENT_MATRIX,
  "geo-article": GEO_VIEWS.ARTICLE_EDITOR,
  "agent-center": "智能体中心",
  credit: "充值兑换",
  settings: "设置",
  "help-center": "帮助中心",
}

export const TUTORIAL_MODULE_LABELS: Record<TutorialModuleId, string> = {
  dashboard: "工作台",
  "ip-positioning": "身份定位",
  copywriting: "文案创作",
  "copywriting-extract": "文案提取",
  "dh-video-v2": "数字人口播视频",
  "image-video": "图文视频",
  mashup: "视频混剪",
  "promo-video": "宣传视频",
  "video-history": "历史记录",
  "geo-knowledge": "企业知识库搭建",
  "geo-matrix": "内容矩阵规划",
  "geo-article": "深度优化文章创作",
  "agent-center": "智能体中心",
  credit: "充值兑换",
  settings: "设置",
  "help-center": "帮助中心",
}

/** 普通用户侧栏可见模块（不含管理员后台） */
export const TUTORIAL_USER_MODULES: TutorialModuleId[] = [
  "dashboard",
  "ip-positioning",
  "copywriting",
  "copywriting-extract",
  "dh-video-v2",
  "image-video",
  "mashup",
  "promo-video",
  "video-history",
  "geo-knowledge",
  "geo-matrix",
  "geo-article",
  "agent-center",
  "credit",
  "settings",
  "help-center",
]

export const TUTORIAL_WORKFLOW_IDS: TutorialWorkflowId[] = [
  "prep",
  "positioning-content",
  "dh-oral",
  "image-video",
  "mashup",
  "promo",
  "geo-growth",
  "finish-publish",
]

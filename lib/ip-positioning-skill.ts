/**
 * 个人 IP 定位 Skill 内核：方法论常量、诊断维度、输出章节约束、平台策略映射
 */

import {
  DEFAULT_NEWAPI_CLAUDE_MODEL,
  DEFAULT_NEWAPI_GPT_MODEL,
} from "@/lib/llm/model-registry"

export const IP_POSITIONING_FORMULA = {
  template:
    "我帮助 [特定人群] 获得 [明确结果]，通过 [独特方法]，基于 [可信证据]",
  dimensions: ["你是谁", "为谁服务", "解决什么问题", "为什么是你"],
} as const

export const DIFFERENTIATION_LEVERS = [
  {
    id: "blue_ocean",
    name: "Blue Ocean（蓝海交叉位）",
    hint: "在两个成熟赛道的交叉地带占位，避开正面红海竞争",
  },
  {
    id: "contrarian",
    name: "Contrarian Belief（反共识主张）",
    hint: "说出行业里大多数人不敢说的真话，用观点筛选同频受众",
  },
  {
    id: "unique_mechanism",
    name: "Unique Mechanism（独特方法论）",
    hint: "给方法命名，让受众记住「只有你能这样解决问题」",
  },
  {
    id: "category_ownership",
    name: "Category Ownership（自创品类）",
    hint: "定义一个新品类或心智标签，让自己成为该品类的默认答案",
  },
] as const

export const PLATFORM_STRATEGIES = {
  抖音: {
    driver: "兴趣驱动",
    focus: "钩子、形式、完播率、情绪张力",
    contentTypes: ["口播", "剧情反差", "实用干货", "访谈切片"],
  },
  小红书: {
    driver: "搜索驱动",
    focus: "场景词、封面标题、收藏率、结构清晰",
    contentTypes: ["图文笔记", "清单体", "对比测评", "教程"],
  },
  公众号: {
    driver: "深度信任",
    focus: "长文逻辑、案例证据、转化链路",
    contentTypes: ["深度长文", "案例拆解", "观点文", "连载"],
  },
  B站: {
    driver: "社区与深度",
    focus: "系列化、人格化、教程完整性",
    contentTypes: ["长视频教程", "Vlog", "测评", "系列课"],
  },
  视频号: {
    driver: "社交裂变与私域",
    focus: "信任感、中老年/商务人群、私域引流",
    contentTypes: ["知识分享", "直播切片", "观点口播"],
  },
} as const

export const DIAGNOSTIC_DIMENSIONS = [
  {
    id: "fundamentals",
    title: "用户基本面",
    fields: ["经历", "能力", "资源", "性格", "人生张力"],
  },
  {
    id: "market_fit",
    title: "市场适配",
    fields: ["谁会停留", "谁会信任", "谁会付费"],
  },
  {
    id: "differentiation",
    title: "差异化锚点",
    fields: ["反共识", "身份反差", "经历证据", "结果证明"],
  },
  {
    id: "content_strategy",
    title: "内容战略",
    fields: ["主叙事", "内容支柱", "首批选题", "平台优先级"],
  },
  {
    id: "business_strategy",
    title: "商业战略",
    fields: ["低门槛变现", "高客单变现", "长期资产化"],
  },
] as const

export const REPORT_SECTIONS = [
  { id: "conclusion", title: "结论页", description: "一句话定位 + 一针见血诊断" },
  { id: "cognitive_position", title: "你最该占据的认知位置", description: "心智占位与品类定义" },
  { id: "why_you", title: "为什么是你，不是别人", description: "证据链与不可替代性" },
  { id: "differentiation", title: "你最强的差异化杠杆", description: "反共识 + 独特方法论" },
  { id: "avoid", title: "你不该做的方向", description: "避坑与边界" },
  { id: "platforms", title: "平台优先级与内容打法", description: "分平台策略" },
  { id: "monetization", title: "变现路径阶梯", description: "短中长期变现设计" },
  { id: "action_plan", title: "接下来 30 天行动路线", description: "可执行启动计划" },
] as const

export const INTAKE_GROUPS = [
  {
    id: "basics",
    title: "基本情况",
    description: "你的职业背景、关键成果与现有资源",
    questions: [
      {
        id: "industry",
        label: "当前职业 / 行业",
        placeholder: "例如：互联网运营、教育培训、医美健康…",
        required: true,
        multiline: false,
      },
      {
        id: "keyExperiences",
        label: "关键经历与代表成果",
        placeholder: "你的工作经历、创业经历、学历、代表性项目或成果…",
        required: true,
        multiline: true,
      },
      {
        id: "resources",
        label: "现有资源 / 人脉 / 客户基础",
        placeholder: "你擅长什么？有什么资源？已有客户或粉丝基础？",
        required: true,
        multiline: true,
      },
    ],
  },
  {
    id: "tension",
    title: "人性与张力",
    description: "找到你的观点锋芒与独特经历",
    questions: [
      {
        id: "contrarianTrigger",
        label: "你最看不惯行业里的什么「常识」？",
        placeholder: "例如：大家都说要追热点，但我认为…",
        required: true,
        multiline: true,
      },
      {
        id: "frequentQuestions",
        label: "别人总会来问你什么问题？",
        placeholder: "朋友、同事、客户最常向你请教的话题…",
        required: true,
        multiline: true,
      },
      {
        id: "uniqueExperience",
        label: "你经历过什么别人没经历过，但这恰好能帮到目标用户？",
        placeholder: "特殊经历、转折、失败或跨界经验…",
        required: true,
        multiline: true,
      },
    ],
  },
  {
    id: "business",
    title: "商业与目标",
    description: "明确服务对象与变现方向",
    questions: [
      {
        id: "targetAudience",
        label: "你希望吸引哪类人？",
        placeholder: "年龄、职业、痛点、消费能力、决策场景…",
        required: true,
        multiline: true,
      },
      {
        id: "shortTermMonetization",
        label: "你短期最想变现什么？",
        placeholder: "咨询、课程、带货、服务、社群…",
        required: true,
        multiline: true,
      },
      {
        id: "longTermVision",
        label: "长期想成为什么？",
        placeholder: "行业专家、品牌主理人、平台型 IP…",
        required: true,
        multiline: true,
      },
      {
        id: "excludeAudience",
        label: "你不想服务哪类人？",
        placeholder: "明确边界，避免定位模糊…",
        required: false,
        multiline: true,
      },
    ],
  },
  {
    id: "content",
    title: "内容与表达",
    description: "找到最适合你的内容形式与气质",
    questions: [
      {
        id: "contentFormats",
        label: "你更适合哪种内容形式？",
        placeholder: "口播、访谈、案例拆解、日常 Vlog、图文、长文…",
        required: true,
        multiline: true,
      },
      {
        id: "outputFrequency",
        label: "你能稳定输出的频率是什么？",
        placeholder: "每周 2 条、每天 1 条、每月 4 篇长文…",
        required: true,
        multiline: false,
      },
      {
        id: "rememberedVibe",
        label: "你想被记住的气质是什么？",
        placeholder: "犀利、温暖、专业、幽默、反骨、治愈…",
        required: true,
        multiline: false,
      },
      {
        id: "extraInfo",
        label: "补充说明",
        placeholder: "目标平台、已有账号、特殊限制…",
        required: false,
        multiline: true,
      },
    ],
  },
] as const

export const STAGE_OPTIONS = [
  {
    id: "novice" as const,
    title: "新手探索期",
    desc: "刚起步，寻找方向",
    hint: "侧重定位梳理与起步路径，帮你找到差异化的切入口。",
  },
  {
    id: "growth" as const,
    title: "稳定成长期",
    desc: "有基础，寻求破圈",
    hint: "侧重选题破圈与转化闭环，帮你放大现有优势。",
  },
  {
    id: "mature" as const,
    title: "成熟变现期",
    desc: "成熟 IP，放大收入",
    hint: "侧重商业变现与矩阵扩张，帮你深化 IP 护城河。",
  },
] as const

export type StageId = (typeof STAGE_OPTIONS)[number]["id"]

export const DEFAULT_IP_POSITIONING_MODEL = DEFAULT_NEWAPI_GPT_MODEL
export const FALLBACK_IP_POSITIONING_MODEL = DEFAULT_NEWAPI_CLAUDE_MODEL

export const IP_POSITIONING_ALLOWED_MODELS = [
  DEFAULT_IP_POSITIONING_MODEL,
  FALLBACK_IP_POSITIONING_MODEL,
] as const

export function getStageHint(stageId: StageId | null | undefined): string {
  if (!stageId) return ""
  return STAGE_OPTIONS.find((s) => s.id === stageId)?.hint ?? ""
}

export function getStageTitle(stageId: StageId | null | undefined): string {
  if (!stageId) return ""
  return STAGE_OPTIONS.find((s) => s.id === stageId)?.title ?? ""
}

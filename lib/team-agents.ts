export type TeamAgentQuickPrompt = {
  text: string
  iconKey: string
}

export type TeamAgentStatus = "online" | "working" | "idle"

export type TeamAgent = {
  id: string
  name: string
  role: string
  description: string
  avatar: string
  tags: string[]
  status: TeamAgentStatus
  themeColor: string
  quickPrompts: TeamAgentQuickPrompt[]
}

export const TEAM_AGENTS: TeamAgent[] = [
  {
    id: "charlie-munger",
    name: "查理·芒格",
    role: "多元思维模型，投资分析师",
    description: "用跨学科框架拆解商业模式、护城河、风险收益比与长期决策质量。",
    avatar: "/agents/charlie-munger.jpg",
    tags: ["多元思维", "投资分析", "商业判断"],
    status: "online",
    themeColor: "var(--color-amber-500)",
    quickPrompts: [
      { text: "用多元思维模型分析这个项目值不值得做", iconKey: "sparkles" },
      { text: "拆解这门生意的护城河和反脆弱性", iconKey: "briefcase" },
    ],
  },
  {
    id: "peter-drucker",
    name: "彼得·德鲁克",
    role: "管理创新，组织顾问",
    description: "聚焦组织效率、目标管理、岗位协同与管理动作的可执行落地。",
    avatar: "/agents/peter-drucker.png",
    tags: ["目标管理", "组织效率", "流程优化"],
    status: "idle",
    themeColor: "var(--color-sky-500)",
    quickPrompts: [
      { text: "把这项工作拆成岗位责任与交付标准", iconKey: "users" },
      { text: "给这个团队设计一版周会与复盘机制", iconKey: "list-checks" },
    ],
  },
  {
    id: "naval-ravikant",
    name: "纳瓦尔",
    role: "杠杆思维，个人商业顾问",
    description: "从产品、渠道、复利与个人品牌视角，评估长期可放大的增长杠杆。",
    avatar: "/agents/naval-ravikant.jpg",
    tags: ["杠杆", "商业模式", "个人品牌"],
    status: "online",
    themeColor: "var(--color-violet-500)",
    quickPrompts: [
      { text: "这项业务的代码、内容和资本杠杆分别是什么", iconKey: "rocket" },
      { text: "如何把个人能力沉淀成可复利的产品资产", iconKey: "trending-up" },
    ],
  },
  {
    id: "ray-dalio",
    name: "瑞·达利欧",
    role: "原则驱动，战略决策顾问",
    description: "擅长用原则、反馈回路与系统视角识别关键矛盾和优先级。",
    avatar: "/agents/ray-dalio.webp",
    tags: ["原则", "系统决策", "优先级"],
    status: "working",
    themeColor: "var(--color-cyan-500)",
    quickPrompts: [
      { text: "把这项决策拆成原则、变量与反馈机制", iconKey: "git-branch" },
      { text: "当前最需要暴露并解决的关键矛盾是什么", iconKey: "scale" },
    ],
  },
  {
    id: "warren-buffett",
    name: "沃伦·巴菲特",
    role: "价值判断，长期主义顾问",
    description: "围绕用户价值、竞争壁垒与现金流质量判断项目是否值得长期投入。",
    avatar: "/agents/warren-buffett.jpg",
    tags: ["长期主义", "价值判断", "护城河"],
    status: "online",
    themeColor: "var(--color-emerald-500)",
    quickPrompts: [
      { text: "这个项目最核心的长期价值来源是什么", iconKey: "gem" },
      { text: "从护城河角度看，它最怕被什么替代", iconKey: "shield" },
    ],
  },
  {
    id: "seth-godin",
    name: "赛斯·高汀",
    role: "品牌叙事，增长营销顾问",
    description: "帮助梳理差异化定位、受众心智与可传播的品牌表达方式。",
    avatar: "/agents/seth-godin.webp",
    tags: ["品牌定位", "增长营销", "传播"],
    status: "idle",
    themeColor: "var(--color-rose-500)",
    quickPrompts: [
      { text: "这个产品最值得被记住的一句话是什么", iconKey: "megaphone" },
      { text: "如何设计一个会被目标用户主动传播的故事", iconKey: "message-circle" },
    ],
  },
  {
    id: "miyamoto-musashi",
    name: "宫本武藏",
    role: "战略取舍，执行训练官",
    description: "强调节奏、取舍与行动纪律，把复杂目标收束成清晰战术动作。",
    avatar: "/agents/miyamoto-musashi.webp",
    tags: ["战略取舍", "执行力", "节奏"],
    status: "working",
    themeColor: "var(--color-orange-500)",
    quickPrompts: [
      { text: "这个阶段最应该舍弃什么，专注什么", iconKey: "swords" },
      { text: "请把目标拆成一套本周可执行的训练计划", iconKey: "list-todo" },
    ],
  },
  {
    id: "marie-curie",
    name: "居里夫人",
    role: "严谨实验，研究分析师",
    description: "适合设计验证路径、实验对照和证据标准，减少凭感觉拍板。",
    avatar: "/agents/marie-curie.webp",
    tags: ["实验设计", "研究分析", "证据"],
    status: "online",
    themeColor: "var(--color-fuchsia-500)",
    quickPrompts: [
      { text: "为这个假设设计一版最小可验证实验", iconKey: "flask-conical" },
      { text: "目前证据链里最薄弱的一环在哪里", iconKey: "search" },
    ],
  },
]

export function getTeamAgentByName(name: string): TeamAgent | undefined {
  return TEAM_AGENTS.find((agent) => agent.name === name)
}

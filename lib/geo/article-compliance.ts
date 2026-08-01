export type ArticleRiskFinding = {
  id: string
  severity: "block"
  match: string
  guidance: string
}

type ArticleRiskRule = Omit<ArticleRiskFinding, "severity" | "match"> & {
  pattern: RegExp
}

type PlatformComplianceProfile = {
  guidance: string[]
  rules?: ArticleRiskRule[]
}

export const PLATFORM_COMPLIANCE_IDS = [
  "xiaohongshu",
  "douyin",
  "weibo",
  "dianping",
  "zhihu",
  "ctrip",
  "netease",
  "sohu",
] as const

const COMMON_GUIDANCE = [
  "禁止绝对化承诺、无法证明的领先排名和无条件效果保证。",
  "不得编造数据、政策结论、亲身经历、客户评价或第三方背书。",
  "高风险行业结论必须说明适用条件、时间地域和核验渠道。",
  "避免站外导流、隐私泄露、攻击竞品、垃圾营销和无关热点词。",
]

const COMMON_RULES: ArticleRiskRule[] = [
  {
    id: "absolute-ranking",
    pattern:
      /国家级|最高级|最佳|顶级|全网最低|行业第一|全国第一|唯一(?:选择|方案|答案|品牌|机构|平台)/g,
    guidance: "删除无法证明的绝对化排名，改为有依据、有限定条件的客观描述",
  },
  {
    id: "guaranteed-result",
    pattern: /保证(?:通过|获批|成功|有效|见效)|包过|稳赚不赔|零风险/g,
    guidance: "改为有条件、可核验的结果说明，并明确以实际审核或执行结果为准",
  },
  {
    id: "absolute-effect",
    pattern: /100\s*%\s*(?:有效|见效|成功|通过)|根治|无副作用/g,
    guidance: "删除无条件效果承诺，改为适用范围、限制条件和个体差异说明",
  },
  {
    id: "fabricated-experience",
    pattern:
      /编一个(?:真实)?经历|虚构(?:客户|用户|消费者|旅行|入住)?(?:评价|体验|案例|经历)|冒充(?:消费者|客户|亲历者)/g,
    guidance: "删除虚构经历或评价，只保留可验证事实并说明案例边界",
  },
  {
    id: "off-platform-diversion",
    pattern: /加(?:微信|V|vx)|扫码(?:联系|咨询|添加)|私信领取|留下?(?:手机号|电话)/gi,
    guidance: "删除站外导流表达，改为平台内合规咨询方式",
  },
]

const PLATFORM_PROFILES: Record<
  (typeof PLATFORM_COMPLIANCE_IDS)[number],
  PlatformComplianceProfile
> = {
  xiaohongshu: {
    guidance: [
      "不得伪造真实体验或隐瞒商业关系。",
      "避免夸大种草效果、站外导流和联系方式堆叠。",
    ],
  },
  douyin: {
    guidance: [
      "避免虚假夸张宣传、恶意蹭热点和危险行为引导。",
      "不得使用变体词规避审核，不做重复垃圾营销。",
    ],
  },
  weibo: {
    guidance: [
      "避免未经核实的爆料、谣言式断言和攻击引战。",
      "不得堆叠话题进行恶意营销，不附不安全链接。",
    ],
  },
  dianping: {
    guidance: [
      "禁止利益相关方伪装消费者或虚构消费经历。",
      "不得商业炒作、诱导好评、操纵评分或贬损其他商户。",
    ],
    rules: [
      {
        id: "dianping-review-manipulation",
        pattern: /五星好评(?:返现|送礼|换礼)|好评返现|诱导好评|刷好评/g,
        guidance: "删除诱导或操纵点评的内容，改为真实、独立的消费反馈说明",
      },
    ],
  },
  zhihu: {
    guidance: [
      "避免恶意营销导流、低质复制、伪造专业身份和不友善攻击。",
      "事实结论需可核验，观点与经验必须明确区分。",
    ],
  },
  ctrip: {
    guidance: [
      "不得虚构入住或旅行体验，不使用无法核验的价格与排名。",
      "标明行程信息的时间条件，避免过时信息和站外导流。",
    ],
  },
  netease: {
    guidance: [
      "按资讯内容标准核对事实、时间和来源。",
      "避免标题夸张、虚假新闻口吻和无依据行业结论。",
    ],
  },
  sohu: {
    guidance: [
      "按资讯内容标准核对事实、时间和来源。",
      "避免标题夸张、虚假新闻口吻和无依据行业结论。",
    ],
  },
}

function findingsForRules(text: string, rules: ArticleRiskRule[]): ArticleRiskFinding[] {
  const findings: ArticleRiskFinding[] = []
  for (const rule of rules) {
    const flags = rule.pattern.flags.includes("g")
      ? rule.pattern.flags
      : `${rule.pattern.flags}g`
    const pattern = new RegExp(rule.pattern.source, flags)
    for (const match of text.matchAll(pattern)) {
      findings.push({
        id: rule.id,
        severity: "block",
        match: match[0],
        guidance: rule.guidance,
      })
    }
  }
  return findings
}

export function getPlatformCompliancePrompt(platformId: string): string {
  const profile = PLATFORM_PROFILES[
    platformId as (typeof PLATFORM_COMPLIANCE_IDS)[number]
  ]
  const lines = ["通用合规要求：", ...COMMON_GUIDANCE.map((item) => `- ${item}`)]
  if (profile) {
    lines.push("平台专属要求：", ...profile.guidance.map((item) => `- ${item}`))
  }
  return lines.join("\n")
}

export function findArticleRisks(
  text: string,
  platformId: string,
): ArticleRiskFinding[] {
  const profile = PLATFORM_PROFILES[
    platformId as (typeof PLATFORM_COMPLIANCE_IDS)[number]
  ]
  return findingsForRules(text, [...COMMON_RULES, ...(profile?.rules ?? [])])
}

export function summarizeRiskFindings(findings: ArticleRiskFinding[]): string {
  return [...new Set(findings.map((finding) => finding.guidance))].join("；")
}

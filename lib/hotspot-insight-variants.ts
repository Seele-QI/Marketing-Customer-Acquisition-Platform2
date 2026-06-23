/**
 * 热点详情「文案区」默认简报：按本地日历日 + 标题等种子轮换表述，
 * 避免中间段落长期固定；同一天同一热点保持稳定，便于编辑与复制。
 */

export function getLocalDateKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function fnv1a32(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function pickIndex(seed: string, modulo: number): number {
  if (modulo <= 1) return 0
  return fnv1a32(seed) % modulo
}

const INTRO_VARIANTS = [
  `当前话题热度较高，适合围绕「信息增量」或「情绪共鸣」做短内容。动笔前先想清楚：读者点进来想带走什么——是快读摘要、一句态度，还是可讨论的问题。`,
  `这类热点更适合「短、准、有态度」：先判断受众是来看热闹、来求证，还是来找共鸣，再决定第一句落点。`,
  `流量窗口期里，内容越像「帮用户省时间」越容易起量：要么一句话说清发生了什么，要么给出一个清晰立场。`,
  `可先问自己三个问题：这件事的核心事实是什么？争议点在哪？普通人最可能关心的后果或启发是什么？`,
  `不必追求面面俱到：选一个切口（事实梳理 / 观点表态 / 生活向延伸），把信息密度做厚，比泛泛而谈更有效。`,
] as const

const ANGLE_BLOCK_VARIANTS = [
  `可参考下列角度择一深入（避免面面俱到）：
• 快讯摘要：用少量篇幅交代背景与要点；
• 观点短评：亮明立场，结尾留 1～2 个可互动的问题；
• 实用延伸：把话题与行业、生活或消费场景做轻量关联。`,
  `下面几种写法任选其一作为主结构：
• 三段式快读：背景 → 关键信息 → 一句话结论；
• 立场型短评：先表态，再给理由，最后用提问收束；
• 场景化联想：把公共话题落到具体人群/具体场景，降低理解成本。`,
  `切入时可参考：
• 「发生了什么」：用最短路径讲清时间线与核心事实；
• 「我怎么看」：给一个明确观点，并说明适用边界；
• 「和我有什么关系」：把讨论落到行动建议、风险提示或情绪共鸣。`,
  `结构建议（择一）：
• 信息向：列表化要点 + 一句提醒或总结；
• 评论向：观点先行 + 论据压缩 + 互动提问；
• 故事向：用一个微型场景引出观点，再回扣热点关键词。`,
  `可尝试的展开路径：
• 澄清型：辟谣/对齐认知，适合争议话题；
• 解读型：补充背景或制度/规则层面的解释；
• 清单型：给出「3 条观察」或「3 个注意点」，方便转发。`,
] as const

const CLOSING_VARIANTS = [
  `需要成稿时：点击右下角「一键爆改」，将结合标题与来源由 AI 生成可再编辑正文（体裁与语气随话题变化，不固定某一种平台腔调）。`,
  `若要直接出稿：点「一键爆改」，系统会基于标题与来源生成短内容，你可再按账号调性微调。`,
  `想快速得到可发版本：使用「一键爆改」生成段落化正文，Emoji 与文风由内容决定，不必强行套用固定模板。`,
] as const

function buildChannelBit(primaryLabel: string, channelSuffix: string): string {
  return channelSuffix
    ? `\n\n来源：${primaryLabel} · ${channelSuffix}。可结合该链路下的受众与语境，调整语气与举例。`
    : `\n\n来源：${primaryLabel}。可据此微调口吻、案例颗粒度与平台习惯。`
}

/** 与热点标题、来源拼接；中间分析段按日期与标题轮换 */
export function buildInsightArticleText(
  title: string,
  primaryLabel: string,
  channelSuffix: string,
  now: Date = new Date(),
): string {
  const day = getLocalDateKey(now)
  const seedBase = `${day}|${title}|${primaryLabel}|${channelSuffix}`
  const header = `【热点简报：${title}】${buildChannelBit(primaryLabel, channelSuffix)}`
  const intro = INTRO_VARIANTS[pickIndex(`${seedBase}:intro`, INTRO_VARIANTS.length)]
  const angles = ANGLE_BLOCK_VARIANTS[pickIndex(`${seedBase}:angles`, ANGLE_BLOCK_VARIANTS.length)]
  const closing = CLOSING_VARIANTS[pickIndex(`${seedBase}:close`, CLOSING_VARIANTS.length)]
  return `${header}\n\n${intro}\n\n${angles}\n\n${closing}`
}

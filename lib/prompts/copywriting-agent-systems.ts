/**
 * 文案创作工作台各智能体 System Prompt
 */
import { copywritingSkillSummary } from "@/lib/copywriting/skill-summary"

export const COPYWRITING_PURE_ORAL_RULES = `统一追加规则（适用于整个文案创作板块）：
1. 只输出可直接朗读的纯口播稿正文，不要输出说明、分析、创作思路、适用场景、总结、备注。
2. 严禁输出任何括号内容，包括圆括号、全角括号、方括号中的语气提示、动作提示、舞台提示、镜头提示、字幕提示。
3. 严禁出现「（语气放缓）」「（停顿）」「[镜头切换]」「[字幕强调]」等表达。
4. 严禁输出分镜、画面、字幕、时长、镜头调度、拍摄指令等非口播内容。
5. 若需要停顿或节奏变化，只能用自然口语、标点和换行表达。
6. 若用户要求多个版本，只能直接给多个口播版本正文；除版本标题外，不要添加额外说明。`

const COPYWRITING_AGENT_BASE_SYSTEM_MAP: Record<string, string> = {
  数字人口播文案: `你是「数字人口播文案」专家，专为实体店与短视频口播打造可直接对着镜头朗读的成稿。

定位：数字人口播、真人口播短视频获客。
输出：2-3 个不同角度的口播成稿，语言通俗直接，面向餐饮/装修/教育/美业等线下业态。

图片识别能力：当用户上传图片时（店铺环境照、产品图、菜单、门头照片等），请识别图中信息并融入脚本。`,

  图文视频混剪文案: `你是「图文视频混剪文案」专家，为图片轮播视频与多素材混剪视频撰写旁白口播稿。

定位：图文视频、视频混剪成片的配音文案。
输出：按素材段落组织的旁白成稿，转场自然、字幕友好，每次给 2 个版本（沉稳版/快节奏版）。

图片识别能力：当用户上传图片时（产品组图、活动海报、素材截图等），请识别图中信息并写入对应段落旁白。`,

  宣传视频文案创作: `你是「宣传视频文案创作」专家，面向品牌宣传与产品推广类短视频。只输出可对着镜头直接念的正文。

定位：宣传视频、品牌推广、产品种草。
输出：2-3 个不同语气版本（真诚/专业/活力），可按用户指定秒数控制字数密度。

图片识别能力：当用户上传图片时（产品图、品牌视觉、宣传片参考图等），请识别图片内容并融入宣传口播稿。`,

  爆款脚本二创: `你是「爆款脚本二创」专家，擅长基于参考脚本进行结构分析与原创改写。

定位：爆款逻辑保留、内容原创的二创口播稿。
输出：至少 2 个不同改写方向的成稿，可直接用于视频混剪配音。

图片识别能力：当用户上传参考视频截图或封面图时，请识别画面风格与内容信息，融入改写稿。`,
}

function appendPureOralRules(prompt: string): string {
  return `${prompt}\n\n${COPYWRITING_PURE_ORAL_RULES}`
}

/** 服务端流式 / 非流式共用：已知角色用专属提示，未知名称走兜底 */
export function resolveAgentSystemPrompt(agentName: string): string {
  const fixed = COPYWRITING_AGENT_BASE_SYSTEM_MAP[agentName]
  if (fixed) return appendPureOralRules(fixed)
  return appendPureOralRules(
    `你是「${agentName}」。请根据用户输入完成创作或改写，直接输出可朗读、可使用的口播成稿，贴合角色定位，少用套话。`,
  )
}

export function buildCopywritingEnrichedSystemPrompt({
  agentName,
  workflowKnowledge,
  memoryContext,
}: {
  agentName: string
  workflowKnowledge?: string
  memoryContext?: string
}): string {
  const skillExcerpt = copywritingSkillSummary(agentName)
  return [
    resolveAgentSystemPrompt(agentName),
    skillExcerpt,
    workflowKnowledge,
    memoryContext,
  ]
    .filter(Boolean)
    .join("\n\n---\n\n")
}

/**
 * 产品术语表 — 统一招财猫 / GEO / Skill / 智能体等说法
 */

export type GlossaryEntry = {
  term: string
  definition: string
  aliases?: string[]
}

export const TUTORIAL_GLOSSARY: GlossaryEntry[] = [
  {
    term: "招财猫 / AI超级中台",
    definition:
      "本产品的品牌名。侧边栏 Logo 显示「招财猫」，工作台 Banner 也称「AI超级中台」，指同一套软件。",
    aliases: ["招财猫", "AI超级中台", "中台"],
  },
  {
    term: "积分",
    definition:
      "使用 AI 对话、视频生成、GEO 生成等功能时消耗的额度。可在「充值兑换」用兑换码充值，流水可查。教程示例不扣积分。",
  },
  {
    term: "数字人口播视频",
    definition:
      "视频创作里的主流程：上传参考图与音色、写口播稿，AI 生成分镜后再合成竖屏口播成片。侧栏展示名与内部 key 可能略有差异，统一称「数字人口播」。",
    aliases: ["数字人视频创作（新）", "数字人口播视频（新）", "DH V2"],
  },
  {
    term: "文案智能体",
    definition:
      "文案创作下的四个分身：数字人口播文案、图文视频混剪文案、宣传视频文案创作、爆款脚本二创。写完稿可一键跳到对应视频流程。",
  },
  {
    term: "团队智能体",
    definition:
      "智能体中心 / 工作台卡片里的顾问角色（如查理·芒格等），走通用对话，适合策略与咨询，不直接生成视频。",
  },
  {
    term: "GEO",
    definition:
      "Generative Engine Optimization（生成式引擎优化）。帮助企业内容更容易被 DeepSeek、豆包、通义等 AI 搜索引擎引用。本产品含知识库、内容矩阵、深度文章三块。",
    aliases: ["GEO优化", "生成式引擎优化"],
  },
  {
    term: "企业 Skill",
    definition:
      "GEO 知识库根据企业实体与文档生成的结构化「写作技能包」，供矩阵规划与文章创作引用，保证品牌口径一致。",
    aliases: ["Enterprise Skill", "C 层知识库"],
  },
  {
    term: "内容矩阵",
    definition:
      "按两周 × 多平台排布的选题格子。每格含标题方向、GEO 意图与提示词，可批量生成深度文章。",
  },
  {
    term: "已保存示例 / 演示模式",
    definition:
      "教程提供的只读样例。可浏览输入、中间步骤与最终结果，不调用 AI、不生成视频、不扣积分。退出后不影响你的真实草稿。",
  },
  {
    term: "任务绿点",
    definition:
      "侧栏某功能旁出现绿色圆点，表示该模块有后台任务进行中（如视频合成）。完成后会 Toast 提示，可在「历史记录」查看。",
  },
]

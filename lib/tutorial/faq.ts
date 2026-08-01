/**
 * 教程中心 FAQ
 */

export type TutorialFaqItem = {
  id: string
  question: string
  answer: string
  tags?: string[]
}

export const TUTORIAL_FAQ: TutorialFaqItem[] = [
  {
    id: "cost-free",
    question: "看教程会不会扣积分？",
    answer:
      "不会。教程中的「查看已保存示例」全部是本地静态样例，不调用 AI、不提交视频任务、不扣积分。只有你在真实工作区点击生成时才会计费。",
    tags: ["积分", "演示"],
  },
  {
    id: "pollute-data",
    question: "示例会不会弄乱我自己的草稿？",
    answer:
      "不会。教程进度单独保存在本机，示例通过只读面板展示，不会写入你的工作流草稿、视频历史或身份定位会话。",
    tags: ["数据", "草稿"],
  },
  {
    id: "where-start",
    question: "第一次用应该从哪开始？",
    answer:
      "建议按主学习路径：工作台总览 → 身份定位 → 文案创作 → 数字人口播 → 历史记录。每步约 2–5 分钟，可随时暂停。",
    tags: ["入门"],
  },
  {
    id: "login-required",
    question: "必须登录才能看教程吗？",
    answer:
      "浏览教程中心与已保存示例不强制登录。真实生成（对话、视频、GEO）需要登录并具备足够积分。",
    tags: ["登录"],
  },
  {
    id: "geo-what",
    question: "GEO 优化是做什么的？",
    answer:
      "GEO（生成式引擎优化）帮助你的品牌内容更容易被 AI 搜索引擎引用。流程通常是：搭企业知识库 → 规划两周内容矩阵 → 批量生成深度文章。",
    tags: ["GEO"],
  },
  {
    id: "agents-diff",
    question: "文案创作和智能体中心有什么区别？",
    answer:
      "文案创作侧重短视频脚本与可跳转成片的四个分身；智能体中心是策略顾问团队，适合定位、经营与咨询类对话。",
    tags: ["智能体", "文案"],
  },
  {
    id: "video-which",
    question: "四种视频创作怎么选？",
    answer:
      "数字人口播：真人/数字人口型竖屏；图文视频：多图 + 旁白；视频混剪：多段素材拼接；宣传视频：产品分镜 → 成片，适合电商/品牌片。",
    tags: ["视频"],
  },
  {
    id: "replay",
    question: "教程可以重复看吗？",
    answer:
      "可以。在教程中心点任意模块的「重新学习」或「查看已保存示例」即可重播，已完成标记可保留作进度参考。",
    tags: ["进度"],
  },
]

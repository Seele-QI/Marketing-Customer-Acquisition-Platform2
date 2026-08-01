import type { OperationGuide } from "@/lib/business-assistant/types"
import { GEO_VIEWS } from "@/lib/geo/workspace"
import { VIDEO_VIEWS } from "@/lib/video/workspace"

const commonVideoIssues = [
  {
    problem: "生成按钮不可用",
    solution: "先检查必填文案、素材数量和音色是否全部准备完成。",
  },
  {
    problem: "生成后暂时没有结果",
    solution: "视频任务会在后台运行，可切换页面，稍后到历史记录查看。",
  },
] as const

const commonGeoIssues = [
  {
    problem: "无法进入下一步",
    solution: "先补齐当前步骤的必填字段；上传资料不是所有步骤的强制条件。",
  },
  {
    problem: "生成内容与企业不符",
    solution: "返回企业知识库补充品牌、产品、受众和事实资料后重新生成。",
  },
] as const

const GUIDES: readonly OperationGuide[] = [
  {
    id: "guide-dh-video-v2",
    assistantId: "video-creation",
    view: VIDEO_VIEWS.DH_VIDEO_V2,
    title: "数字人口播视频操作指南",
    purpose: "用参考形象、音色和口播文案生成分段数字人口播成片。",
    preparation: ["清晰正脸参考图", "可用音色或音频样本", "完整口播文案"],
    steps: [
      {
        id: "dh-v2-compose",
        title: "填写口播内容与创意",
        instruction: "先确认视频用途，再填写口播文案和希望呈现的画面风格。",
        completionCriteria: "口播文案完整，创意描述能够说明人物、场景和镜头氛围。",
        highlightTarget: "dh-v2-compose",
      },
      {
        id: "dh-v2-plan",
        title: "生成并检查分镜",
        instruction: "让系统把长文案拆成分镜，逐段检查文案与画面描述。",
        completionCriteria: "每个分镜都有可朗读文案，并且顺序符合口播逻辑。",
        highlightTarget: "dh-v2-script-plan",
      },
      {
        id: "dh-v2-submit",
        title: "确认后生成视频",
        instruction: "核对预计积分、素材和分镜，再由你点击真实生成按钮。",
        completionCriteria: "页面出现运行中的任务编号或进度。",
        highlightTarget: "dh-v2-compose",
        completionProbe: "runtime-running",
      },
    ],
    commonIssues: commonVideoIssues,
  },
  {
    id: "guide-dh-video-economy",
    assistantId: "video-creation",
    view: VIDEO_VIEWS.DH_VIDEO_ECONOMY,
    title: "经济版数字人操作指南",
    purpose: "用较简化的素材与配置快速完成一条数字人口播视频。",
    preparation: ["人物图片", "口播文案", "声音样本"],
    steps: [
      {
        id: "economy-materials",
        title: "准备人物与声音",
        instruction: "上传清晰人物图和干净的声音样本，避免背景噪音。",
        completionCriteria: "人物图和声音样本均显示为已选择。",
        highlightTarget: "dh-economy-workflow",
      },
      {
        id: "economy-script",
        title: "填写并检查文案",
        instruction: "文案尽量使用自然短句，避免一段过长。",
        completionCriteria: "文案无空段，时长和表达符合投放场景。",
        highlightTarget: "dh-economy-workflow",
      },
      {
        id: "economy-submit",
        title: "确认生成",
        instruction: "检查素材和积分说明后，由你点击生成。",
        completionCriteria: "页面显示任务正在处理中。",
        highlightTarget: "dh-economy-workflow",
        completionProbe: "runtime-running",
      },
    ],
    commonIssues: commonVideoIssues,
  },
  {
    id: "guide-image-video",
    assistantId: "video-creation",
    view: VIDEO_VIEWS.IMAGE_VIDEO,
    title: "图文视频操作指南",
    purpose: "把多张图片、旁白和音色合成为带字幕与配乐的图文视频。",
    preparation: ["至少 7 张清晰图片", "旁白文案", "音色样本"],
    steps: [
      {
        id: "image-materials",
        title: "上传并排序图片",
        instruction: "按成片出现顺序上传图片，删除重复或低清素材。",
        completionCriteria: "至少 7 张图片，顺序与旁白内容一致。",
        highlightTarget: "image-video-workflow",
      },
      {
        id: "image-voice",
        title: "设置旁白与声音",
        instruction: "填写旁白并选择声音，确认文本与图片节奏匹配。",
        completionCriteria: "旁白和音色均已填写，文案没有明显错字。",
        highlightTarget: "image-video-workflow",
      },
      {
        id: "image-submit",
        title: "生成图文视频",
        instruction: "确认素材数量和积分后，由你提交生成。",
        completionCriteria: "任务进入后台运行状态。",
        highlightTarget: "image-video-workflow",
        completionProbe: "runtime-running",
      },
    ],
    commonIssues: commonVideoIssues,
  },
  {
    id: "guide-mashup",
    assistantId: "video-creation",
    view: VIDEO_VIEWS.MASHUP,
    title: "视频混剪操作指南",
    purpose: "把多段视频素材按统一旁白、字幕和节奏重新混剪成片。",
    preparation: ["至少 5 段视频", "完整旁白文案", "音色样本"],
    steps: [
      {
        id: "mashup-materials",
        title: "上传视频素材",
        instruction: "选择画面清晰、主题一致的视频片段并检查顺序。",
        completionCriteria: "至少 5 段素材且都能正常预览。",
        highlightTarget: "mashup-workflow",
      },
      {
        id: "mashup-script",
        title: "设置旁白与剪辑要求",
        instruction: "填写旁白，选择音色，并确认字幕与配乐偏好。",
        completionCriteria: "旁白、音色和必要剪辑设置已完成。",
        highlightTarget: "mashup-workflow",
      },
      {
        id: "mashup-submit",
        title: "提交混剪",
        instruction: "确认预计积分后由你点击生成。",
        completionCriteria: "任务状态显示为处理中。",
        highlightTarget: "mashup-workflow",
        completionProbe: "runtime-running",
      },
    ],
    commonIssues: commonVideoIssues,
  },
  {
    id: "guide-promo",
    assistantId: "video-creation",
    view: VIDEO_VIEWS.PROMO,
    title: "宣传视频操作指南",
    purpose: "从产品资料和卖点生成分镜、画面提示词与宣传成片。",
    preparation: ["产品图片或清晰描述", "核心卖点", "目标受众与时长"],
    steps: [
      {
        id: "promo-brief",
        title: "填写产品简报",
        instruction: "说明产品、受众、核心卖点和期望的视觉风格。",
        completionCriteria: "简报能回答卖什么、卖给谁、为什么购买。",
        highlightTarget: "promo-video-workflow",
      },
      {
        id: "promo-storyboard",
        title: "生成并选择分镜",
        instruction: "检查每个镜头是否服务于同一个卖点和行动目标。",
        completionCriteria: "分镜顺序完整，已确认使用的画面方案。",
        highlightTarget: "promo-video-workflow",
      },
      {
        id: "promo-submit",
        title: "生成宣传成片",
        instruction: "核对时长、分辨率和积分后，由你提交生成。",
        completionCriteria: "成片任务进入运行状态。",
        highlightTarget: "promo-video-workflow",
        completionProbe: "runtime-running",
      },
    ],
    commonIssues: commonVideoIssues,
  },
  {
    id: "guide-video-history",
    assistantId: "video-creation",
    view: VIDEO_VIEWS.HISTORY,
    title: "视频历史记录指南",
    purpose: "集中查看视频任务、生成结果、失败原因和可下载成片。",
    preparation: ["已提交过至少一个视频任务，或等待当前任务完成"],
    steps: [
      {
        id: "history-filter",
        title: "找到对应任务",
        instruction: "根据来源、时间和状态找到刚才提交的视频任务。",
        completionCriteria: "能够确认任务类型和当前状态。",
        highlightTarget: "video-history-view",
      },
      {
        id: "history-result",
        title: "检查并下载结果",
        instruction: "任务成功后预览画面、声音和字幕，再下载成片。",
        completionCriteria: "成片预览正常并已按需下载。",
        highlightTarget: "video-history-view",
        completionProbe: "runtime-success",
      },
    ],
    commonIssues: commonVideoIssues,
  },
  {
    id: "guide-geo-knowledge",
    assistantId: "geo-growth",
    view: GEO_VIEWS.KNOWLEDGE_BASE,
    title: "企业知识库操作指南",
    purpose: "把企业资料整理成后续内容矩阵和文章都能复用的事实知识库。",
    preparation: ["企业基础信息", "产品与服务资料", "可选 PDF、DOCX、TXT 或 MD"],
    steps: [
      {
        id: "geo-knowledge-upload",
        title: "导入企业资料",
        instruction: "上传已有资料；没有文件也可以跳过并手动填写。",
        completionCriteria: "资料已上传完成，或已明确选择手动填写。",
        highlightTarget: "geo-knowledge-upload",
      },
      {
        id: "geo-knowledge-entity",
        title: "确认企业实体",
        instruction: "检查品牌、产品、受众和联系方式，修正自动提取错误。",
        completionCriteria: "核心企业事实完整且没有明显冲突。",
        highlightTarget: "geo-knowledge-entity",
      },
      {
        id: "geo-knowledge-generate",
        title: "预览并生成知识库",
        instruction: "确认知识库名称和事实摘要后，由你点击生成。",
        completionCriteria: "已生成知识库出现在保存列表中。",
        highlightTarget: "geo-knowledge-review",
      },
    ],
    commonIssues: commonGeoIssues,
  },
  {
    id: "guide-geo-matrix",
    assistantId: "geo-growth",
    view: GEO_VIEWS.CONTENT_MATRIX,
    title: "内容矩阵操作指南",
    purpose: "根据企业知识、平台与内容策略生成两周选题矩阵。",
    preparation: ["已保存的企业知识库", "目标发布平台", "内容目标与受众"],
    steps: [
      {
        id: "geo-matrix-config",
        title: "配置矩阵项目",
        instruction: "选择知识库、平台和内容策略，明确两周内容目标。",
        completionCriteria: "知识库、平台与核心策略均已选择。",
        highlightTarget: "geo-matrix-config",
      },
      {
        id: "geo-matrix-generate",
        title: "生成两周矩阵",
        instruction: "核对预计生成量与积分，再由你点击生成。",
        completionCriteria: "页面出现按平台和日期排列的矩阵格子。",
        highlightTarget: "geo-matrix-generate",
      },
      {
        id: "geo-matrix-review",
        title: "检查并调整选题",
        instruction: "检查重复标题、意图覆盖和平台适配，逐格修正。",
        completionCriteria: "矩阵选题不重复，且覆盖主要用户问题。",
        highlightTarget: "geo-matrix-view",
      },
    ],
    commonIssues: commonGeoIssues,
  },
  {
    id: "guide-geo-article",
    assistantId: "geo-growth",
    view: GEO_VIEWS.ARTICLE_EDITOR,
    title: "GEO 文章操作指南",
    purpose: "从矩阵选题生成结构清晰、事实可靠并适合 AI 引用的文章。",
    preparation: ["已生成的内容矩阵", "对应企业知识库", "待写选题与平台"],
    steps: [
      {
        id: "geo-article-select",
        title: "选择文章来源",
        instruction: "选择矩阵项目和待生成选题，确认生成数量。",
        completionCriteria: "至少选择一个有效选题和对应知识库。",
        highlightTarget: "geo-article-config",
      },
      {
        id: "geo-article-generate",
        title: "生成文章",
        instruction: "核对平台、模型档位和积分后，由你提交生成。",
        completionCriteria: "文章卡片出现正文或生成中的状态。",
        highlightTarget: "geo-article-generate",
      },
      {
        id: "geo-article-score",
        title: "评分并优化",
        instruction: "检查事实、结构和 GEO 评分，优先修正低分项。",
        completionCriteria: "正文已校对，评分结果和优化方向清晰。",
        highlightTarget: "geo-article-view",
      },
    ],
    commonIssues: commonGeoIssues,
  },
] as const

const GUIDE_BY_VIEW = new Map(GUIDES.map((guide) => [guide.view, guide]))

export function listOperationGuides(): readonly OperationGuide[] {
  return GUIDES
}

export function resolveOperationGuide(view: string): OperationGuide | undefined {
  return GUIDE_BY_VIEW.get(view)
}

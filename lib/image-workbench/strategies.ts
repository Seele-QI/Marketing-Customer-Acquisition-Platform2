export const POSTER_TEMPLATES = [
  "品牌宣传",
  "活动促销",
  "新品发布",
  "知识海报",
] as const

export const GENERAL_IMAGE_TEMPLATES = [
  "电商主图",
  "人物写真",
  "场景设计",
  "社媒配图",
  "自由创作",
] as const

export const IMAGE_WORKBENCH_STRATEGIES = {
  poster: {
    label: "海报图创作",
    description: "结构化文案与商业版式海报",
    billingScene: "poster_image",
    maxReferences: 2,
    templates: POSTER_TEMPLATES,
  },
  image: {
    label: "图片创作",
    description: "自由描述与多参考图创作",
    billingScene: "image_creation",
    maxReferences: 4,
    templates: GENERAL_IMAGE_TEMPLATES,
  },
} as const

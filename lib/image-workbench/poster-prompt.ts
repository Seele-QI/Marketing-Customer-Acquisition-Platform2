import type {
  ImageAspectRatio,
  ImageOrientation,
  ReferenceRole,
} from "@/lib/image-workbench/types"

const TEMPLATE_INSTRUCTIONS: Record<string, string> = {
  品牌宣传: "突出品牌气质、核心价值和可信赖感，版式克制专业。",
  活动促销: "突出活动利益点和行动号召，视觉醒目但不杂乱。",
  新品发布: "突出新品主体、质感和上市信息，营造发布感与期待感。",
  知识海报: "突出信息层级与阅读顺序，适合知识要点传播。",
}

export type PosterWorkbenchPromptInput = {
  template: string
  purpose: string
  headline: string
  body: string
  creativeDirection?: string
  style: string
  aspectRatio: ImageAspectRatio
  orientation: ImageOrientation
  referenceRoles: ReferenceRole[]
}

export function buildPosterWorkbenchPrompt(
  input: PosterWorkbenchPromptInput,
): string {
  const orientationLabel =
    input.aspectRatio === "1:1"
      ? "方形构图"
      : input.orientation === "landscape"
        ? "横屏构图"
        : "竖屏构图"
  const referenceInstructions = input.referenceRoles.map((role, index) =>
    role === "subject"
      ? `第 ${index + 1} 张参考图是商品或主体图，请保持核心主体的外观、比例和辨识特征。`
      : `第 ${index + 1} 张参考图是风格参考图，只参考配色、材质、光影和版式氛围，不要复制参考图中的文字、标志或品牌。`,
  )

  return [
    "请生成一张可直接用于商业传播的高质量中文海报。",
    `海报模板：${input.template}`,
    TEMPLATE_INSTRUCTIONS[input.template] ?? TEMPLATE_INSTRUCTIONS.品牌宣传,
    `用途：${input.purpose.trim() || "品牌宣传"}`,
    `主标题：${input.headline.trim()}`,
    input.body.trim() ? `辅助文案：${input.body.trim()}` : "",
    input.creativeDirection?.trim()
      ? `画面创意：${input.creativeDirection.trim()}`
      : "",
    `视觉风格：${input.style.trim() || "高级简约"}`,
    `画面比例：${input.aspectRatio}，${orientationLabel}。`,
    ...referenceInstructions,
    "要求：主标题醒目、中文文字准确、信息层级清晰、留白合理、无水印、无二维码、无虚构品牌标志。",
  ]
    .filter(Boolean)
    .join("\n")
}

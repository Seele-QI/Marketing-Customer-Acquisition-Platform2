import type {
  ImageAspectRatio,
  ImageOrientation,
  ReferenceMode,
} from "@/lib/image-workbench/types"

const TEMPLATE_INSTRUCTIONS: Record<string, string> = {
  电商主图: "以商品为绝对视觉主体，使用干净商业背景、精致材质和受控棚拍光影。",
  人物写真: "呈现自然肤质、准确五官、摄影级光影和真实摄影质感。",
  场景设计: "重视空间结构、尺度关系、材质细节、环境光和氛围一致性。",
  社媒配图: "建立明确视觉焦点，兼顾移动端识别、构图留白和传播吸引力。",
  自由创作: "遵循描述自由创作，保证画面完整、细节清晰和视觉统一。",
}

const REFERENCE_INSTRUCTIONS: Record<ReferenceMode, string> = {
  preserve_subject:
    "保持参考图中的人物、商品或主体身份特征，允许调整背景、姿态、光线和构图。",
  style_only:
    "只参考参考图的色彩、材质、光影和视觉语言，不复制其中的主体、文字、标志或品牌。",
  remix:
    "综合参考图片中的主体与视觉风格进行重新创作，允许明显调整场景和构图，但保持画面逻辑一致。",
}

export type GeneralImagePromptInput = {
  template: string
  description: string
  requirements: string
  aspectRatio: ImageAspectRatio
  orientation: ImageOrientation
  referenceMode: ReferenceMode
  referenceCount: number
}

export function buildGeneralImagePrompt(input: GeneralImagePromptInput): string {
  const orientationLabel =
    input.aspectRatio === "1:1"
      ? "方形构图"
      : input.orientation === "landscape"
        ? "横屏构图"
        : "竖屏构图"

  return [
    "请生成一张高质量图片。",
    `创作模板：${input.template}`,
    TEMPLATE_INSTRUCTIONS[input.template] ?? TEMPLATE_INSTRUCTIONS.自由创作,
    `画面描述：${input.description.trim()}`,
    input.requirements.trim() ? `补充要求：${input.requirements.trim()}` : "",
    `画面比例：${input.aspectRatio}，${orientationLabel}。`,
    input.referenceCount > 0 ? REFERENCE_INSTRUCTIONS[input.referenceMode] : "",
    "要求：主体完整、结构自然、光影统一、细节清晰、无水印、无二维码、无无关文字或标志。",
  ]
    .filter(Boolean)
    .join("\n")
}

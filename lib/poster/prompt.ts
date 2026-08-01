import type { PosterAspectRatio, PosterOrientation } from "@/lib/poster/types"

export type PosterPromptInput = {
  purpose: string
  headline: string
  body: string
  style: string
  aspectRatio: PosterAspectRatio
  orientation: PosterOrientation
}

export function buildPosterPrompt(input: PosterPromptInput): string {
  const orientationLabel =
    input.aspectRatio === "1:1" ? "方形构图" : input.orientation === "landscape" ? "横屏构图" : "竖屏构图"

  return [
    "请生成一张可直接用于商业营销的中文海报图。",
    `用途：${input.purpose.trim() || "品牌宣传"}`,
    `主标题：${input.headline.trim()}`,
    input.body.trim() ? `辅助文案：${input.body.trim()}` : "",
    `视觉风格：${input.style.trim() || "高级简约"}`,
    `画面比例：${input.aspectRatio}，${orientationLabel}。`,
    "要求：主标题醒目、中文文字准确、信息层级清晰、留白合理、无水印、无二维码、无虚构品牌标志。",
  ]
    .filter(Boolean)
    .join("\n")
}

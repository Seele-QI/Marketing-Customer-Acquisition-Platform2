/** Seedance 2.0 提示词辅助 — 系统提示与用户消息构建 */

export type DhV2PromptMode = "direct" | "storyboard"

export type DhV2AutoPromptRequest = {
  script: string
  duration: 15 | 30 | 45
  image_count: number
  mode: DhV2PromptMode
  visual_style?: string
  has_audio_ref?: boolean
}

export const DH_V2_SEEDANCE_PROMPT_SYSTEM = `你是一位精通 Seedance 2.0 的 AI 视频导演与提示词工程师。

请根据用户口播文案、时长与参考图数量，生成可直接用于 Seedance 2.0 的视频生成提示词。

写作规范（六步公式）：
1. 主体：具体人物外观与状态（若有多张参考图，用 Image1、Image2… 或 @图1、@图2 引用）
2. 动作：具体动词，量化强度，口播/表情/手势与文案节奏一致
3. 环境：场景、光线、氛围
4. 镜头：仅写一个主运镜（如 slow push-in、orbit、tracking shot），与主体动作分开描述
5. 风格：电影感、纪录片、商业广告等具体影像风格
6. 约束：用正向表述（stable composition, sharp focus），避免负面提示词

多模态引用：
- 参考图用 Image1~ImageN 或 @图N
- 有音频参考时注明 @音频1 驱动口型节奏

时长规则：
- 15 秒：核心描述 60~100 字，一条连贯镜头叙事
- 30/45 秒：必须输出【时间轴】分段，例如：
  【风格】…
  【时间轴】0-15s：…；15-30s：…（30s）或再加 30-45s（45s）
  【参考】Image1 人物外观…
  【约束】stable composition, sharp focus

直接输出提示词正文，不要解释、不要 markdown 代码块。`

export function buildDhV2AutoPromptUserMessage(req: DhV2AutoPromptRequest): string {
  const refs = Array.from({ length: Math.max(1, req.image_count) }, (_, i) => `Image${i + 1}`).join(
    ", ",
  )
  const lines = [
    `口播文案：${req.script.trim()}`,
    `目标时长：${req.duration} 秒`,
    `参考图数量：${req.image_count} 张（${refs}）`,
    `创作路径：${req.mode === "storyboard" ? "分镜选帧后成片" : "参考图直出（首帧/多模态）"}`,
  ]
  if (req.visual_style?.trim()) {
    lines.push(`画面风格：${req.visual_style.trim()}`)
  }
  if (req.has_audio_ref) {
    lines.push("已上传参考音频：是，请在提示词中注明 @音频1 与口型节奏")
  }
  if (req.duration > 15) {
    lines.push(`请按 ${req.duration} 秒输出【时间轴】分段提示词。`)
  }
  lines.push("请生成 Seedance 2.0 视频提示词。")
  return lines.join("\n")
}

/** Python 侧同步使用的系统提示（与 TS 保持一致） */
export const DH_V2_SEEDANCE_PROMPT_SYSTEM_PY = DH_V2_SEEDANCE_PROMPT_SYSTEM

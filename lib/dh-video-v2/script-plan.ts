/** 数字人视频创作（新）— 脚本字数评估与确定性拆段 */

export const DH_V2_CHARS_PER_SEC_MIN = 2.8
export const DH_V2_CHARS_PER_SEC_MAX = 3.3
export const DH_V2_CHARS_PER_SEC_PLAN = 3.0
export const DH_V2_SEGMENT_SEC = 15

export type DhV2SegmentPlan = {
  index: number
  time_range: string
  dialogue: string
  shot_details: string
  video_prompt: string
}

export type DhV2ScriptPlan = {
  char_count: number
  duration_min: number
  duration_max: number
  plan_duration: number
  segment_count: number
  segments: DhV2SegmentPlan[]
}

export type DhV2DurationAssessment = {
  char_count: number
  duration_min: number
  duration_max: number
  plan_duration: number
  segment_count: number
}

/** 口播字数：去掉空白 */
export function countScriptChars(script: string): number {
  return script.replace(/\s/g, "").length
}

function round1(n: number): number {
  return Math.round(n * 10) / 10
}

/** 评估时长区间与计划段数（不调 API） */
export function assessScriptDuration(script: string): DhV2DurationAssessment {
  const char_count = countScriptChars(script)
  if (char_count === 0) {
    return {
      char_count: 0,
      duration_min: 0,
      duration_max: 0,
      plan_duration: 0,
      segment_count: 0,
    }
  }
  const duration_min = round1(char_count / DH_V2_CHARS_PER_SEC_MAX)
  const duration_max = round1(char_count / DH_V2_CHARS_PER_SEC_MIN)
  const plan_duration = Math.max(
    DH_V2_SEGMENT_SEC,
    Math.ceil(char_count / DH_V2_CHARS_PER_SEC_PLAN / DH_V2_SEGMENT_SEC) * DH_V2_SEGMENT_SEC,
  )
  const segment_count = plan_duration / DH_V2_SEGMENT_SEC
  return { char_count, duration_min, duration_max, plan_duration, segment_count }
}

const BREAK_RE = /[。！？；\n]/

/** 确定性台词切分，保持原文顺序 */
export function splitScriptIntoSegments(script: string, segmentCount: number): string[] {
  const text = script.trim()
  if (!text || segmentCount <= 0) return []
  if (segmentCount === 1) return [text]

  const totalChars = countScriptChars(text)
  const boundaries: number[] = []
  for (let i = 1; i < segmentCount; i++) {
    boundaries.push(Math.ceil((totalChars * i) / segmentCount))
  }

  const segments: string[] = []
  let buf = ""
  let charSeen = 0
  let boundaryIdx = 0

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    buf += ch
    if (!/\s/.test(ch)) charSeen++

    if (boundaryIdx < boundaries.length && charSeen >= boundaries[boundaryIdx]) {
      let cut = buf.length
      for (let j = buf.length - 1; j >= Math.max(0, buf.length - 24); j--) {
        if (BREAK_RE.test(buf[j])) {
          cut = j + 1
          break
        }
      }
      const piece = buf.slice(0, cut).trim()
      if (piece) segments.push(piece)
      buf = buf.slice(cut)
      charSeen = countScriptChars(buf)
      boundaryIdx++
    }
  }

  const tail = buf.trim()
  if (tail) segments.push(tail)

  while (segments.length < segmentCount) {
    segments.push("")
  }
  return segments.slice(0, segmentCount)
}

export function formatSegmentTimeRange(index: number): string {
  const start = index * DH_V2_SEGMENT_SEC
  const end = start + DH_V2_SEGMENT_SEC
  return `${start}-${end}s`
}

/** 构建空壳分镜计划（台词已切分，待 AI 填充 prompt/细节） */
export function buildScriptPlanSkeleton(script: string): DhV2ScriptPlan {
  const assessment = assessScriptDuration(script)
  const dialogues = splitScriptIntoSegments(script, assessment.segment_count)
  const segments: DhV2SegmentPlan[] = dialogues.map((dialogue, index) => ({
    index,
    time_range: formatSegmentTimeRange(index),
    dialogue,
    shot_details: "",
    video_prompt: "",
  }))
  return { ...assessment, segments }
}

/** 合并 AI 返回的段内容，台词始终以确定性切片为准 */
export function mergeAiSegmentsIntoPlan(
  skeleton: DhV2ScriptPlan,
  aiSegments: Array<{ shot_details?: string; video_prompt?: string }>,
): DhV2ScriptPlan {
  const segments = skeleton.segments.map((seg, i) => {
    const ai = aiSegments[i] || {}
    return {
      ...seg,
      dialogue: seg.dialogue,
      shot_details: String(ai.shot_details ?? "").trim(),
      video_prompt: String(ai.video_prompt ?? "").trim(),
    }
  })
  return { ...skeleton, segments }
}

/** DeepSeek 不可用时的本地模板兜底 */
export function buildLocalScriptPlan(
  script: string,
  creativeIdea: string,
  hasAudioRef: boolean,
): DhV2ScriptPlan {
  const skeleton = buildScriptPlanSkeleton(script)
  const idea = creativeIdea.trim() || "电影感数字人口播，竖屏专业访谈风格"
  const segments = skeleton.segments.map((seg) => {
    const dlg = seg.dialogue.replace(/\n/g, " ")
    const cont =
      skeleton.segment_count > 1 && seg.index > 0 ? "画面承接上一段，服装场景一致。" : ""
    const shot_details = `${idea}，人物半身出镜看镜头，柔和面光，背景简洁。${cont}本段口播：${dlg.slice(0, 40)}`
    const audioBit = hasAudioRef ? " @音频1 驱动口型，" : ""
    const video_prompt = [
      `【风格】${idea}`,
      `【时间轴】0-15s：@图1 正面口播，${dlg.slice(0, 50)}${audioBit}镜头 slow push-in`,
      "【约束】stable composition, sharp focus",
      skeleton.segment_count > 1
        ? `（第 ${seg.index + 1}/${skeleton.segment_count} 段，15 秒）`
        : "",
    ].join("\n")
    return { ...seg, shot_details, video_prompt }
  })
  return { ...skeleton, segments }
}

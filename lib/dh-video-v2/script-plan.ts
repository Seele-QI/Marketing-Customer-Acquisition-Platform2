/** 数字人视频创作（新）— 脚本字数评估与确定性拆段 */

export const DH_V2_CHARS_PER_SEC_MIN = 3.3
export const DH_V2_CHARS_PER_SEC_MAX = 3.6
export const DH_V2_CHARS_PER_SEC_PLAN = 3.45
export const DH_V2_SEGMENT_SEC = 15
/** 每段 15s 台词字数下限：ceil(3.3 × 15) */
export const DH_V2_DIALOGUE_CHARS_MIN = 50
/** 每段 15s 台词字数上限：floor(3.6 × 15) */
export const DH_V2_DIALOGUE_CHARS_MAX = 54

/** 口播有效字：排除空白、标点与符号 */
const NON_DIALOGUE_CHAR_RE = /[\s\p{P}\p{S}]/u

export type DhV2DialogueValidation = "ok" | "too_short" | "too_long" | "empty"

export type DhV2SegmentPlan = {
  index: number
  time_range: string
  dialogue: string
  shot_details: string
  video_prompt: string
  dialogue_warning?: DhV2DialogueValidation
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

/** 口播字数：去掉空白、标点、符号 */
export function countScriptChars(script: string): number {
  let n = 0
  for (const ch of script) {
    if (!NON_DIALOGUE_CHAR_RE.test(ch)) n++
  }
  return n
}

/** 单段台词字数（不计空白/标点） */
export function countSegmentDialogueChars(dialogue: string): number {
  return countScriptChars(dialogue)
}

export function hasSegmentDialogue(dialogue: string): boolean {
  return countSegmentDialogueChars(dialogue) > 0
}

export function validateSegmentDialogue(dialogue: string): DhV2DialogueValidation {
  const n = countSegmentDialogueChars(dialogue)
  if (n === 0) return "empty"
  if (n < DH_V2_DIALOGUE_CHARS_MIN) return "too_short"
  if (n > DH_V2_DIALOGUE_CHARS_MAX) return "too_long"
  return "ok"
}

/** 仅保留有台词的段 */
export function filterActiveSegments<T extends { dialogue: string }>(segments: T[]): T[] {
  return segments.filter((s) => hasSegmentDialogue(s.dialogue))
}

/** 重排 index 与 time_range（过滤空段后） */
export function reindexSegments(segments: DhV2SegmentPlan[]): DhV2SegmentPlan[] {
  return segments.map((seg, index) => ({
    ...seg,
    index,
    time_range: formatSegmentTimeRange(index),
    dialogue_warning: validateSegmentDialogue(seg.dialogue),
  }))
}

/** 为每段附加 dialogue_warning */
export function annotateDialogueWarnings(segments: DhV2SegmentPlan[]): DhV2SegmentPlan[] {
  return segments.map((seg) => ({
    ...seg,
    dialogue_warning: validateSegmentDialogue(seg.dialogue),
  }))
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
  const segment_count = Math.max(1, Math.ceil(char_count / DH_V2_DIALOGUE_CHARS_MAX))
  const plan_duration = segment_count * DH_V2_SEGMENT_SEC
  return { char_count, duration_min, duration_max, plan_duration, segment_count }
}

const SENTENCE_BREAK_RE = /(?<=[。！？；\n])/
const SOFT_BREAK_RE = /[，、]/

/** 将文案拆成带标点保留的句子/短语单元 */
function splitIntoSentenceUnits(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const raw = trimmed.split(SENTENCE_BREAK_RE).filter((s) => s.trim())
  const units: string[] = []
  for (const unit of raw) {
    const u = unit.trim()
    if (!u) continue
    if (countScriptChars(u) <= DH_V2_DIALOGUE_CHARS_MAX) {
      units.push(u)
      continue
    }
    let buf = ""
    for (const ch of u) {
      buf += ch
      if (SOFT_BREAK_RE.test(ch) && countScriptChars(buf) >= DH_V2_DIALOGUE_CHARS_MIN) {
        units.push(buf.trim())
        buf = ""
      }
    }
    const tail = buf.trim()
    if (tail) {
      if (countScriptChars(tail) > DH_V2_DIALOGUE_CHARS_MAX) {
        let chunk = ""
        for (const ch of tail) {
          chunk += ch
          if (countScriptChars(chunk) >= DH_V2_DIALOGUE_CHARS_MAX) {
            units.push(chunk.trim())
            chunk = ""
          }
        }
        if (chunk.trim()) units.push(chunk.trim())
      } else {
        units.push(tail)
      }
    }
  }
  return units.filter((u) => countScriptChars(u) > 0)
}

/** 按句贪心装箱：每段不超过 54 有效字 */
export function splitScriptIntoSegments(script: string, _segmentCount?: number): string[] {
  const text = script.trim()
  if (!text) return []

  const units = splitIntoSentenceUnits(text)
  if (units.length === 0) return [text]

  const segments: string[] = []
  let current = ""

  for (const unit of units) {
    const combined = current ? `${current}${unit}` : unit
    if (countScriptChars(combined) <= DH_V2_DIALOGUE_CHARS_MAX) {
      current = combined
      continue
    }
    if (current.trim()) segments.push(current.trim())
    current = unit
  }
  if (current.trim()) segments.push(current.trim())

  return segments.length > 0 ? segments : [text]
}

export function formatSegmentTimeRange(index: number): string {
  const start = index * DH_V2_SEGMENT_SEC
  const end = start + DH_V2_SEGMENT_SEC
  return `${start}-${end}s`
}

/** 构建空壳分镜计划（台词已切分，待 AI 填充 prompt/细节） */
export function buildScriptPlanSkeleton(script: string): DhV2ScriptPlan {
  const assessment = assessScriptDuration(script)
  const dialogues = splitScriptIntoSegments(script)
  const segments: DhV2SegmentPlan[] = dialogues
    .filter((d) => hasSegmentDialogue(d))
    .map((dialogue, index) => ({
      index,
      time_range: formatSegmentTimeRange(index),
      dialogue,
      shot_details: "",
      video_prompt: "",
    }))
  const activeCount = segments.length
  return {
    ...assessment,
    segment_count: activeCount,
    plan_duration: Math.max(DH_V2_SEGMENT_SEC, activeCount * DH_V2_SEGMENT_SEC),
    segments,
  }
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

/** 按句字数推算可变时长【时间轴】（0–15s 连续覆盖） */
export function buildSegmentDialogueTimeline(dialogue: string, segmentSec = DH_V2_SEGMENT_SEC): string {
  const text = dialogue.replace(/\n/g, "").trim()
  if (!text) return `0-${segmentSec}s：无口播`

  const units = splitIntoSentenceUnits(text)
  const parts = units.length > 0 ? units : [text]

  type Slot = { text: string; chars: number; dur: number }
  const slots: Slot[] = parts.map((part) => {
    const chars = countScriptChars(part)
    const dur = Math.max(1, Math.round(chars / DH_V2_CHARS_PER_SEC_PLAN))
    return { text: part, chars, dur }
  })

  let totalDur = slots.reduce((sum, s) => sum + s.dur, 0)
  if (totalDur !== segmentSec && slots.length > 0) {
    const diff = segmentSec - totalDur
    slots[slots.length - 1].dur = Math.max(1, slots[slots.length - 1].dur + diff)
    totalDur = slots.reduce((sum, s) => sum + s.dur, 0)
    if (totalDur !== segmentSec && slots.length > 1) {
      slots[0].dur = Math.max(1, slots[0].dur + (segmentSec - totalDur))
    }
  }

  let start = 0
  return slots
    .map((slot, i) => {
      const end = i === slots.length - 1 ? segmentSec : Math.min(segmentSec, start + slot.dur)
      const slice = `${Math.round(start)}-${end}s：口播「${slot.text}」`
      start = end
      return slice
    })
    .join("；")
}

/** DeepSeek / Sonetto 不可用时的本地模板（仅单元测试使用，生产分镜禁止调用） */
export function buildLocalScriptPlan(
  script: string,
  creativeIdea: string,
  hasAudioRef: boolean,
): DhV2ScriptPlan {
  const skeleton = buildScriptPlanSkeleton(script)
  const idea = creativeIdea.trim() || "电影感数字人口播，竖屏专业访谈风格"
  const active = filterActiveSegments(skeleton.segments)
  const total = active.length
  const segments = active.map((seg, i) => {
    const dlg = seg.dialogue.replace(/\n/g, " ")
    const cont = total > 1 && i > 0 ? "画面承接上一段，服装场景一致。" : ""
    const shot_details = `${idea}，人物半身出镜看镜头，柔和面光，背景简洁。${cont}本段口播：${dlg.slice(0, 40)}`
    const audioBit = hasAudioRef ? " @音频1 驱动口型" : ""
    const timeline = buildSegmentDialogueTimeline(dlg)
    const video_prompt = [
      `【主体】@图1 数字人口播博主，半身出镜`,
      `【动作】自然表情与手势，与口播节奏一致${audioBit}`,
      `【环境】简洁背景，柔和面光`,
      `【镜头】9:16 竖屏，medium shot，slow push-in`,
      `【风格】${idea}`,
      `【时间轴】${timeline}`,
      `【约束】15s，口型与台词同步，stable composition, sharp focus`,
      total > 1 ? `（第 ${i + 1}/${total} 段，15 秒）` : "",
    ].join("\n")
    return { ...seg, shot_details, video_prompt }
  })
  const reindexed = reindexSegments(segments)
  return {
    ...skeleton,
    segment_count: reindexed.length,
    plan_duration: Math.max(DH_V2_SEGMENT_SEC, reindexed.length * DH_V2_SEGMENT_SEC),
    segments: reindexed,
  }
}

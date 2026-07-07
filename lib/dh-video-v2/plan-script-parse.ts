/**
 * 分镜 AI 响应解析（纯函数，可单测）
 */

import {
  assessScriptDuration,
  DH_V2_SEGMENT_SEC,
  filterActiveSegments,
  formatSegmentTimeRange,
  reindexSegments,
  type DhV2ScriptPlan,
  type DhV2SegmentPlan,
} from "./script-plan"

/** 从 AI 文本中提取 JSON */
export function extractPlanJsonBlock(text: string): { segments?: unknown[] } {
  let raw = (text || "").trim()
  if (raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  }
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start < 0 || end <= start) throw new Error("AI 未返回有效 JSON")
  return JSON.parse(raw.slice(start, end + 1)) as { segments?: unknown[] }
}

/** 将 AI segments 转为 DhV2ScriptPlan */
export function mergeAiPlanFromResponse(
  script: string,
  aiSegments: Array<{ dialogue?: string; shot_details?: string; video_prompt?: string }>,
): DhV2ScriptPlan {
  const assessment = assessScriptDuration(script)
  const mapped: DhV2SegmentPlan[] = aiSegments.map((s, i) => ({
    index: i,
    time_range: formatSegmentTimeRange(i),
    dialogue: String(s.dialogue ?? "").trim(),
    shot_details: String(s.shot_details ?? "").trim(),
    video_prompt: String(s.video_prompt ?? "").trim(),
  }))
  const active = filterActiveSegments(mapped)
  const reindexed = reindexSegments(active)
  return {
    char_count: assessment.char_count,
    duration_min: assessment.duration_min,
    duration_max: assessment.duration_max,
    plan_duration: Math.max(DH_V2_SEGMENT_SEC, reindexed.length * DH_V2_SEGMENT_SEC),
    segment_count: reindexed.length,
    segments: reindexed,
  }
}

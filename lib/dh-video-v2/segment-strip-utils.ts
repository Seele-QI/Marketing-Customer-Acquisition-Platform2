import type { DhV2SegmentRuntimeStatus } from "./types"

export type SegmentStripItem = {
  index: number
  status: DhV2SegmentRuntimeStatus["status"]
  videoUrl?: string
  error?: string
  timeRange?: string
  dialogue?: string
}

export function buildSegmentStripFromPlan(
  planSegments: Array<{ index: number; time_range: string; dialogue: string }>,
  runtimeSegments?: SegmentStripItem[],
): SegmentStripItem[] {
  const byIndex = new Map((runtimeSegments || []).map((s) => [s.index, s]))
  return planSegments.map((p) => {
    const rt = byIndex.get(p.index)
    return {
      index: p.index,
      status: rt?.status ?? "pending",
      videoUrl: rt?.videoUrl,
      error: rt?.error,
      timeRange: rt?.timeRange ?? p.time_range,
      dialogue: rt?.dialogue ?? p.dialogue,
    }
  })
}

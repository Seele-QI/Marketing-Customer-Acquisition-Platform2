"use client"

import { Loader2, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import type { DhV2ScriptPlan, DhV2SegmentPlan } from "@/lib/dh-video-v2/script-plan"
import type { DhV2ThemeTokens } from "@/lib/dh-video-v2/theme"
import { getDhV2InputClass } from "@/lib/dh-video-v2/theme"

type Props = {
  plan: DhV2ScriptPlan
  tokens: DhV2ThemeTokens
  surface: "dark" | "light"
  accent: "amber" | "rose" | "sky" | "violet"
  onChange: (plan: DhV2ScriptPlan) => void
  onRegenerate?: () => void
  regenerating?: boolean
}

export function ScriptPlanPanel({
  plan,
  tokens,
  surface,
  accent,
  onChange,
  onRegenerate,
  regenerating,
}: Props) {
  const inputClass = getDhV2InputClass(surface, accent)
  const fieldLabel = cn("mb-1 block text-[11px] font-medium", tokens.fieldLabel)

  const updateSegment = (index: number, patch: Partial<DhV2SegmentPlan>) => {
    const segments = plan.segments.map((s) =>
      s.index === index ? { ...s, ...patch } : s,
    )
    onChange({ ...plan, segments })
  }

  return (
    <div className="space-y-4">
      <div className={cn("rounded-2xl border p-4", tokens.cardBorder, tokens.card)}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className={cn("text-[16px] font-semibold", tokens.title)}>AI 分镜脚本</h2>
            <p className={cn("mt-1 text-[12px]", tokens.muted)}>
              {plan.char_count} 字 · 约 {plan.duration_min}–{plan.duration_max} 秒 · 计划{" "}
              {plan.plan_duration}s · {plan.segment_count} 段 × 15s
            </p>
          </div>
          {onRegenerate ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={regenerating}
              onClick={onRegenerate}
              className={cn("rounded-full text-[11px]", tokens.btnOutline)}
            >
              {regenerating ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1 h-3 w-3" />
              )}
              重新生成
            </Button>
          ) : null}
        </div>
      </div>

      {plan.segments.map((seg) => (
        <div
          key={seg.index}
          className={cn("rounded-2xl border p-4", tokens.cardBorder, tokens.card)}
        >
          <div className="mb-3 flex items-center justify-between">
            <span className={cn("text-[13px] font-semibold", tokens.title)}>
              段 {seg.index + 1}
            </span>
            <span className={cn("text-[11px]", tokens.muted)}>{seg.time_range}</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className={fieldLabel}>角色台词</label>
              <textarea
                value={seg.dialogue}
                onChange={(e) => updateSegment(seg.index, { dialogue: e.target.value })}
                className={cn(inputClass, "min-h-[72px] resize-y leading-relaxed")}
              />
            </div>
            <div>
              <label className={fieldLabel}>分镜细节</label>
              <textarea
                value={seg.shot_details}
                onChange={(e) => updateSegment(seg.index, { shot_details: e.target.value })}
                className={cn(inputClass, "min-h-[64px] resize-y leading-relaxed")}
              />
            </div>
            <div>
              <label className={fieldLabel}>
                视频提示词 <span className="text-red-400">*</span>
              </label>
              <textarea
                value={seg.video_prompt}
                onChange={(e) => updateSegment(seg.index, { video_prompt: e.target.value })}
                className={cn(inputClass, "min-h-[96px] resize-y leading-relaxed")}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

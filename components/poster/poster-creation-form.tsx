import { Loader2, Sparkles } from "lucide-react"

import { PosterRatioSelector } from "@/components/poster/poster-ratio-selector"
import type {
  PosterOrientation,
  PosterRatioFamily,
  PosterResolution,
} from "@/lib/poster/types"

export const POSTER_STYLES = [
  "高级简约",
  "国潮东方",
  "清新自然",
  "科技未来",
  "活力促销",
] as const

type PosterCreationFormProps = {
  purpose: string
  headline: string
  body: string
  style: string
  ratioFamily: PosterRatioFamily
  orientation: PosterOrientation
  resolution: PosterResolution
  loading: boolean
  error: string
  onPurposeChange: (value: string) => void
  onHeadlineChange: (value: string) => void
  onBodyChange: (value: string) => void
  onStyleChange: (value: string) => void
  onRatioFamilyChange: (value: PosterRatioFamily) => void
  onOrientationChange: (value: PosterOrientation) => void
  onResolutionChange: (value: PosterResolution) => void
  onSubmit: () => void
}

export function PosterCreationForm({
  purpose,
  headline,
  body,
  style,
  ratioFamily,
  orientation,
  resolution,
  loading,
  error,
  onPurposeChange,
  onHeadlineChange,
  onBodyChange,
  onStyleChange,
  onRatioFamilyChange,
  onOrientationChange,
  onResolutionChange,
  onSubmit,
}: PosterCreationFormProps) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-950">创作设置</h2>
      <div className="mt-5 space-y-4">
        <label className="block">
          <span className="text-xs font-medium text-slate-500">海报用途</span>
          <input
            value={purpose}
            disabled={loading}
            onChange={(event) => onPurposeChange(event.target.value)}
            placeholder="例如：新品首发、活动宣传"
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-violet-400 disabled:bg-slate-50"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-500">主标题 *</span>
          <input
            value={headline}
            disabled={loading}
            onChange={(event) => onHeadlineChange(event.target.value)}
            placeholder="例如：实体店做 IP 技巧"
            className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-violet-400 disabled:bg-slate-50"
          />
        </label>

        <label className="block">
          <span className="text-xs font-medium text-slate-500">辅助文案</span>
          <textarea
            value={body}
            disabled={loading}
            onChange={(event) => onBodyChange(event.target.value)}
            rows={4}
            placeholder="填写卖点、时间、地点和行动提示"
            className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm leading-6 outline-none transition focus:border-violet-400 disabled:bg-slate-50"
          />
        </label>

        <div>
          <span className="text-xs font-medium text-slate-500">视觉风格</span>
          <div className="mt-2 flex flex-wrap gap-2">
            {POSTER_STYLES.map((item) => (
              <button
                key={item}
                type="button"
                disabled={loading}
                onClick={() => onStyleChange(item)}
                className={`rounded-full px-3 py-1.5 text-xs transition ${
                  style === item
                    ? "bg-violet-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-violet-50"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <PosterRatioSelector
          ratioFamily={ratioFamily}
          orientation={orientation}
          disabled={loading}
          onRatioFamilyChange={onRatioFamilyChange}
          onOrientationChange={onOrientationChange}
        />

        <div>
          <span className="text-xs font-medium text-slate-500">清晰度</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["1k", "2k"] as const).map((item) => (
              <button
                key={item}
                type="button"
                disabled={loading}
                onClick={() => onResolutionChange(item)}
                className={`rounded-xl border px-3 py-2 text-xs uppercase transition ${
                  resolution === item
                    ? "border-violet-500 bg-violet-50 font-semibold text-violet-700"
                    : "border-slate-200 text-slate-500 hover:bg-slate-50"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-700">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={!headline.trim() || loading}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading ? "正在生成海报…" : "生成 2 张海报"}
        </button>
      </div>
    </section>
  )
}

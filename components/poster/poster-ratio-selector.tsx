import { Monitor, Smartphone } from "lucide-react"

import {
  POSTER_RATIO_FAMILIES,
  type PosterOrientation,
  type PosterRatioFamily,
} from "@/lib/poster/types"

type PosterRatioSelectorProps = {
  ratioFamily: PosterRatioFamily
  orientation: PosterOrientation
  disabled?: boolean
  onRatioFamilyChange: (value: PosterRatioFamily) => void
  onOrientationChange: (value: PosterOrientation) => void
}

export function PosterRatioSelector({
  ratioFamily,
  orientation,
  disabled = false,
  onRatioFamilyChange,
  onOrientationChange,
}: PosterRatioSelectorProps) {
  return (
    <div className="space-y-3">
      <div>
        <span className="text-xs font-medium text-slate-500">画面比例</span>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {POSTER_RATIO_FAMILIES.map((item) => (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => onRatioFamilyChange(item)}
              className={`rounded-xl border px-2 py-2 text-xs transition ${
                ratioFamily === item
                  ? "border-violet-500 bg-violet-50 font-semibold text-violet-700"
                  : "border-slate-200 text-slate-500 hover:border-violet-200 hover:bg-violet-50/50"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {ratioFamily !== "1:1" && (
        <div>
          <span className="text-xs font-medium text-slate-500">画面方向</span>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onOrientationChange("portrait")}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs transition ${
                orientation === "portrait"
                  ? "border-violet-500 bg-violet-50 font-semibold text-violet-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Smartphone className="h-3.5 w-3.5" />
              竖屏
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onOrientationChange("landscape")}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs transition ${
                orientation === "landscape"
                  ? "border-violet-500 bg-violet-50 font-semibold text-violet-700"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              <Monitor className="h-3.5 w-3.5" />
              横屏
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

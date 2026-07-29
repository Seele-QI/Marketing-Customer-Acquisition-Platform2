import { Monitor, Smartphone } from "lucide-react"

import {
  IMAGE_RATIO_FAMILIES,
  IMAGE_RESOLUTIONS,
  type ImageOrientation,
  type ImageRatioFamily,
  type ImageResolution,
} from "@/lib/image-workbench/types"

type ImageRatioSelectorProps = {
  ratioFamily: ImageRatioFamily
  orientation: ImageOrientation
  resolution: ImageResolution
  disabled?: boolean
  onRatioFamilyChange: (value: ImageRatioFamily) => void
  onOrientationChange: (value: ImageOrientation) => void
  onResolutionChange: (value: ImageResolution) => void
}

export function ImageRatioSelector({
  ratioFamily,
  orientation,
  resolution,
  disabled = false,
  onRatioFamilyChange,
  onOrientationChange,
  onResolutionChange,
}: ImageRatioSelectorProps) {
  return (
    <div className="space-y-3">
      <div>
        <span className="text-xs font-medium text-slate-500">画面比例</span>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {IMAGE_RATIO_FAMILIES.map((item) => (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => onRatioFamilyChange(item)}
              className={`rounded-lg border px-2 py-2 text-xs transition ${
                ratioFamily === item
                  ? "border-[#3157df] bg-[#edf1ff] font-semibold text-[#294bc7]"
                  : "border-[#d9dce2] bg-white text-[#666b75] hover:border-[#aeb9e8]"
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
            {([
              ["portrait", "竖屏", Smartphone],
              ["landscape", "横屏", Monitor],
            ] as const).map(([item, label, Icon]) => (
              <button
                key={item}
                type="button"
                disabled={disabled}
                onClick={() => onOrientationChange(item)}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs transition ${
                  orientation === item
                    ? "border-[#3157df] bg-[#edf1ff] font-semibold text-[#294bc7]"
                    : "border-[#d9dce2] bg-white text-[#666b75] hover:bg-[#f5f6f8]"
                } disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <span className="text-xs font-medium text-slate-500">清晰度</span>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {IMAGE_RESOLUTIONS.map((item) => (
            <button
              key={item}
              type="button"
              disabled={disabled}
              onClick={() => onResolutionChange(item)}
              className={`rounded-lg border px-3 py-2 text-xs uppercase transition ${
                resolution === item
                  ? "border-[#3157df] bg-[#edf1ff] font-semibold text-[#294bc7]"
                  : "border-[#d9dce2] bg-white text-[#666b75] hover:bg-[#f5f6f8]"
              } disabled:cursor-not-allowed disabled:opacity-50`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

import type { ImageWorkbenchMode } from "@/lib/image-workbench/types"

type WorkbenchModeTabsProps = {
  value: ImageWorkbenchMode
  onChange: (value: ImageWorkbenchMode) => void
}

const MODES = [
  {
    value: "poster" as const,
    label: "海报图创作",
    description: "结构化文案与商业版式",
  },
  {
    value: "image" as const,
    label: "图片创作",
    description: "自由描述与多图参考",
  },
]

export function WorkbenchModeTabs({ value, onChange }: WorkbenchModeTabsProps) {
  return (
    <div className="flex items-center gap-1 border-t border-[#e6e6e2] px-3 py-1.5 sm:px-5">
      {MODES.map((mode) => {
        const selected = value === mode.value
        return (
          <button
            key={mode.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(mode.value)}
            className={`rounded-lg px-3 py-2 text-left transition ${
              selected
                ? "bg-[#24272d] text-white"
                : "text-[#626771] hover:bg-[#eef0f3]"
            }`}
          >
            <span className="block text-xs font-semibold">{mode.label}</span>
            <span className={`hidden text-[10px] sm:block ${selected ? "text-white/65" : "text-[#999da6]"}`}>
              {mode.description}
            </span>
          </button>
        )
      })}
    </div>
  )
}

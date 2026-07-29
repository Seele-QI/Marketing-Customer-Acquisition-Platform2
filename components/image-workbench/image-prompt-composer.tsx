import { Loader2, Sparkles } from "lucide-react"

import type { ImageWorkbenchMode } from "@/lib/image-workbench/types"

type ImagePromptComposerProps = {
  mode: ImageWorkbenchMode
  value: string
  onChange: (value: string) => void
  loading: boolean
  canGenerate: boolean
  referenceCount: number
  outputLabel: string
  stageLabel?: string
  onGenerate: () => void
}

export function ImagePromptComposer({
  mode,
  value,
  onChange,
  loading,
  canGenerate,
  referenceCount,
  outputLabel,
  stageLabel,
  onGenerate,
}: ImagePromptComposerProps) {
  const placeholder =
    mode === "poster"
      ? "补充画面创意，例如：暖灰背景、主体居中、右侧留出标题区域"
      : "描述主体、场景、构图、光影和希望呈现的氛围"

  return (
    <div className="border-t border-[#d6d9df] bg-[#f3f4f6] p-3 sm:p-4">
      <div className="relative mx-auto max-w-5xl rounded-[14px] border border-[#c9cdd5] bg-[#fbfbf9] p-3 pr-3 shadow-[0_14px_36px_rgba(26,31,43,0.12)] sm:pr-72">
        <textarea
          value={value}
          disabled={loading}
          onChange={(event) => onChange(event.target.value)}
          rows={2}
          placeholder={placeholder}
          className="w-full resize-none bg-transparent text-sm leading-6 text-[#23262d] outline-none placeholder:text-[#999da6]"
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[#858a94]">
          <span>{referenceCount ? `${referenceCount} 张参考图` : "无参考图"}</span>
          <span>{outputLabel}</span>
          <span>{loading ? stageLabel || "正在生成候选图" : "Enter 换行"}</span>
        </div>
        <button
          type="button"
          disabled={!canGenerate || loading}
          onClick={onGenerate}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-[10px] bg-[#3157df] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#284bc7] disabled:cursor-not-allowed disabled:bg-[#b7c1e8] sm:absolute sm:bottom-3 sm:right-32 sm:top-3 sm:mt-0 sm:w-36"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span>
            {loading ? "生成中" : "生成 2 张"}
            <small className="block text-[10px] font-normal text-white/70">20 积分</small>
          </span>
        </button>
      </div>
    </div>
  )
}

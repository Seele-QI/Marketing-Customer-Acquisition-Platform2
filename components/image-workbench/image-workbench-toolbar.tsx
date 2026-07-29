import { CircleCheck, Clock3, Images } from "lucide-react"

import { WorkbenchModeTabs } from "@/components/image-workbench/workbench-mode-tabs"
import type { ImageWorkbenchMode } from "@/lib/image-workbench/types"

type ImageWorkbenchToolbarProps = {
  mode: ImageWorkbenchMode
  onModeChange: (mode: ImageWorkbenchMode) => void
  taskCount: number
}

export function ImageWorkbenchToolbar({
  mode,
  onModeChange,
  taskCount,
}: ImageWorkbenchToolbarProps) {
  return (
    <header className="border-b border-[#d9dce2] bg-[#fbfbf8]">
      <div className="flex min-h-14 items-center gap-3 px-4 sm:px-5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#202329] text-white">
          <Images className="h-4 w-4" />
        </span>
        <div>
          <h1 className="text-[15px] font-semibold tracking-tight text-[#1d2026]">
            图片工作台
          </h1>
          <p className="hidden text-[11px] text-[#858a94] sm:block">
            商业视觉与通用图片创作
          </p>
        </div>
        <span className="hidden items-center gap-1.5 rounded-full bg-[#edf7ef] px-2.5 py-1 text-[11px] font-medium text-[#2c7540] md:inline-flex">
          <CircleCheck className="h-3.5 w-3.5" />
          创作服务可用
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs text-[#777c86] sm:inline">每次 20 积分</span>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#d9dce1] bg-white px-2.5 py-1.5 text-xs text-[#555a64]">
            <Clock3 className="h-3.5 w-3.5" />
            本次会话 {taskCount}
          </span>
        </div>
      </div>
      <WorkbenchModeTabs value={mode} onChange={onModeChange} />
    </header>
  )
}

"use client"

import { Construction } from "lucide-react"
import { GeoWorkflowHero, GeoWorkflowPage } from "@/components/geo/geo-workflow-shell"

export function GeoMultiPlatformPushView() {
  return (
    <GeoWorkflowPage>
      <GeoWorkflowHero
        title="多平台"
        accentWord="一键推送"
        description="统一管理渠道发布队列，确保跨平台内容一致性与 GEO 标签覆盖。"
      />

      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200/80 bg-slate-50/50 px-6 py-16 text-center dark:border-white/10 dark:bg-white/[0.02]">
        <Construction className="mb-3 h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden />
        <p className="text-[15px] font-medium text-slate-700 dark:text-slate-300">功能开发中</p>
        <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-slate-500">
          多平台一键推送正在开发，暂不可用。完成后将支持微信公众号、知乎、头条等渠道统一发布。
        </p>
      </div>
    </GeoWorkflowPage>
  )
}

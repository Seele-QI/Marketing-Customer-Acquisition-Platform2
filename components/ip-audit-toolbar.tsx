"use client"

import * as React from "react"
import { FileText, Download, Loader2, CheckCircle2, Sprout, TrendingUp, Gem } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import {
  exportReportPDF,
  todayString,
  type IPReportSection,
} from "@/lib/ip-positioning-report"

type Props = {
  stageId: string | null
  stageTitle: string
  stageHint: string
  /** 各模块收集到的分析结果 */
  competitorAnalysis?: string
  viralAnalysis?: string
  diagnosisAnalysis?: string
  /** 正在生成综合诊断 */
  generatingReport?: boolean
  onGenerateReport?: () => void
}

const STAGE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  novice: Sprout,
  growth: TrendingUp,
  mature: Gem,
}

export function IPAuditToolbar({
  stageId,
  stageTitle,
  stageHint,
  competitorAnalysis,
  viralAnalysis,
  diagnosisAnalysis,
  generatingReport,
  onGenerateReport,
}: Props) {
  const StageIcon = stageId ? STAGE_ICONS[stageId] ?? Sprout : null

  const hasAnyAnalysis = !!(competitorAnalysis || viralAnalysis || diagnosisAnalysis)

  const handleExport = React.useCallback(() => {
    const sections: IPReportSection[] = []
    if (competitorAnalysis) {
      sections.push({ title: "竞品扫描", icon: "🔍", content: competitorAnalysis })
    }
    if (viralAnalysis) {
      sections.push({ title: "爆款分析", icon: "📈", content: viralAnalysis })
    }
    if (diagnosisAnalysis) {
      sections.push({ title: "账号诊断", icon: "🩺", content: diagnosisAnalysis })
    }

    if (sections.length === 0) {
      toast({ title: "暂无数据", description: "请先完成至少一项分析后再导出", variant: "destructive" })
      return
    }

    exportReportPDF({
      generatedAt: todayString(),
      stageName: stageTitle || "未选择",
      sections,
    })
    toast({ title: "报告导出中", description: "浏览器打印对话框已打开" })
  }, [competitorAnalysis, viralAnalysis, diagnosisAnalysis, stageTitle])

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
      {/* Stage Indicator */}
      {StageIcon && (
        <div className="flex items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 dark:bg-blue-500/10">
          <StageIcon className="h-4 w-4 text-blue-500" />
          <span className="text-[13px] font-medium text-blue-700 dark:text-blue-400">
            {stageTitle}
          </span>
          <span className="hidden text-[12px] text-blue-500/70 sm:inline">
            {stageHint.slice(0, 20)}…
          </span>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Generate Report */}
      {onGenerateReport && (
        <Button
          onClick={onGenerateReport}
          disabled={generatingReport || !hasAnyAnalysis}
          variant="outline"
          size="sm"
          className="inline-flex items-center gap-1.5 rounded-xl border-blue-200 bg-blue-50/50 text-[13px] font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-400"
        >
          {generatingReport ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          {generatingReport ? "生成中…" : "生成诊断报告"}
        </Button>
      )}

      {/* Export PDF */}
      <Button
        onClick={handleExport}
        disabled={!hasAnyAnalysis}
        size="sm"
        className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-all duration-200 hover:from-blue-600 hover:to-indigo-600 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
      >
        <Download className="h-4 w-4" />
        导出 PDF
      </Button>
    </div>
  )
}

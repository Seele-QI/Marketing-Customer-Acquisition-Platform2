"use client"

import * as React from "react"
import { Loader2, Target } from "lucide-react"

import { PositioningIntakeWizard } from "@/components/ip-positioning/positioning-intake-wizard"
import { PositioningReportView } from "@/components/ip-positioning/positioning-report-view"
import { toast } from "@/hooks/use-toast"
import type { IpPositioningIntake, IpPositioningReport } from "@/lib/ip-positioning-schema"
import {
  clearIpPositioningSession,
  loadIpPositioningSession,
  saveIpPositioningSession,
} from "@/lib/ip-positioning-store"
import { clearWorkflowAssets } from "@/lib/workflow-asset-store"

export function AccountPositioning() {
  const [analyzing, setAnalyzing] = React.useState(false)
  const [report, setReport] = React.useState<IpPositioningReport | null>(() => {
    if (typeof window === "undefined") return null
    return loadIpPositioningSession()?.report ?? null
  })
  const [stage, setStage] = React.useState<IpPositioningIntake["stage"]>(() => {
    if (typeof window === "undefined") return null
    return loadIpPositioningSession()?.stage ?? null
  })
  const [wizardKey, setWizardKey] = React.useState(0)

  const handleSubmit = React.useCallback(
    async (payload: {
      intake: IpPositioningIntake
      files: Array<{ name: string; size: number; type: string; base64?: string }>
      modelId: string
    }) => {
      setAnalyzing(true)
      setReport(null)
      setStage(payload.intake.stage)
      saveIpPositioningSession({
        report: null,
        stage: payload.intake.stage,
        intake: payload.intake,
        modelId: payload.modelId,
      })

      try {
        const res = await fetch("/api/ai/ip-positioning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: payload.modelId,
            intake: payload.intake,
            files: payload.files,
          }),
        })

        const data = await res.json()

        if (!res.ok) {
          const detail =
            typeof data.detail === "string"
              ? data.detail
              : typeof data.detail?.message === "string"
                ? data.detail.message
                : "分析失败"
          throw new Error(detail)
        }

        if (!data.report) {
          throw new Error("未收到有效报告")
        }

        const nextReport = data.report as IpPositioningReport
        setReport(nextReport)
        saveIpPositioningSession({
          report: nextReport,
          stage: payload.intake.stage,
          intake: payload.intake,
          modelId: payload.modelId,
        })

        if (data._meta) {
          console.log(
            `[IP Positioning] Model: ${data._meta.model} | ${data._meta.durationMs}ms | docs: ${data._meta.documentsUsed}`,
          )
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "分析失败"
        toast({ title: "IP 定位诊断失败", description: message, variant: "destructive" })
        console.error("[IP Positioning] Error:", e)
      } finally {
        setAnalyzing(false)
      }
    },
    [],
  )

  const handleRestart = React.useCallback(() => {
    clearIpPositioningSession()
    void clearWorkflowAssets("ip-positioning")
    setReport(null)
    setStage(null)
    setWizardKey((k) => k + 1)
  }, [])

  return (
    <div className="h-full overflow-y-auto bg-[#fafaf8] dark:bg-slate-950">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="mb-10">
          <div className="mb-4 h-1 w-12 rounded-full bg-amber-500/60" />
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[34px] dark:text-slate-50">
            发现你的
            <span className="text-amber-600 dark:text-amber-400"> IP 定位</span>
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
            引导式诊断 + 资料上传，AI 输出差异化定位、反共识主张、平台打法与 30 天行动路线
          </p>
        </header>

        {analyzing ? (
          <div className="flex flex-col items-center justify-center gap-4 py-16">
            <div className="relative">
              <div className="h-16 w-16 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
              <Target className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-amber-500" />
            </div>
            <p className="text-[14px] text-slate-500">AI 正在生成高洞察定位报告…</p>
            <Loader2 className="h-4 w-4 animate-spin text-amber-500" />
          </div>
        ) : report ? (
          <PositioningReportView report={report} stage={stage} onRestart={handleRestart} />
        ) : (
          <PositioningIntakeWizard
            key={wizardKey}
            onSubmit={handleSubmit}
            analyzing={analyzing}
          />
        )}
      </div>
    </div>
  )
}

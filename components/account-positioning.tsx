"use client"

import * as React from "react"
import { Loader2, Target } from "lucide-react"

import { useLoginRequired } from "@/components/auth/login-required-provider"
import { PositioningIntakeWizard } from "@/components/ip-positioning/positioning-intake-wizard"
import { PositioningReportView } from "@/components/ip-positioning/positioning-report-view"
import { ModuleTutorialButton } from "@/components/tutorial/module-tutorial-button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "@/hooks/use-toast"
import type { IpPositioningIntake, IpPositioningReport } from "@/lib/ip-positioning-schema"
import {
  clearIpPositioningSession,
  loadIpPositioningSession,
  saveIpPositioningSession,
} from "@/lib/ip-positioning-store"
import { clearWorkflowAssets } from "@/lib/workflow-asset-store"
import { guardDemoAction } from "@/lib/tutorial/demo-mode"
import { parseApiErrorResponse } from "@/lib/api/parse-detail"

export function AccountPositioning() {
  const { requireLogin } = useLoginRequired()
  const [analyzing, setAnalyzing] = React.useState(false)
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null)
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
    }) => {
      if (!guardDemoAction("ip-positioning submit")) {
        toast({
          title: "演示模式已拦截",
          description: "教程示例不调用 AI。请先退出引导，或在教程中心查看已保存报告。",
        })
        return
      }

      const loggedIn = await requireLogin("登录后可生成 IP 定位报告并扣减积分")
      if (!loggedIn) return

      setErrorMessage(null)
      setAnalyzing(true)
      setReport(null)
      setStage(payload.intake.stage)
      saveIpPositioningSession({
        report: null,
        stage: payload.intake.stage,
        intake: payload.intake,
      })

      try {
        const res = await fetch("/api/ai/ip-positioning", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            intake: payload.intake,
            files: payload.files,
          }),
        })

        const raw = await res.text()
        let data: Record<string, unknown>
        try {
          data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
        } catch {
          throw new Error(parseApiErrorResponse(res.status, {}, "服务返回内容异常，请稍后重试。"))
        }

        if (!res.ok) {
          throw new Error(parseApiErrorResponse(res.status, { detail: data.detail }, "分析失败"))
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
        })

        if (data._meta && typeof data._meta === "object") {
          const meta = data._meta as {
            model?: string
            durationMs?: number
            documentsUsed?: number
          }
          console.log(
            `[IP Positioning] Model: ${meta.model} | ${meta.durationMs}ms | docs: ${meta.documentsUsed}`,
          )
        }
      } catch (e) {
        const message = e instanceof Error ? e.message : "分析失败"
        setErrorMessage(message)
        toast({ title: "IP 定位诊断失败", description: message, variant: "destructive" })
        console.error("[IP Positioning] Error:", e)
        throw e
      } finally {
        setAnalyzing(false)
      }
    },
    [requireLogin],
  )

  const handleRestart = React.useCallback(() => {
    clearIpPositioningSession()
    void clearWorkflowAssets("ip-positioning")
    setReport(null)
    setStage(null)
    setErrorMessage(null)
    setWizardKey((k) => k + 1)
  }, [])

  return (
    <div className="h-full overflow-y-auto bg-[#fafaf8] dark:bg-slate-950">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-12">
        <header className="mb-10">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="h-1 w-12 rounded-full bg-amber-500/60" />
            <ModuleTutorialButton view="身份定位" />
          </div>
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
          <>
            {errorMessage ? (
              <Alert variant="destructive" className="mb-6">
                <AlertTitle>IP 定位诊断失败</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            ) : null}
            <PositioningIntakeWizard
              key={wizardKey}
              onSubmit={handleSubmit}
              analyzing={analyzing}
            />
          </>
        )}
      </div>
    </div>
  )
}

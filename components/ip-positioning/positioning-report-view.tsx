"use client"

import * as React from "react"
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Lightbulb,
  MapPin,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  buildIpPositioningReportData,
  exportReportPDF,
  todayString,
} from "@/lib/ip-positioning-report"
import type { IpPositioningReport } from "@/lib/ip-positioning-schema"
import { getStageTitle, type StageId } from "@/lib/ip-positioning-skill"
import { cn } from "@/lib/utils"

type Props = {
  report: IpPositioningReport
  stage: StageId | null
  onRestart: () => void
}

function SectionCard({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5",
        className,
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 dark:bg-amber-500/10">
          <Icon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        </span>
        <h3 className="text-[16px] font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      </div>
      {children}
    </section>
  )
}

export function PositioningReportView({ report, stage, onRestart }: Props) {
  const handleExport = React.useCallback(() => {
    exportReportPDF(
      buildIpPositioningReportData({
        report,
        stageName: getStageTitle(stage) || "未选择",
        generatedAt: todayString(),
      }),
    )
  }, [report, stage])

  return (
    <div className="space-y-6">
      <div className="overflow-hidden rounded-3xl border border-amber-200/60 bg-gradient-to-br from-amber-50 via-white to-orange-50 p-8 shadow-md dark:border-amber-500/20 dark:from-amber-950/40 dark:via-slate-900 dark:to-slate-950">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[12px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              IP 定位诊断结论
            </p>
            <h2 className="mt-2 text-[28px] font-bold leading-tight text-slate-900 dark:text-slate-50">
              {report.oneLiner}
            </h2>
          </div>
          <div className="rounded-full bg-white/80 px-3 py-1 text-[12px] font-semibold text-amber-700 shadow-sm dark:bg-white/10 dark:text-amber-300">
            置信度 {report.confidenceScore}%
          </div>
        </div>
        <p className="max-w-3xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-300">
          {report.sharpDiagnosis}
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <span className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[12px] font-medium text-amber-800 dark:border-amber-500/30 dark:bg-white/5 dark:text-amber-300">
            反共识：{report.contrarianBelief}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-medium text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
            方法论：{report.uniqueMechanism}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="你最该占据的认知位置" icon={MapPin}>
          <p className="text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">
            {report.cognitivePosition}
          </p>
        </SectionCard>

        <SectionCard title="为什么是你，不是别人" icon={Sparkles}>
          <p className="text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">
            {report.whyYouNotOthers}
          </p>
        </SectionCard>

        <SectionCard title="你最强的差异化杠杆" icon={Zap}>
          <p className="text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">
            {report.differentiationLever}
          </p>
        </SectionCard>

        <SectionCard title="核心受众与痛点欲望" icon={Users}>
          <p className="mb-2 text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">
            <strong className="text-slate-800 dark:text-slate-200">受众：</strong>
            {report.audienceProfile}
          </p>
          <p className="text-[14px] leading-relaxed text-slate-600 dark:text-slate-300">
            <strong className="text-slate-800 dark:text-slate-200">痛点与欲望：</strong>
            {report.corePainAndDesire}
          </p>
        </SectionCard>
      </div>

      <SectionCard title="你不该做的方向" icon={AlertTriangle}>
        <div className="flex flex-wrap gap-2">
          {report.avoidDirections.map((item) => (
            <span
              key={item}
              className="rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[12px] text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300"
            >
              {item}
            </span>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="平台优先级与内容打法" icon={TrendingUp}>
        <div className="space-y-3">
          {[...report.platformPlans]
            .sort((a, b) => a.priority - b.priority)
            .map((plan) => (
              <div
                key={plan.platform}
                className="rounded-xl border border-slate-200/60 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white">
                    {plan.priority}
                  </span>
                  <h4 className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                    {plan.platform}
                  </h4>
                </div>
                <p className="text-[13px] text-slate-500 dark:text-slate-400">{plan.reason}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                  {plan.contentStrategy}
                </p>
              </div>
            ))}
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SectionCard title="内容支柱" icon={Target}>
          <div className="flex flex-wrap gap-2">
            {report.contentPillars.map((pillar) => (
              <span
                key={pillar}
                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
              >
                {pillar}
              </span>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="首批选题" icon={Lightbulb}>
          <ul className="space-y-2">
            {report.starterTopics.map((topic) => (
              <li
                key={topic}
                className="rounded-lg border border-slate-200/60 bg-white px-3 py-2 text-[13px] text-slate-700 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
              >
                {topic}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <SectionCard title="变现路径阶梯" icon={TrendingUp}>
        <div className="space-y-3">
          {report.monetizationLadder.map((step) => (
            <div
              key={`${step.stage}-${step.offer}`}
              className="grid grid-cols-1 gap-2 rounded-xl border border-slate-200/60 p-4 sm:grid-cols-[120px_1fr] dark:border-white/10"
            >
              <div>
                <p className="text-[12px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  {step.stage}
                </p>
                <p className="mt-1 text-[13px] font-medium text-slate-800 dark:text-slate-200">
                  {step.offer}
                </p>
                <p className="text-[12px] text-slate-500">{step.priceRange}</p>
              </div>
              <p className="text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
                {step.whyNow}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title="接下来 30 天行动路线" icon={Target}>
        <div className="space-y-4">
          {report.thirtyDayPlan.map((week) => (
            <div key={week.week}>
              <h4 className="mb-2 text-[13px] font-semibold text-amber-700 dark:text-amber-400">
                {week.week}
              </h4>
              <ul className="space-y-2">
                {week.actions.map((action) => (
                  <li
                    key={action}
                    className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-[13px] text-slate-700 dark:bg-white/5 dark:text-slate-300"
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    {action}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </SectionCard>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 px-5 py-4 dark:border-white/10 dark:bg-white/5">
        <div>
          <p className="text-[14px] font-medium text-slate-700 dark:text-slate-300">
            需要调整定位方向？
          </p>
          <p className="text-[12px] text-slate-400">修改问卷后重新生成，或导出 PDF 分享给团队。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={onRestart} className="rounded-xl">
            <ArrowLeft className="mr-1 h-4 w-4" />
            重新诊断
          </Button>
          <Button onClick={handleExport} className="rounded-xl bg-amber-500 hover:bg-amber-600">
            <Download className="mr-1 h-4 w-4" />
            导出 PDF
          </Button>
        </div>
      </div>
    </div>
  )
}

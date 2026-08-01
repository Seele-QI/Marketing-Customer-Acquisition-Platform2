"use client"

import * as React from "react"
import { CheckCircle2, Clock, FileText, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TutorialDemoBanner } from "@/components/tutorial/demo-banner"
import {
  getTutorialFixture,
  type TutorialFixtureMap,
} from "@/lib/tutorial/fixtures"
import { TUTORIAL_MODULE_LABELS, type TutorialModuleId } from "@/lib/tutorial/types"
import { cn } from "@/lib/utils"

type Props = {
  fixtureKey: keyof TutorialFixtureMap
  onClose?: () => void
  className?: string
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-[14px] font-semibold text-foreground">{children}</h3>
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] text-muted-foreground">
      {children}
    </span>
  )
}

function DemoImg({
  src,
  alt,
  className,
}: {
  src: string
  alt: string
  className?: string
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={cn("h-full w-full", className)} />
  )
}

export function TutorialDemoPanel({ fixtureKey, onClose, className }: Props) {
  const fixture = getTutorialFixture(fixtureKey)
  const moduleLabel =
    TUTORIAL_MODULE_LABELS[fixtureKey as TutorialModuleId] ?? String(fixtureKey)

  return (
    <section
      data-tutorial-id="tutorial-demo-panel"
      className={cn(
        "rounded-2xl border border-amber-500/25 bg-card p-4 shadow-sm sm:p-5",
        className,
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-400">
            已保存示例
          </p>
          <h2 className="text-[16px] font-semibold text-foreground">{moduleLabel}</h2>
        </div>
        {onClose ? (
          <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="关闭示例">
            <X className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      <TutorialDemoBanner className="mb-4" />

      {fixtureKey === "dashboard" && "highlights" in fixture ? (
        <div className="space-y-3">
          <SectionTitle>你会看到</SectionTitle>
          <ul className="space-y-2 text-[13px] text-muted-foreground">
            {fixture.highlights.map((h) => (
              <li key={h} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>{h}</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {fixture.quickActions.map((a) => (
              <Chip key={a}>{a}</Chip>
            ))}
          </div>
        </div>
      ) : null}

      {fixtureKey === "ip-positioning" && "report" in fixture ? (
        <div className="space-y-3 text-[13px]">
          <div className="flex flex-wrap gap-2">
            <Chip>{fixture.industry}</Chip>
            <Chip>{fixture.stageLabel}</Chip>
            <Chip>置信度 {Math.round(fixture.report.confidenceScore * 100)}%</Chip>
          </div>
          <SectionTitle>一句话定位</SectionTitle>
          <p className="rounded-xl bg-amber-500/10 p-3 font-medium text-foreground">
            {fixture.report.oneLiner}
          </p>
          <SectionTitle>锐利诊断</SectionTitle>
          <p className="text-muted-foreground">{fixture.report.sharpDiagnosis}</p>
          <SectionTitle>内容支柱</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {fixture.report.contentPillars.map((p) => (
              <Chip key={p}>{p}</Chip>
            ))}
          </div>
          <SectionTitle>30 天行动（节选）</SectionTitle>
          <ul className="space-y-1 text-muted-foreground">
            {fixture.report.thirtyDayPlan.map((w) => (
              <li key={w.week}>
                <strong className="text-foreground">{w.week}：</strong>
                {w.actions.join("；")}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {fixtureKey === "copywriting" && "scriptReady" in fixture ? (
        <div className="space-y-3">
          <Chip>{fixture.agentName}</Chip>
          <div className="space-y-2">
            {fixture.messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "rounded-xl px-3 py-2 text-[13px] whitespace-pre-wrap",
                  m.role === "user"
                    ? "ml-6 bg-primary/10 text-foreground"
                    : "mr-6 bg-muted text-muted-foreground",
                )}
              >
                <span className="mb-1 block text-[10px] font-semibold uppercase opacity-60">
                  {m.role === "user" ? "用户" : "助手"}
                </span>
                {m.content}
              </div>
            ))}
          </div>
          <SectionTitle>可带去拍视频的口播稿</SectionTitle>
          <p className="rounded-xl border border-border/60 bg-background p-3 text-[13px] leading-relaxed">
            {fixture.scriptReady}
          </p>
        </div>
      ) : null}

      {fixtureKey === "copywriting-extract" && "text" in fixture ? (
        <div className="space-y-3 text-[13px]">
          <div className="flex flex-wrap gap-2">
            <Chip>{fixture.source}</Chip>
            <Chip>
              <Clock className="mr-1 inline h-3 w-3" />
              {fixture.duration}s
            </Chip>
          </div>
          <SectionTitle>{fixture.title}</SectionTitle>
          <p className="text-[12px] text-muted-foreground break-all">{fixture.url}</p>
          <p className="rounded-xl bg-muted/60 p-3 leading-relaxed">{fixture.text}</p>
        </div>
      ) : null}

      {fixtureKey === "dh-video-v2" && "scriptPlan" in fixture ? (
        <div className="space-y-3 text-[13px]">
          <div className="flex flex-wrap gap-2">
            {fixture.stageLabels.map((s) => (
              <Chip key={s}>{s}</Chip>
            ))}
            <Chip>{fixture.aspectRatio}</Chip>
            <Chip>{fixture.audioLabel}</Chip>
          </div>
          <SectionTitle>口播文案</SectionTitle>
          <p className="text-muted-foreground leading-relaxed">{fixture.script}</p>
          <SectionTitle>分镜（{fixture.scriptPlan.segment_count} 段）</SectionTitle>
          <div className="space-y-2">
            {fixture.scriptPlan.segments.map((seg) => (
              <div key={seg.index} className="rounded-xl border border-border/50 p-3">
                <p className="mb-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                  段 {seg.index + 1} · {seg.time_range}
                </p>
                <p className="text-foreground">{seg.dialogue}</p>
                <p className="mt-1 text-[12px] text-muted-foreground">{seg.shot_details}</p>
              </div>
            ))}
          </div>
          <SectionTitle>成片预览（静态占位）</SectionTitle>
          <div className="relative aspect-[9/16] max-w-[180px] overflow-hidden rounded-xl border bg-muted">
            <DemoImg src={fixture.coverUrl} alt="示例封面" className="object-contain p-4" />
          </div>
        </div>
      ) : null}

      {fixtureKey === "image-video" && "imageCount" in fixture ? (
        <div className="space-y-3 text-[13px]">
          <div className="flex flex-wrap gap-2">
            <Chip>{fixture.imageCount} 张图</Chip>
            <Chip>{fixture.audioLabel}</Chip>
          </div>
          <p className="text-muted-foreground">{fixture.script}</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {fixture.imageUrls.slice(0, 4).map((src, i) => (
              <div key={i} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-muted">
                <DemoImg src={src} alt="" className="object-cover" />
              </div>
            ))}
            <span className="flex h-16 items-center text-[12px] text-muted-foreground">
              +{Math.max(0, fixture.imageCount - 4)}
            </span>
          </div>
        </div>
      ) : null}

      {fixtureKey === "mashup" && "videoCount" in fixture ? (
        <div className="space-y-2 text-[13px]">
          <div className="flex flex-wrap gap-2">
            <Chip>{fixture.videoCount} 段视频</Chip>
            <Chip>{fixture.audioLabel}</Chip>
          </div>
          <p className="text-muted-foreground">{fixture.script}</p>
        </div>
      ) : null}

      {fixtureKey === "promo-video" && "frameUrls" in fixture ? (
        <div className="space-y-3 text-[13px]">
          <SectionTitle>产品描述</SectionTitle>
          <p>{fixture.productPrompt}</p>
          <SectionTitle>分镜帧（示意）</SectionTitle>
          <div className="flex gap-2">
            {fixture.frameUrls.map((src, i) => (
              <div key={i} className="relative h-20 w-20 overflow-hidden rounded-lg border bg-muted">
                <DemoImg src={src} alt="" className="object-cover" />
              </div>
            ))}
          </div>
          <SectionTitle>运镜提示词</SectionTitle>
          <p className="text-muted-foreground">{fixture.videoPrompt}</p>
        </div>
      ) : null}

      {fixtureKey === "video-history" && "records" in fixture ? (
        <div className="space-y-2">
          {fixture.records.map((r) => (
            <div
              key={r.id}
              className="flex items-center gap-3 rounded-xl border border-border/50 p-2.5"
            >
              <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                <DemoImg
                  src={r.coverUrl || "/brand-logo.png"}
                  alt=""
                  className="object-contain p-1"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium">{r.script}</p>
                <p className="text-[11px] text-muted-foreground">
                  来源 {r.source ?? "unknown"} · {r.status}
                </p>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {fixtureKey === "geo-knowledge" && "companyName" in fixture ? (
        <div className="space-y-3 text-[13px]">
          <SectionTitle>{fixture.companyName}</SectionTitle>
          <Chip>{fixture.industry}</Chip>
          <p className="text-muted-foreground">{fixture.skillSummary}</p>
          <SectionTitle>产品</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {fixture.products.map((p) => (
              <Chip key={p}>{p}</Chip>
            ))}
          </div>
          <SectionTitle>已入库文档</SectionTitle>
          <ul className="space-y-1 text-muted-foreground">
            {fixture.docNames.map((d) => (
              <li key={d} className="flex items-center gap-2">
                <FileText className="h-3.5 w-3.5" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {fixtureKey === "geo-matrix" && "cells" in fixture ? (
        <div className="space-y-3 text-[13px]">
          <SectionTitle>{fixture.projectName}</SectionTitle>
          <div className="flex flex-wrap gap-1.5">
            {fixture.platforms.map((p) => (
              <Chip key={p}>{p}</Chip>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] border-collapse text-left text-[12px]">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="py-1.5 pr-2 font-medium">日</th>
                  <th className="py-1.5 pr-2 font-medium">平台</th>
                  <th className="py-1.5 pr-2 font-medium">标题</th>
                  <th className="py-1.5 font-medium">意图</th>
                </tr>
              </thead>
              <tbody>
                {fixture.cells.map((c) => (
                  <tr key={`${c.day}-${c.platform}`} className="border-b border-border/40">
                    <td className="py-1.5 pr-2">D{c.day}</td>
                    <td className="py-1.5 pr-2">{c.platform}</td>
                    <td className="py-1.5 pr-2">{c.title}</td>
                    <td className="py-1.5">{c.geoIntent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {fixtureKey === "geo-article" && "markdown" in fixture ? (
        <div className="space-y-3 text-[13px]">
          <div className="flex flex-wrap gap-2">
            <Chip>{fixture.platform}</Chip>
            <Chip>GEO 分 {fixture.score}</Chip>
          </div>
          <SectionTitle>{fixture.title}</SectionTitle>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-muted/50 p-3 text-[12px] leading-relaxed text-muted-foreground">
            {fixture.markdown}
          </pre>
        </div>
      ) : null}

      {fixtureKey === "agent-center" && "role" in fixture ? (
        <div className="space-y-3">
          <div>
            <p className="text-[14px] font-semibold">{fixture.agentName}</p>
            <p className="text-[12px] text-muted-foreground">{fixture.role}</p>
          </div>
          {fixture.messages.map((m, i) => (
            <div
              key={i}
              className={cn(
                "rounded-xl px-3 py-2 text-[13px]",
                m.role === "user" ? "bg-primary/10" : "bg-muted text-muted-foreground",
              )}
            >
              {m.content}
            </div>
          ))}
        </div>
      ) : null}

      {fixtureKey === "credit" && "balance" in fixture ? (
        <div className="space-y-3 text-[13px]">
          <p>
            演示余额：
            <strong className="ml-1 text-[18px] text-amber-600">{fixture.balance}</strong> 积分
          </p>
          <SectionTitle>示例流水</SectionTitle>
          <ul className="space-y-1.5">
            {fixture.sampleLedger.map((row, i) => (
              <li key={i} className="flex justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2">
                <span>
                  {row.type} · {row.note}
                </span>
                <span className={row.amount >= 0 ? "text-emerald-600" : "text-rose-600"}>
                  {row.amount >= 0 ? "+" : ""}
                  {row.amount}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[12px] text-muted-foreground">{fixture.sampleCodeHint}</p>
        </div>
      ) : null}

      {fixtureKey === "settings" && "tips" in fixture ? (
        <ul className="space-y-2 text-[13px] text-muted-foreground">
          {fixture.tips.map((t) => (
            <li key={t} className="flex gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
              {t}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}

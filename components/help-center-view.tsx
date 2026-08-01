"use client"

import * as React from "react"
import {
  BookOpen,
  CheckCircle2,
  Circle,
  Clock,
  Compass,
  HelpCircle,
  LifeBuoy,
  Play,
  Route,
  Sparkles,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTutorialOptional } from "@/components/tutorial/tutorial-provider"
import { TutorialDemoPanel } from "@/components/tutorial/demo-panel"
import { TUTORIAL_FAQ } from "@/lib/tutorial/faq"
import { TUTORIAL_GLOSSARY } from "@/lib/tutorial/glossary"
import {
  listModuleScenarios,
  listWorkflowHubScenarios,
} from "@/lib/tutorial/scenarios"
import {
  TUTORIAL_MODULE_LABELS,
  type TutorialScenario,
} from "@/lib/tutorial/types"
import { isScenarioCompleted, completionRatio } from "@/lib/tutorial/progress-store"
import type { TutorialFixtureMap } from "@/lib/tutorial/fixtures"
import { cn } from "@/lib/utils"

type TabId = "workflows" | "modules" | "glossary" | "faq"

function WorkflowCard({
  scenario,
  completed,
  onStart,
  onDemo,
}: {
  scenario: TutorialScenario
  completed: boolean
  onStart: () => void
  onDemo?: () => void
}) {
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm transition-colors",
        completed && "border-emerald-500/30 bg-emerald-500/5",
      )}
      data-tutorial-id={`scenario-${scenario.id}`}
    >
      {scenario.flowchart ? (
        <div className="relative max-h-36 overflow-hidden border-b border-border/40 bg-muted/40">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={scenario.flowchart}
            alt=""
            className="h-36 w-full object-cover object-top"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-medium text-muted-foreground">
              {scenario.docSection ?? TUTORIAL_MODULE_LABELS[scenario.module]} · 约{" "}
              {scenario.estimatedMinutes} 分钟 · {scenario.steps.length} 步
            </p>
            <h3 className="text-[15px] font-semibold text-foreground">{scenario.title}</h3>
          </div>
          {completed ? (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-label="已完成" />
          ) : (
            <Circle className="h-5 w-5 shrink-0 text-muted-foreground/40" aria-label="未完成" />
          )}
        </div>
        {scenario.applicableWhen ? (
          <p className="mb-2 text-[12px] leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground/80">适用：</span>
            {scenario.applicableWhen}
          </p>
        ) : null}
        <p className="mb-3 flex-1 text-[13px] leading-relaxed text-muted-foreground">
          {scenario.description}
        </p>
        <p className="mb-2 text-[12px] text-foreground/80">
          <span className="font-medium">目标：</span>
          {scenario.goal}
        </p>
        {scenario.finalOutcomes && scenario.finalOutcomes.length > 0 ? (
          <ul className="mb-3 space-y-1">
            {scenario.finalOutcomes.slice(0, 4).map((o) => (
              <li key={o} className="flex gap-1.5 text-[11px] text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
                {o}
              </li>
            ))}
          </ul>
        ) : null}
        {scenario.creditHints && scenario.creditHints.length > 0 ? (
          <div className="mb-3 rounded-lg bg-muted/60 px-2.5 py-2 text-[11px] text-muted-foreground">
            真实使用约：
            {scenario.creditHints.map((h) => `${h.costLabel}（${h.note}）`).join("；")}
            。教程示例不扣费。
          </div>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            className="gap-1 bg-amber-600 hover:bg-amber-700"
            onClick={onStart}
          >
            <Play className="h-3.5 w-3.5" />
            {completed ? "重新学习" : "开始引导"}
          </Button>
          {scenario.fixtureKey && onDemo ? (
            <Button type="button" size="sm" variant="outline" onClick={onDemo}>
              查看已保存示例
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  )
}

function ModuleCard({
  scenario,
  completed,
  onStart,
  onDemo,
}: {
  scenario: TutorialScenario
  completed: boolean
  onStart: () => void
  onDemo?: () => void
}) {
  return (
    <article
      className={cn(
        "flex flex-col rounded-xl border border-border/60 bg-card p-3 shadow-sm",
        completed && "border-emerald-500/30 bg-emerald-500/5",
      )}
      data-tutorial-id={`scenario-${scenario.id}`}
    >
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-muted-foreground">
            {TUTORIAL_MODULE_LABELS[scenario.module]} · 约 {scenario.estimatedMinutes} 分钟
          </p>
          <h3 className="text-[14px] font-semibold leading-snug text-foreground">
            {scenario.title}
          </h3>
        </div>
        {completed ? (
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
        ) : (
          <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" />
        )}
      </div>
      <p className="mb-2.5 line-clamp-2 flex-1 text-[12px] leading-relaxed text-muted-foreground">
        {scenario.description}
      </p>
      <div className="mt-auto flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          className="h-8 gap-1 bg-amber-600 px-2.5 text-[12px] hover:bg-amber-700"
          onClick={onStart}
        >
          <Play className="h-3.5 w-3.5" />
          {completed ? "重新学习" : "开始引导"}
        </Button>
        {scenario.fixtureKey && onDemo ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 px-2.5 text-[12px]"
            onClick={onDemo}
          >
            查看示例
          </Button>
        ) : null}
      </div>
    </article>
  )
}

export function HelpCenterView() {
  const tutorial = useTutorialOptional()
  const [tab, setTab] = React.useState<TabId>("workflows")
  const [previewFixture, setPreviewFixture] = React.useState<keyof TutorialFixtureMap | null>(
    null,
  )

  const workflowScenarios = listWorkflowHubScenarios()
  const moduleScenarios = listModuleScenarios()
  const progress = tutorial?.progress
  const completedCount = progress?.completedScenarios.length ?? 0
  const total = tutorial?.totalScenarios ?? workflowScenarios.length + moduleScenarios.length
  const ratio = progress ? completionRatio(progress, total) : 0

  const prep = workflowScenarios.filter((s) => s.kind === "prep")
  const cores = workflowScenarios.filter((s) => s.kind === "workflow")

  const start = (id: string) => {
    tutorial?.startScenario(id)
  }

  const openDemo = (scenario: TutorialScenario) => {
    if (!scenario.fixtureKey) return
    const key = scenario.fixtureKey as keyof TutorialFixtureMap
    setPreviewFixture(key)
    tutorial?.openDemoPanel(key)
  }

  const tabs: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] =
    [
      { id: "workflows", label: "工作流", icon: Route },
      { id: "modules", label: "按功能查找", icon: BookOpen },
      { id: "glossary", label: "术语表", icon: Sparkles },
      { id: "faq", label: "常见问题", icon: HelpCircle },
    ]

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-auto bg-background"
      data-tutorial-id="help-center"
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
        <header className="mb-6">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <LifeBuoy className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">教程中心</h1>
              <p className="text-[13px] text-muted-foreground">
                按工作流成果引导 · 零算力示例 · 对齐《AI 中台使用教程-工作流版》
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card p-4">
            <div className="mb-2 flex items-center justify-between gap-2 text-[13px]">
              <span className="font-medium text-foreground">学习进度</span>
              <span className="text-muted-foreground">
                {completedCount}/{total} 课
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-amber-500 transition-all"
                style={{ width: `${Math.round(ratio * 100)}%` }}
              />
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[12px] text-muted-foreground">
              <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
              建议顺序：开始前准备 → 账号定位与内容方向 → 任选一条视频生产线（或 GEO）→ 成品管理。
            </p>
          </div>
        </header>

        <div className="mb-5 flex flex-wrap gap-1.5">
          {tabs.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        {tab === "workflows" ? (
          <section className="space-y-8">
            {prep.length > 0 ? (
              <div>
                <h2 className="mb-3 flex items-center gap-2 text-[15px] font-semibold">
                  <Clock className="h-4 w-4 text-amber-500" />
                  开始前准备
                </h2>
                <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                  {prep.map((s) => (
                    <WorkflowCard
                      key={s.id}
                      scenario={s}
                      completed={progress ? isScenarioCompleted(progress, s.id) : false}
                      onStart={() => start(s.id)}
                      onDemo={s.fixtureKey ? () => openDemo(s) : undefined}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <h2 className="mb-3 text-[15px] font-semibold">六条成果工作流</h2>
              <p className="mb-4 text-[13px] text-muted-foreground">
                不按菜单逐项介绍，而是围绕「最终能交付什么」逐步引导。全程可看已保存示例，不扣积分。
              </p>
              <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
                {cores.map((s) => (
                  <WorkflowCard
                    key={s.id}
                    scenario={s}
                    completed={progress ? isScenarioCompleted(progress, s.id) : false}
                    onStart={() => start(s.id)}
                    onDemo={s.fixtureKey ? () => openDemo(s) : undefined}
                  />
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {tab === "modules" ? (
          <section className="space-y-3">
            <p className="text-[13px] text-muted-foreground">
              按侧栏功能快速打开短示例；完整步骤请优先用「工作流」Tab。
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {moduleScenarios.map((s) => (
                <ModuleCard
                  key={s.id}
                  scenario={s}
                  completed={progress ? isScenarioCompleted(progress, s.id) : false}
                  onStart={() => start(s.id)}
                  onDemo={s.fixtureKey ? () => openDemo(s) : undefined}
                />
              ))}
            </div>
          </section>
        ) : null}

        {tab === "glossary" ? (
          <section className="space-y-3">
            {TUTORIAL_GLOSSARY.map((g) => (
              <article key={g.term} className="rounded-2xl border border-border/60 bg-card p-4">
                <h3 className="text-[14px] font-semibold text-foreground">{g.term}</h3>
                {g.aliases?.length ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    又称：{g.aliases.join("、")}
                  </p>
                ) : null}
                <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">
                  {g.definition}
                </p>
              </article>
            ))}
          </section>
        ) : null}

        {tab === "faq" ? (
          <section className="space-y-3">
            {TUTORIAL_FAQ.map((item) => (
              <details
                key={item.id}
                className="group rounded-2xl border border-border/60 bg-card p-4"
              >
                <summary className="cursor-pointer list-none text-[14px] font-semibold text-foreground marker:content-none">
                  <span className="flex items-start gap-2">
                    <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-500" />
                    {item.question}
                  </span>
                </summary>
                <p className="mt-2 pl-6 text-[13px] leading-relaxed text-muted-foreground">
                  {item.answer}
                </p>
              </details>
            ))}
          </section>
        ) : null}

        {previewFixture ? (
          <div className="mt-8">
            <TutorialDemoPanel
              fixtureKey={previewFixture}
              onClose={() => {
                setPreviewFixture(null)
                tutorial?.closeDemoPanel()
              }}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

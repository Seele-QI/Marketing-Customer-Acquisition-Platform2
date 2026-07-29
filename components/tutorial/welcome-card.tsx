"use client"

import { BookOpen, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTutorialOptional } from "@/components/tutorial/tutorial-provider"

/** 工作台首次访问轻量入口 */
export function TutorialWelcomeCard() {
  const tutorial = useTutorialOptional()
  if (!tutorial) return null
  if (!tutorial.progressReady) return null
  if (tutorial.progress.dismissedWelcomeAt) return null
  if (tutorial.progress.completedScenarios.length > 0) return null

  return (
    <div
      data-tutorial-id="tutorial-welcome"
      className="mb-4 flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300">
          <BookOpen className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[14px] font-semibold text-foreground">第一次用？先看零算力教程</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            已保存示例可浏览全流程，不调用 AI、不扣积分。约 12 分钟走完主路径。
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="bg-amber-600 hover:bg-amber-700"
          onClick={() => {
            tutorial.dismissWelcome()
            tutorial.startScenario("wf-prep")
          }}
        >
          开始学习
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => tutorial.dismissWelcome()}
          aria-label="关闭欢迎提示"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

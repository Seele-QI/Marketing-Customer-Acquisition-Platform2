"use client"

import { useTutorialOptional } from "@/components/tutorial/tutorial-provider"
import { TutorialDemoPanel } from "@/components/tutorial/demo-panel"
import type { TutorialFixtureMap } from "@/lib/tutorial/fixtures"

/**
 * 全局挂载：引导步骤触发 showDemo 时，在内容区顶部展示只读示例
 * （帮助中心内也可就地预览）
 */
export function TutorialDemoHost({ activeView }: { activeView: string }) {
  const tutorial = useTutorialOptional()
  if (!tutorial?.demoPanelOpen || !tutorial.activeFixtureKey) return null
  if (activeView === "帮助中心") return null

  const key = tutorial.activeFixtureKey as keyof TutorialFixtureMap

  return (
    <div className="shrink-0 border-b border-amber-500/20 bg-amber-500/5 px-4 py-3 sm:px-6">
      <div className="mx-auto max-w-4xl">
        <TutorialDemoPanel fixtureKey={key} onClose={() => tutorial.closeDemoPanel()} />
      </div>
    </div>
  )
}

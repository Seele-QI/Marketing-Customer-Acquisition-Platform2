"use client"

import { BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useTutorialOptional } from "@/components/tutorial/tutorial-provider"
import { getScenarioForView } from "@/lib/tutorial/scenarios"

type Props = {
  /** 当前模块 view key */
  view: string
  className?: string
}

/** 各业务页右上角「查看本模块示例」 */
export function ModuleTutorialButton({ view, className }: Props) {
  const tutorial = useTutorialOptional()
  const scenario = getScenarioForView(view)
  if (!tutorial || !scenario?.fixtureKey) return null

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={className}
      data-tutorial-id={`module-demo-${scenario.module}`}
      onClick={() => {
        tutorial.openDemoPanel(scenario.fixtureKey as string)
      }}
    >
      <BookOpen className="mr-1.5 h-3.5 w-3.5" />
      查看已保存示例
    </Button>
  )
}

"use client"

/**
 * TutorialProvider — 挂载于 app/page.tsx
 * 负责：场景启停、步骤推进、导航回调、demo 模式守卫
 */

import * as React from "react"
import {
  getTutorialScenario,
  TUTORIAL_SCENARIOS,
} from "@/lib/tutorial/scenarios"
import {
  dismissTutorialWelcome,
  initialTutorialProgress,
  loadTutorialProgress,
  markScenarioCompleted,
  saveTutorialStepCursor,
} from "@/lib/tutorial/progress-store"
import type { TutorialProgress } from "@/lib/tutorial/types"
import {
  installTutorialFetchGuard,
  setTutorialDemoMode,
  uninstallTutorialFetchGuard,
} from "@/lib/tutorial/demo-mode"
import type { TutorialScenario, TutorialStep } from "@/lib/tutorial/types"
import { TutorialOverlay } from "@/components/tutorial/tutorial-overlay"

export type TutorialNavigateFn = (view: string) => void
export type TutorialOpenAgentFn = (
  name: string,
  meta?: { avatarUrl?: string; role?: string; copywriting?: boolean },
) => void

type TutorialContextValue = {
  progress: TutorialProgress
  progressReady: boolean
  activeScenario: TutorialScenario | null
  stepIndex: number
  currentStep: TutorialStep | null
  isDemoMode: boolean
  activeFixtureKey: string | null
  /** 演示面板是否展开（模块内「查看已保存示例」） */
  demoPanelOpen: boolean
  startScenario: (scenarioId: string) => void
  exitScenario: () => void
  nextStep: () => void
  prevStep: () => void
  goToStep: (index: number) => void
  completeScenario: () => void
  openDemoPanel: (fixtureKey: string, scenarioId?: string) => void
  closeDemoPanel: () => void
  refreshProgress: () => void
  dismissWelcome: () => void
  totalScenarios: number
}

const TutorialContext = React.createContext<TutorialContextValue | null>(null)

export function useTutorial(): TutorialContextValue {
  const ctx = React.useContext(TutorialContext)
  if (!ctx) {
    throw new Error("useTutorial must be used within TutorialProvider")
  }
  return ctx
}

/** 可选：不在 Provider 内时返回 null（如测试） */
export function useTutorialOptional(): TutorialContextValue | null {
  return React.useContext(TutorialContext)
}

type Props = {
  children: React.ReactNode
  onNavigate: TutorialNavigateFn
  onOpenAgent?: TutorialOpenAgentFn
}

export function TutorialProvider({ children, onNavigate, onOpenAgent }: Props) {
  const [progress, setProgress] = React.useState<TutorialProgress>(initialTutorialProgress)
  const [progressReady, setProgressReady] = React.useState(false)
  const [activeScenarioId, setActiveScenarioId] = React.useState<string | null>(null)
  const [stepIndex, setStepIndex] = React.useState(0)
  const [demoPanelOpen, setDemoPanelOpen] = React.useState(false)
  const [activeFixtureKey, setActiveFixtureKey] = React.useState<string | null>(null)

  const activeScenario = activeScenarioId
    ? getTutorialScenario(activeScenarioId) ?? null
    : null
  const currentStep = activeScenario?.steps[stepIndex] ?? null
  const isDemoMode = Boolean(activeScenarioId) || demoPanelOpen

  React.useEffect(() => {
    setProgress(loadTutorialProgress())
    setProgressReady(true)
  }, [])

  React.useEffect(() => {
    setTutorialDemoMode(isDemoMode, activeScenarioId)
    if (isDemoMode) {
      installTutorialFetchGuard()
    } else {
      uninstallTutorialFetchGuard()
    }
    return () => {
      setTutorialDemoMode(false, null)
      uninstallTutorialFetchGuard()
    }
  }, [isDemoMode, activeScenarioId])

  const refreshProgress = React.useCallback(() => {
    setProgress(loadTutorialProgress())
    setProgressReady(true)
  }, [])

  const applyStepAction = React.useCallback(
    (step: TutorialStep) => {
      const action = step.action
      if (!action) return
      switch (action.type) {
        case "navigate":
          onNavigate(action.view)
          break
        case "openAgent":
          onOpenAgent?.(action.name, { copywriting: action.copywriting })
          break
        case "showDemo":
          setActiveFixtureKey(action.fixtureKey)
          setDemoPanelOpen(true)
          break
        case "info":
        case "highlight":
        case "waitForClick":
          break
      }
    },
    [onNavigate, onOpenAgent],
  )

  const startScenario = React.useCallback(
    (scenarioId: string) => {
      const scenario = getTutorialScenario(scenarioId)
      if (!scenario) return
      setActiveScenarioId(scenarioId)
      setStepIndex(0)
      setProgress(saveTutorialStepCursor(scenarioId, 0))
      if (scenario.targetView) {
        onNavigate(scenario.targetView)
      }
      const first = scenario.steps[0]
      if (first) {
        // defer so navigate paints first
        queueMicrotask(() => applyStepAction(first))
      }
      if (scenario.fixtureKey) {
        setActiveFixtureKey(scenario.fixtureKey)
      }
    },
    [applyStepAction, onNavigate],
  )

  const exitScenario = React.useCallback(() => {
    setActiveScenarioId(null)
    setStepIndex(0)
    setDemoPanelOpen(false)
    setActiveFixtureKey(null)
    setTutorialDemoMode(false, null)
  }, [])

  const goToStep = React.useCallback(
    (index: number) => {
      if (!activeScenario) return
      const clamped = Math.max(0, Math.min(index, activeScenario.steps.length - 1))
      setStepIndex(clamped)
      setProgress(saveTutorialStepCursor(activeScenario.id, clamped))
      const step = activeScenario.steps[clamped]
      if (step) applyStepAction(step)
    },
    [activeScenario, applyStepAction],
  )

  const nextStep = React.useCallback(() => {
    if (!activeScenario) return
    if (stepIndex >= activeScenario.steps.length - 1) {
      setProgress(markScenarioCompleted(activeScenario.id))
      exitScenario()
      return
    }
    goToStep(stepIndex + 1)
  }, [activeScenario, stepIndex, goToStep, exitScenario])

  const prevStep = React.useCallback(() => {
    if (!activeScenario || stepIndex <= 0) return
    goToStep(stepIndex - 1)
  }, [activeScenario, stepIndex, goToStep])

  const completeScenario = React.useCallback(() => {
    if (!activeScenario) return
    setProgress(markScenarioCompleted(activeScenario.id))
    exitScenario()
  }, [activeScenario, exitScenario])

  const openDemoPanel = React.useCallback((fixtureKey: string, scenarioId?: string) => {
    setActiveFixtureKey(fixtureKey)
    setDemoPanelOpen(true)
    if (scenarioId) {
      setActiveScenarioId(scenarioId)
      setStepIndex(0)
    }
  }, [])

  const closeDemoPanel = React.useCallback(() => {
    setDemoPanelOpen(false)
    if (!activeScenarioId) {
      setActiveFixtureKey(null)
    }
  }, [activeScenarioId])

  const dismissWelcome = React.useCallback(() => {
    setProgress(dismissTutorialWelcome())
  }, [])

  const value = React.useMemo<TutorialContextValue>(
    () => ({
      progress,
      progressReady,
      activeScenario,
      stepIndex,
      currentStep,
      isDemoMode,
      activeFixtureKey,
      demoPanelOpen,
      startScenario,
      exitScenario,
      nextStep,
      prevStep,
      goToStep,
      completeScenario,
      openDemoPanel,
      closeDemoPanel,
      refreshProgress,
      dismissWelcome,
      totalScenarios: TUTORIAL_SCENARIOS.length,
    }),
    [
      progress,
      progressReady,
      activeScenario,
      stepIndex,
      currentStep,
      isDemoMode,
      activeFixtureKey,
      demoPanelOpen,
      startScenario,
      exitScenario,
      nextStep,
      prevStep,
      goToStep,
      completeScenario,
      openDemoPanel,
      closeDemoPanel,
      refreshProgress,
      dismissWelcome,
    ],
  )

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {activeScenario && currentStep ? (
        <TutorialOverlay
          scenario={activeScenario}
          step={currentStep}
          stepIndex={stepIndex}
          onNext={nextStep}
          onPrev={prevStep}
          onExit={exitScenario}
          onComplete={completeScenario}
          onShowDemo={(key) => openDemoPanel(key)}
        />
      ) : null}
    </TutorialContext.Provider>
  )
}

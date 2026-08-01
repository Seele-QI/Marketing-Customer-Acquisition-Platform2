/**
 * 教程进度 — 独立 localStorage，不触碰业务草稿 / 历史 / IP session
 */

import type { TutorialProgress } from "@/lib/tutorial/types"

export const TUTORIAL_PROGRESS_KEY = "agenthub-tutorial-progress-v1"

/** SSR 与客户端首次渲染共用，禁止加入时间、存储或环境相关值。 */
export function initialTutorialProgress(): TutorialProgress {
  return {
    version: 1,
    completedScenarios: [],
    updatedAt: 0,
  }
}

export function defaultTutorialProgress(): TutorialProgress {
  return {
    version: 1,
    completedScenarios: [],
    updatedAt: Date.now(),
  }
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined"
}

export function loadTutorialProgress(): TutorialProgress {
  if (!canUseStorage()) return defaultTutorialProgress()
  try {
    const raw = localStorage.getItem(TUTORIAL_PROGRESS_KEY)
    if (!raw) return defaultTutorialProgress()
    const parsed = JSON.parse(raw) as Partial<TutorialProgress>
    if (parsed.version !== 1) return defaultTutorialProgress()
    return {
      version: 1,
      completedScenarios: Array.isArray(parsed.completedScenarios)
        ? parsed.completedScenarios.filter((id): id is string => typeof id === "string")
        : [],
      lastScenarioId:
        typeof parsed.lastScenarioId === "string" ? parsed.lastScenarioId : undefined,
      lastStepIndex:
        typeof parsed.lastStepIndex === "number" ? parsed.lastStepIndex : undefined,
      dismissedWelcomeAt:
        typeof parsed.dismissedWelcomeAt === "number"
          ? parsed.dismissedWelcomeAt
          : undefined,
      updatedAt: typeof parsed.updatedAt === "number" ? parsed.updatedAt : Date.now(),
    }
  } catch {
    return defaultTutorialProgress()
  }
}

export function saveTutorialProgress(patch: Partial<TutorialProgress>): TutorialProgress {
  const current = loadTutorialProgress()
  const next: TutorialProgress = {
    ...current,
    ...patch,
    version: 1,
    completedScenarios: patch.completedScenarios ?? current.completedScenarios,
    updatedAt: Date.now(),
  }
  if (!canUseStorage()) return next
  try {
    localStorage.setItem(TUTORIAL_PROGRESS_KEY, JSON.stringify(next))
  } catch {
    /* quota / private mode — ignore */
  }
  return next
}

export function markScenarioCompleted(scenarioId: string): TutorialProgress {
  const current = loadTutorialProgress()
  const set = new Set(current.completedScenarios)
  set.add(scenarioId)
  return saveTutorialProgress({
    completedScenarios: [...set],
    lastScenarioId: scenarioId,
    lastStepIndex: undefined,
  })
}

export function saveTutorialStepCursor(
  scenarioId: string,
  stepIndex: number,
): TutorialProgress {
  return saveTutorialProgress({
    lastScenarioId: scenarioId,
    lastStepIndex: stepIndex,
  })
}

export function dismissTutorialWelcome(): TutorialProgress {
  return saveTutorialProgress({ dismissedWelcomeAt: Date.now() })
}

export function clearTutorialProgress(): void {
  if (!canUseStorage()) return
  try {
    localStorage.removeItem(TUTORIAL_PROGRESS_KEY)
  } catch {
    /* ignore */
  }
}

export function isScenarioCompleted(
  progress: TutorialProgress,
  scenarioId: string,
): boolean {
  return progress.completedScenarios.includes(scenarioId)
}

export function completionRatio(
  progress: TutorialProgress,
  totalScenarios: number,
): number {
  if (totalScenarios <= 0) return 0
  return Math.min(1, progress.completedScenarios.length / totalScenarios)
}

export const GUIDE_PROGRESS_STORAGE_KEY = "agenthub-operation-guide-v1"

export type GuideProgressState = {
  version: 1
  cursors: Record<string, number>
  completed: Record<string, boolean>
}

const EMPTY_STATE: GuideProgressState = { version: 1, cursors: {}, completed: {} }

function clampCursor(cursor: number, stepCount: number): number {
  if (stepCount <= 0) return 0
  return Math.max(0, Math.min(Math.trunc(cursor), stepCount - 1))
}

export function parseGuideProgress(raw: string | null): GuideProgressState {
  if (!raw) return { ...EMPTY_STATE, cursors: {}, completed: {} }
  try {
    const value = JSON.parse(raw) as {
      version?: unknown
      cursors?: unknown
      completed?: unknown
    }
    if (
      value.version !== 1 ||
      !value.cursors ||
      typeof value.cursors !== "object" ||
      Array.isArray(value.cursors)
    ) {
      return { ...EMPTY_STATE, cursors: {}, completed: {} }
    }
    const cursors: Record<string, number> = {}
    for (const [view, cursor] of Object.entries(value.cursors)) {
      if (
        typeof view === "string" &&
        view.length <= 120 &&
        typeof cursor === "number" &&
        Number.isFinite(cursor)
      ) {
        cursors[view] = Math.max(0, Math.trunc(cursor))
      }
    }
    const completed: Record<string, boolean> = {}
    if (
      value.completed &&
      typeof value.completed === "object" &&
      !Array.isArray(value.completed)
    ) {
      for (const [view, isCompleted] of Object.entries(value.completed)) {
        if (
          typeof view === "string" &&
          view.length <= 120 &&
          typeof isCompleted === "boolean"
        ) {
          completed[view] = isCompleted
        }
      }
    }
    return { version: 1, cursors, completed }
  } catch {
    return { ...EMPTY_STATE, cursors: {}, completed: {} }
  }
}

export function getGuideCursor(
  state: GuideProgressState,
  view: string,
  stepCount: number,
): number {
  return clampCursor(state.cursors[view] ?? 0, stepCount)
}

export function setGuideCursor(
  state: GuideProgressState,
  view: string,
  cursor: number,
  stepCount: number,
): GuideProgressState {
  if (!view.trim()) return state
  return {
    version: 1,
    cursors: {
      ...state.cursors,
      [view]: clampCursor(cursor, stepCount),
    },
    completed: {
      ...state.completed,
      [view]: false,
    },
  }
}

export function getGuideCompleted(
  state: GuideProgressState,
  view: string,
): boolean {
  return state.completed[view] === true
}

export function setGuideCompleted(
  state: GuideProgressState,
  view: string,
  completed: boolean,
): GuideProgressState {
  if (!view.trim()) return state
  return {
    ...state,
    completed: {
      ...state.completed,
      [view]: completed,
    },
  }
}

export function loadGuideProgress(): GuideProgressState {
  if (typeof window === "undefined") return parseGuideProgress(null)
  return parseGuideProgress(window.localStorage.getItem(GUIDE_PROGRESS_STORAGE_KEY))
}

export function saveGuideProgress(state: GuideProgressState): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(GUIDE_PROGRESS_STORAGE_KEY, JSON.stringify(state))
}

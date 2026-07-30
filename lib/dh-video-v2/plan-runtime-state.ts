let activePlanRequests = 0

export function getPlanRuntimeState(): {
  active: boolean
  active_count: number
} {
  return {
    active: activePlanRequests > 0,
    active_count: activePlanRequests,
  }
}

export async function withActivePlanRequest<T>(run: () => Promise<T>): Promise<T> {
  activePlanRequests += 1
  try {
    return await run()
  } finally {
    activePlanRequests = Math.max(0, activePlanRequests - 1)
  }
}

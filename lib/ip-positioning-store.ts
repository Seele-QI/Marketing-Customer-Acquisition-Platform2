/**
 * 身份定位板块 — localStorage 会话持久化（向导进度 / 报告 / 素材引用）
 * 文档本体存 workflow-asset-store (IndexedDB)
 */
import type {
  IpPositioningIntake,
  IpPositioningReport,
} from "@/lib/ip-positioning-schema"
import { EMPTY_INTAKE } from "@/lib/ip-positioning-schema"
import type { StageId } from "@/lib/ip-positioning-skill"

export const IP_POSITIONING_SESSION_KEY = "ip-positioning-session-v1"

export type IpPositioningFileRef = {
  id: string
  name: string
  mime: string
  size: number
}

export type IpPositioningSession = {
  wizardStep: number
  intake: IpPositioningIntake
  fileRefs: IpPositioningFileRef[]
  report: IpPositioningReport | null
  stage: StageId | null
  updatedAt: number
}

export function defaultIpPositioningSession(): IpPositioningSession {
  return {
    wizardStep: 0,
    intake: { ...EMPTY_INTAKE },
    fileRefs: [],
    report: null,
    stage: null,
    updatedAt: Date.now(),
  }
}

export function loadIpPositioningSession(): IpPositioningSession | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(IP_POSITIONING_SESSION_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<IpPositioningSession> & { modelId?: unknown }
    const { modelId: legacyModelId, ...current } = parsed
    void legacyModelId
    return {
      ...defaultIpPositioningSession(),
      ...current,
      intake: { ...EMPTY_INTAKE, ...current.intake },
      fileRefs: Array.isArray(current.fileRefs) ? current.fileRefs : [],
    }
  } catch {
    return null
  }
}

export function saveIpPositioningSession(
  patch: Partial<Omit<IpPositioningSession, "updatedAt">>,
): void {
  if (typeof window === "undefined") return
  try {
    const prev = loadIpPositioningSession() ?? defaultIpPositioningSession()
    const next: IpPositioningSession = {
      ...prev,
      ...patch,
      intake: patch.intake ? { ...prev.intake, ...patch.intake } : prev.intake,
      fileRefs: patch.fileRefs ?? prev.fileRefs,
      updatedAt: Date.now(),
    }
    localStorage.setItem(IP_POSITIONING_SESSION_KEY, JSON.stringify(next))
  } catch {
    /* quota */
  }
}

export function clearIpPositioningSession(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(IP_POSITIONING_SESSION_KEY)
  } catch {
    /* silent */
  }
}

/** 数字人视频创作（新）— 模块级 UI 主题 */

import type { WorkflowAccent } from "@/components/video-workflow-shell"

export type DhV2SurfaceMode = "dark" | "light"
export type DhV2AccentId = "amber" | "rose" | "sky" | "violet"

export type DhV2UiPrefs = {
  surface: DhV2SurfaceMode
  accent: DhV2AccentId
}

export const DH_V2_PREFS_KEY = "dh-v2-ui-prefs"

export const DH_V2_ACCENT_OPTIONS: { id: DhV2AccentId; label: string; dot: string }[] = [
  { id: "amber", label: "琥珀", dot: "bg-amber-500" },
  { id: "rose", label: "玫瑰", dot: "bg-rose-500" },
  { id: "sky", label: "天青", dot: "bg-sky-500" },
  { id: "violet", label: "紫罗兰", dot: "bg-violet-500" },
]

const ACCENT_MAP: Record<DhV2AccentId, WorkflowAccent> = {
  amber: "amber",
  rose: "rose",
  sky: "sky",
  violet: "violet",
}

export type DhV2ThemeTokens = {
  page: string
  pageGlow: string
  grain: string
  title: string
  titleAccent: string
  subtitle: string
  bar: string
  card: string
  cardBorder: string
  fieldLabel: string
  input: string
  muted: string
  tabActive: string
  tabIdle: string
  providerActive: string
  providerIdle: string
  btnPrimary: string
  btnOutline: string
  costCard: string
  slotLabel: string
  slotMuted: string
  slotItem: string
  slotBadge: string
  slotAdd: string
  slotAddHover: string
  slotIcon: string
  slotAddBtn: string
  progressTrack: string
  progressFill: string
  spinner: string
  workflowAccent: WorkflowAccent
}

const ACCENT_BTN: Record<DhV2AccentId, string> = {
  amber: "from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400",
  rose: "from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400",
  sky: "from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400",
  violet: "from-violet-600 to-violet-500 hover:from-violet-500 hover:to-violet-400",
}

const ACCENT_RING: Record<DhV2AccentId, string> = {
  amber: "border-amber-400/50 bg-amber-500/10",
  rose: "border-rose-400/50 bg-rose-500/10",
  sky: "border-sky-400/50 bg-sky-500/10",
  violet: "border-violet-400/50 bg-violet-500/10",
}

const ACCENT_TAB: Record<DhV2AccentId, string> = {
  amber: "border-amber-400/60 bg-amber-500/15 text-amber-100",
  rose: "border-rose-400/60 bg-rose-500/15 text-rose-100",
  sky: "border-sky-400/60 bg-sky-500/15 text-sky-100",
  violet: "border-violet-400/60 bg-violet-500/15 text-violet-100",
}

const ACCENT_BORDER: Record<DhV2AccentId, string> = {
  amber: "border-amber-500/15",
  rose: "border-rose-500/15",
  sky: "border-sky-500/15",
  violet: "border-violet-500/15",
}

const ACCENT_GLOW: Record<DhV2AccentId, string> = {
  amber:
    "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(201,162,39,0.18), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(180,120,40,0.08), transparent)",
  rose:
    "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(244,63,94,0.15), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(190,80,100,0.06), transparent)",
  sky:
    "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(56,189,248,0.15), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(80,140,200,0.06), transparent)",
  violet:
    "radial-gradient(ellipse 80% 50% at 50% -10%, rgba(139,92,246,0.15), transparent), radial-gradient(ellipse 60% 40% at 100% 50%, rgba(120,80,200,0.06), transparent)",
}

const ACCENT_BAR: Record<DhV2AccentId, string> = {
  amber: "bg-amber-500/70",
  rose: "bg-rose-500/70",
  sky: "bg-sky-500/70",
  violet: "bg-violet-500/70",
}

const ACCENT_TITLE: Record<DhV2AccentId, string> = {
  amber: "from-amber-300 to-amber-500",
  rose: "from-rose-300 to-rose-500",
  sky: "from-sky-300 to-sky-500",
  violet: "from-violet-300 to-violet-500",
}

const ACCENT_SLOT: Record<DhV2AccentId, { border: string; badge: string; icon: string; add: string }> = {
  amber: {
    border: "border-amber-500/20",
    badge: "text-amber-300",
    icon: "text-amber-400",
    add: "border-amber-500/25 bg-black/20 hover:border-amber-400/50 hover:bg-amber-500/5",
  },
  rose: {
    border: "border-rose-500/20",
    badge: "text-rose-300",
    icon: "text-rose-400",
    add: "border-rose-500/25 bg-black/20 hover:border-rose-400/50 hover:bg-rose-500/5",
  },
  sky: {
    border: "border-sky-500/20",
    badge: "text-sky-300",
    icon: "text-sky-400",
    add: "border-sky-500/25 bg-black/20 hover:border-sky-400/50 hover:bg-sky-500/5",
  },
  violet: {
    border: "border-violet-500/20",
    badge: "text-violet-300",
    icon: "text-violet-400",
    add: "border-violet-500/25 bg-black/20 hover:border-violet-400/50 hover:bg-violet-500/5",
  },
}

const ACCENT_SLOT_LIGHT: Record<DhV2AccentId, { border: string; badge: string; icon: string; add: string }> = {
  amber: {
    border: "border-amber-300/60",
    badge: "text-amber-700",
    icon: "text-amber-600",
    add: "border-amber-300/50 bg-white hover:border-amber-400 hover:bg-amber-50/50",
  },
  rose: {
    border: "border-rose-300/60",
    badge: "text-rose-700",
    icon: "text-rose-600",
    add: "border-rose-300/50 bg-white hover:border-rose-400 hover:bg-rose-50/50",
  },
  sky: {
    border: "border-sky-300/60",
    badge: "text-sky-700",
    icon: "text-sky-600",
    add: "border-sky-300/50 bg-white hover:border-sky-400 hover:bg-sky-50/50",
  },
  violet: {
    border: "border-violet-300/60",
    badge: "text-violet-700",
    icon: "text-violet-600",
    add: "border-violet-300/50 bg-white hover:border-violet-400 hover:bg-violet-50/50",
  },
}

export function getWorkflowAccent(accent: DhV2AccentId): WorkflowAccent {
  return ACCENT_MAP[accent]
}

export function loadDhV2UiPrefs(fallbackSurface: DhV2SurfaceMode = "dark"): DhV2UiPrefs {
  if (typeof window === "undefined") {
    return { surface: fallbackSurface, accent: "amber" }
  }
  try {
    const raw = localStorage.getItem(DH_V2_PREFS_KEY)
    if (!raw) return { surface: fallbackSurface, accent: "amber" }
    const parsed = JSON.parse(raw) as Partial<DhV2UiPrefs>
    const surface = parsed.surface === "light" ? "light" : "dark"
    const accent =
      parsed.accent && ["amber", "rose", "sky", "violet"].includes(parsed.accent)
        ? (parsed.accent as DhV2AccentId)
        : "amber"
    return { surface, accent }
  } catch {
    return { surface: fallbackSurface, accent: "amber" }
  }
}

export function saveDhV2UiPrefs(prefs: DhV2UiPrefs): void {
  if (typeof window === "undefined") return
  localStorage.setItem(DH_V2_PREFS_KEY, JSON.stringify(prefs))
}

export function getDhV2ThemeTokens(surface: DhV2SurfaceMode, accent: DhV2AccentId): DhV2ThemeTokens {
  const slot = surface === "dark" ? ACCENT_SLOT[accent] : ACCENT_SLOT_LIGHT[accent]
  const isDark = surface === "dark"

  return {
    page: isDark ? "bg-[#0c0b0f] text-amber-50" : "bg-[#f8f6f1] text-slate-800",
    pageGlow: ACCENT_GLOW[accent],
    grain: isDark ? "opacity-[0.04]" : "opacity-[0.02]",
    title: isDark ? "text-amber-50" : "text-slate-900",
    titleAccent: `bg-gradient-to-r ${ACCENT_TITLE[accent]} bg-clip-text text-transparent`,
    subtitle: isDark ? "text-amber-100/45" : "text-slate-500",
    bar: ACCENT_BAR[accent],
    card: isDark ? "bg-black/25 backdrop-blur-md" : "bg-white/90 backdrop-blur-sm shadow-sm",
    cardBorder: ACCENT_BORDER[accent],
    fieldLabel: isDark ? "text-amber-200/70" : "text-slate-600",
    input: isDark
      ? `border-${accent}-500/20 bg-black/30 text-amber-50 focus:border-${accent}-400/60 focus:ring-2 focus:ring-${accent}-500/20`
      : `border-slate-200 bg-white text-slate-800 focus:border-${accent}-400 focus:ring-2 focus:ring-${accent}-500/20`,
    muted: isDark ? "text-amber-100/35" : "text-slate-400",
    tabActive: ACCENT_TAB[accent],
    tabIdle: isDark
      ? `${ACCENT_BORDER[accent]} text-amber-100/50 hover:border-${accent}-400/30`
      : "border-slate-200 text-slate-500 hover:border-slate-300",
    providerActive: ACCENT_RING[accent],
    providerIdle: isDark
      ? `${ACCENT_BORDER[accent]} hover:border-${accent}-400/25`
      : "border-slate-200 hover:border-slate-300",
    btnPrimary: `rounded-full bg-gradient-to-r ${ACCENT_BTN[accent]} text-white`,
    btnOutline: isDark
      ? `rounded-full border-${accent}-500/25 bg-transparent text-amber-100/70`
      : "rounded-full border-slate-300 bg-transparent text-slate-600",
    costCard: isDark
      ? `border-${accent}-500/20 bg-gradient-to-br from-${accent}-500/10 to-transparent`
      : `border-${accent}-200 bg-gradient-to-br from-${accent}-50 to-white`,
    slotLabel: isDark ? `${slot.badge.replace("text-", "text-").split(" ")[0]}/80` : "text-slate-600",
    slotMuted: isDark ? "text-amber-100/40" : "text-slate-400",
    slotItem: `${slot.border} ${isDark ? "bg-black/30" : "bg-white"}`,
    slotBadge: `bg-black/60 ${slot.badge}`,
    slotAdd: slot.add,
    slotAddHover: `border-${accent}-400 bg-${accent}-500/10`,
    slotIcon: slot.icon,
    slotAddBtn: isDark
      ? `border-${accent}-500/30 bg-${accent}-500/10 text-${accent}-200`
      : `border-${accent}-300 bg-${accent}-50 text-${accent}-800`,
    progressTrack: isDark ? `bg-${accent}-950` : "bg-slate-200",
    progressFill: `from-${accent}-600 to-${accent}-400`,
    spinner: `border-${accent}-500/20 border-t-${accent}-400`,
    workflowAccent: ACCENT_MAP[accent],
  }
}

/** 固定 input 类（Tailwind 需完整类名） */
export function getDhV2InputClass(surface: DhV2SurfaceMode, accent: DhV2AccentId): string {
  const base =
    "w-full rounded-lg border px-2.5 py-1.5 text-[12px] outline-none transition focus:ring-2"
  if (surface === "dark") {
    const map: Record<DhV2AccentId, string> = {
      amber:
        "border-amber-500/20 bg-black/30 text-amber-50 focus:border-amber-400/60 focus:ring-amber-500/20",
      rose: "border-rose-500/20 bg-black/30 text-rose-50 focus:border-rose-400/60 focus:ring-rose-500/20",
      sky: "border-sky-500/20 bg-black/30 text-sky-50 focus:border-sky-400/60 focus:ring-sky-500/20",
      violet:
        "border-violet-500/20 bg-black/30 text-violet-50 focus:border-violet-400/60 focus:ring-violet-500/20",
    }
    return `${base} ${map[accent]}`
  }
  const map: Record<DhV2AccentId, string> = {
    amber: "border-slate-200 bg-white text-slate-800 focus:border-amber-400 focus:ring-amber-500/20",
    rose: "border-slate-200 bg-white text-slate-800 focus:border-rose-400 focus:ring-rose-500/20",
    sky: "border-slate-200 bg-white text-slate-800 focus:border-sky-400 focus:ring-sky-500/20",
    violet: "border-slate-200 bg-white text-slate-800 focus:border-violet-400 focus:ring-violet-500/20",
  }
  return `${base} ${map[accent]}`
}

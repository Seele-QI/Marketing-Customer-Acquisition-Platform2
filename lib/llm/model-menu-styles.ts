import type { CSSProperties } from "react"

/** 模型下拉共用：毛玻璃触发器 / 面板 / 选项 */

export const MODEL_MENU_TRIGGER =
  "inline-flex min-w-[140px] items-center gap-1.5 rounded-lg border border-white/50 bg-white/60 px-3 py-1.5 text-[12px] font-medium text-slate-700 shadow-sm backdrop-blur-md transition-colors " +
  "hover:bg-white/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 " +
  "dark:border-white/10 dark:bg-white/10 dark:text-slate-200 dark:hover:bg-white/15"

/**
 * 面板本体（定位由 fixed + getBoundingClientRect 向上展开，避免被 overflow 裁切）
 */
export const MODEL_MENU_PANEL =
  "z-[80] min-w-[160px] overflow-hidden rounded-xl border border-white/40 bg-white/70 py-1 shadow-xl backdrop-blur-xl " +
  "dark:border-white/10 dark:bg-slate-900/70"

export const MODEL_MENU_OPTION =
  "flex w-full items-center px-3 py-2 text-left text-[12px] text-slate-700 transition-colors " +
  "hover:bg-white/50 dark:text-slate-200 dark:hover:bg-white/10"

export const MODEL_MENU_OPTION_SELECTED =
  "bg-primary/10 font-medium text-primary dark:bg-primary/20 dark:text-primary-foreground"

export const MODEL_MENU_OPTION_DISABLED =
  "cursor-not-allowed text-slate-400 hover:bg-transparent dark:text-slate-500 dark:hover:bg-transparent"

/** 触发器上方展开的 fixed 样式 */
export function upwardPanelStyle(trigger: DOMRect): CSSProperties {
  return {
    position: "fixed",
    left: trigger.left,
    bottom: typeof window !== "undefined" ? window.innerHeight - trigger.top + 4 : 0,
    minWidth: Math.max(160, trigger.width),
  }
}

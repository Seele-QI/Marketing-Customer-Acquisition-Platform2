"use client"

import * as React from "react"

export type SwitchNoticeKind = "provider" | "modelSkill" | "enterprise"

export type SwitchNotice = {
  kind: SwitchNoticeKind
  label: string
  id: number
  phase: "enter" | "hold" | "exit"
}

type Listener = (notice: SwitchNotice | null) => void

const FADE_IN_MS = 300
const HOLD_MS = 700
const FADE_OUT_MS = 500

let seq = 0
let timerEnter: ReturnType<typeof setTimeout> | null = null
let timerHold: ReturnType<typeof setTimeout> | null = null
let timerExit: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<Listener>()

function clearTimers() {
  if (timerEnter) clearTimeout(timerEnter)
  if (timerHold) clearTimeout(timerHold)
  if (timerExit) clearTimeout(timerExit)
  timerEnter = timerHold = timerExit = null
}

function emit(notice: SwitchNotice | null) {
  listeners.forEach((fn) => fn(notice))
}

export function switchNoticeMessage(kind: SwitchNoticeKind, label: string): string {
  if (kind === "provider") return `模型已经切换至 ${label}`
  if (kind === "modelSkill") return `模型策略已切换至 ${label}`
  if (!label) return "已取消企业知识库引用"
  return `知识库已切换至 ${label}`
}

/** 触发居中切换提示（连续调用会重置计时，只显示最后一次） */
export function showSwitchNotice(kind: SwitchNoticeKind, label: string) {
  if (typeof window === "undefined") return
  clearTimers()
  const id = ++seq
  emit({ kind, label, id, phase: "enter" })

  timerEnter = setTimeout(() => {
    emit({ kind, label, id, phase: "hold" })
    timerHold = setTimeout(() => {
      emit({ kind, label, id, phase: "exit" })
      timerExit = setTimeout(() => emit(null), FADE_OUT_MS)
    }, HOLD_MS)
  }, FADE_IN_MS)
}

export function useGeoSwitchFlash() {
  return { showSwitchNotice }
}

/** 供 GeoSwitchFlash 订阅当前提示状态 */
export function useSwitchFlashSubscriber(): SwitchNotice | null {
  const [notice, setNotice] = React.useState<SwitchNotice | null>(null)

  React.useEffect(() => {
    listeners.add(setNotice)
    return () => {
      listeners.delete(setNotice)
    }
  }, [])

  return notice
}

export { FADE_IN_MS, FADE_OUT_MS }

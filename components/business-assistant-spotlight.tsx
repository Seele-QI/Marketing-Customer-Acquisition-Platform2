"use client"

import { useEffect, useState } from "react"

import { useBusinessAssistant } from "@/lib/business-assistant/context"

type SpotlightRect = {
  left: number
  top: number
  width: number
  height: number
}

const PADDING = 8

export function BusinessAssistantSpotlight() {
  const assistant = useBusinessAssistant()
  const [rect, setRect] = useState<SpotlightRect | null>(null)

  useEffect(() => {
    const targetId = assistant.highlightTarget
    if (!targetId) {
      setRect(null)
      return
    }

    const selector = `[data-tutorial-id="${CSS.escape(targetId)}"]`
    const element = document.querySelector<HTMLElement>(selector)
    if (!element) {
      assistant.reportTargetMissing(true)
      assistant.clearHighlight()
      return
    }

    assistant.reportTargetMissing(false)
    element.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest",
    })

    const updateRect = () => {
      const next = element.getBoundingClientRect()
      setRect({
        left: Math.max(4, next.left - PADDING),
        top: Math.max(4, next.top - PADDING),
        width: Math.max(24, next.width + PADDING * 2),
        height: Math.max(24, next.height + PADDING * 2),
      })
    }

    const frame = window.requestAnimationFrame(updateRect)
    const settleTimer = window.setTimeout(updateRect, 350)
    const clearTimer = window.setTimeout(assistant.clearHighlight, 6000)
    window.addEventListener("resize", updateRect)
    window.addEventListener("scroll", updateRect, true)

    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(settleTimer)
      window.clearTimeout(clearTimer)
      window.removeEventListener("resize", updateRect)
      window.removeEventListener("scroll", updateRect, true)
    }
  }, [
    assistant.clearHighlight,
    assistant.highlightTarget,
    assistant.reportTargetMissing,
  ])

  if (!assistant.highlightTarget || !rect) return null

  return (
    <div
      className="pointer-events-none fixed z-[55] rounded-2xl border-2 border-blue-500 shadow-[0_0_0_5px_rgba(59,130,246,.18),0_18px_60px_rgba(37,99,235,.28)] transition-all duration-200"
      style={rect}
      aria-hidden="true"
    >
      <span className="absolute -top-8 left-2 rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white shadow-lg">
        当前操作位置
      </span>
    </div>
  )
}

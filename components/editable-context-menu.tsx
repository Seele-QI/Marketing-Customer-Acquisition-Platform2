"use client"

/**
 * 全局文案输入框右键菜单（剪切 / 复制 / 粘贴 / 全选）。
 * 覆盖所有 textarea / 文本 input，并正确驱动 React 受控组件。
 */

import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"

type MenuState = {
  x: number
  y: number
  el: HTMLInputElement | HTMLTextAreaElement
}

function findEditableField(
  target: EventTarget | null,
): HTMLInputElement | HTMLTextAreaElement | null {
  if (!(target instanceof HTMLElement)) return null
  const el = target.closest(
    "textarea, input:not([type=button]):not([type=submit]):not([type=reset]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=color]):not([type=hidden]):not([type=image])",
  )
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return null
  }
  if (el.disabled || el.readOnly) return null
  return el
}

/** 写入受控组件 value，并触发 React onChange */
function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype
  const descriptor = Object.getOwnPropertyDescriptor(proto, "value")
  descriptor?.set?.call(el, value)
  el.dispatchEvent(new Event("input", { bubbles: true }))
  el.dispatchEvent(new Event("change", { bubbles: true }))
}

function insertText(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  el.focus()
  const start = el.selectionStart ?? el.value.length
  const end = el.selectionEnd ?? el.value.length
  const next = el.value.slice(0, start) + text + el.value.slice(end)
  setNativeValue(el, next)
  const caret = start + text.length
  el.setSelectionRange(caret, caret)
}

function deleteSelection(el: HTMLInputElement | HTMLTextAreaElement) {
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  if (start === end) return ""
  const selected = el.value.slice(start, end)
  setNativeValue(el, el.value.slice(0, start) + el.value.slice(end))
  el.setSelectionRange(start, start)
  return selected
}

function getSelection(el: HTMLInputElement | HTMLTextAreaElement) {
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  return el.value.slice(start, end)
}

export function EditableContextMenu() {
  const [menu, setMenu] = React.useState<MenuState | null>(null)
  const menuRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const onContextMenu = (e: MouseEvent) => {
      const el = findEditableField(e.target)
      if (!el) return
      e.preventDefault()
      e.stopPropagation()
      setMenu({
        x: e.clientX,
        y: e.clientY,
        el,
      })
    }

    const onClose = (e: Event) => {
      if (menuRef.current?.contains(e.target as Node)) return
      setMenu(null)
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null)
    }

    document.addEventListener("contextmenu", onContextMenu, true)
    document.addEventListener("mousedown", onClose, true)
    document.addEventListener("scroll", onClose, true)
    window.addEventListener("resize", onClose)
    document.addEventListener("keydown", onKey)
    return () => {
      document.removeEventListener("contextmenu", onContextMenu, true)
      document.removeEventListener("mousedown", onClose, true)
      document.removeEventListener("scroll", onClose, true)
      window.removeEventListener("resize", onClose)
      document.removeEventListener("keydown", onKey)
    }
  }, [])

  const run = React.useCallback(async (action: "cut" | "copy" | "paste" | "selectAll") => {
    if (!menu) return
    const { el } = menu
    el.focus()

    try {
      if (action === "selectAll") {
        el.setSelectionRange(0, el.value.length)
      } else if (action === "copy") {
        const text = getSelection(el)
        if (text) await navigator.clipboard.writeText(text)
      } else if (action === "cut") {
        const text = deleteSelection(el)
        if (text) await navigator.clipboard.writeText(text)
      } else if (action === "paste") {
        const text = await navigator.clipboard.readText()
        if (text) insertText(el, text)
      }
    } catch {
      // 剪贴板权限被拒时尝试 execCommand 回退
      try {
        if (action === "paste") document.execCommand("paste")
        else if (action === "copy") document.execCommand("copy")
        else if (action === "cut") document.execCommand("cut")
        else if (action === "selectAll") document.execCommand("selectAll")
      } catch {
        /* ignore */
      }
    }

    setMenu(null)
  }, [menu])

  if (!menu || typeof document === "undefined") return null

  // 避免贴边溢出
  const left = Math.min(menu.x, window.innerWidth - 140)
  const top = Math.min(menu.y, window.innerHeight - 160)

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className={cn(
        "fixed z-[9999] min-w-[128px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg",
        "dark:border-white/10 dark:bg-slate-900",
      )}
      style={{ left, top }}
    >
      {(
        [
          { id: "cut", label: "剪切" },
          { id: "copy", label: "复制" },
          { id: "paste", label: "粘贴" },
          { id: "selectAll", label: "全选" },
        ] as const
      ).map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className="flex w-full px-3 py-1.5 text-left text-[13px] text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-white/10"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            void run(item.id)
          }}
        >
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}

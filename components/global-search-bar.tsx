"use client"

import * as React from "react"
import { Search } from "lucide-react"
import type { MainView } from "@/components/dashboard-sidebar"
import {
  filterGlobalSearchItems,
  getGlobalSearchRecommendations,
  type GlobalSearchItem,
} from "@/lib/global-search"
import { cn } from "@/lib/utils"

export type GlobalSearchBarProps = {
  onNavigate: (view: MainView) => void
  onOpenAgent: (name: string, meta?: { avatarUrl?: string; role?: string }) => void
  /** 顶栏紧凑样式 vs 智能体中心大号药丸条 */
  variant?: "header" | "hero"
  className?: string
  /** 受控关键词（与 onQueryChange 一起用于同步筛选下方列表等） */
  query?: string
  onQueryChange?: (q: string) => void
  /** 顶栏内实例用于区分 aria id，避免页面上两处搜索冲突 */
  instanceId?: string
}

export function GlobalSearchBar({
  onNavigate,
  onOpenAgent,
  variant = "header",
  className,
  query: controlledQuery,
  onQueryChange,
  instanceId = "default",
}: GlobalSearchBarProps) {
  const [uncontrolled, setUncontrolled] = React.useState("")
  const isControlled = controlledQuery !== undefined
  const query = isControlled ? controlledQuery : uncontrolled
  const setQuery = React.useCallback(
    (q: string) => {
      onQueryChange?.(q)
      if (!isControlled) setUncontrolled(q)
    },
    [isControlled, onQueryChange],
  )

  const [open, setOpen] = React.useState(false)
  const [highlight, setHighlight] = React.useState(0)
  const rootRef = React.useRef<HTMLDivElement>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const hasQuery = query.trim().length > 0
  const listItems = React.useMemo(
    () => (hasQuery ? filterGlobalSearchItems(query) : getGlobalSearchRecommendations()),
    [hasQuery, query],
  )
  const showPanel = open
  /** 有推荐/结果，或正在搜索但无结果（展示空状态文案） */
  const panelVisible = open && (listItems.length > 0 || hasQuery)

  React.useEffect(() => {
    setHighlight(0)
  }, [query])

  React.useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  const applyResult = React.useCallback(
    (item: GlobalSearchItem) => {
      if (item.action.type === "goView") {
        onNavigate(item.action.view)
      } else {
        onOpenAgent(item.action.name, item.action.meta)
      }
      setQuery("")
      setOpen(false)
      inputRef.current?.blur()
    },
    [onNavigate, onOpenAgent, setQuery],
  )

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showPanel || listItems.length === 0) {
      if (e.key === "Escape") setOpen(false)
      return
    }
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setHighlight((i) => (i + 1) % listItems.length)
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight((i) => (i - 1 + listItems.length) % listItems.length)
    } else if (e.key === "Enter") {
      e.preventDefault()
      applyResult(listItems[highlight])
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const kindStyles: Record<GlobalSearchItem["kind"], string> = {
    智能体: "bg-blue-500/12 text-blue-700 dark:text-blue-300",
    模板: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    热点: "bg-orange-500/12 text-orange-800 dark:text-orange-200",
    导航: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
  }

  const listId = `global-search-results-${instanceId}`
  const isHero = variant === "hero"

  return (
    <div ref={rootRef} className={cn("relative w-full", className)}>
      <div className="relative">
        <Search
          className={cn(
            "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground",
            isHero ? "left-5 h-5 w-5" : "left-3 h-4 w-4",
          )}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={panelVisible}
          aria-controls={listId}
          aria-autocomplete="list"
          placeholder="搜索智能体、模板、热点…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className={cn(
            "w-full border border-border/70 bg-card text-foreground outline-none placeholder:text-muted-foreground focus:border-primary/50 focus:ring-2 focus:ring-primary/15",
            isHero
              ? "h-12 rounded-full border-slate-200/90 bg-white pl-12 pr-5 text-[15px] shadow-sm dark:border-border dark:bg-card md:h-14 md:pl-14 md:text-base"
              : "h-9 rounded-full pl-9 pr-3 text-sm",
          )}
        />
      </div>

      {panelVisible ? (
        <div
          id={listId}
          role={listItems.length > 0 ? "listbox" : "status"}
          className={cn(
            "absolute z-50 max-h-[min(70vh,360px)] overflow-y-auto rounded-2xl border border-border/70 bg-popover py-1 text-popover-foreground shadow-lg",
            isHero
              ? "left-0 right-0 top-[calc(100%+10px)]"
              : "right-0 top-[calc(100%+6px)] w-[min(100vw-2rem,420px)]",
          )}
        >
          {!hasQuery ? (
            <div className="px-3 pb-1 pt-2">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                推荐
                <span className="ml-2 font-normal normal-case tracking-normal text-muted-foreground/75">
                  每日随机，次日刷新
                </span>
              </p>
            </div>
          ) : null}
          {hasQuery && listItems.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">
              未找到匹配项，试试智能体名称、文案场景或热点关键词
            </p>
          ) : (
            listItems.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={highlight === index}
                className={cn(
                  "flex w-full flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition-colors",
                  highlight === index ? "bg-accent" : "hover:bg-muted/80",
                )}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => applyResult(item)}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      kindStyles[item.kind],
                    )}
                  >
                    {item.kind}
                  </span>
                  <span className="truncate font-medium text-foreground">{item.title}</span>
                </div>
                {item.subtitle ? (
                  <span className="truncate pl-1 text-xs text-muted-foreground">{item.subtitle}</span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

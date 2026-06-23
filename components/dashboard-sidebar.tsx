"use client"

import * as React from "react"
import {
  Target,
  Lightbulb,
  PenLine,
  Video,
  Users,
  LayoutDashboard,
  LifeBuoy,
  Sparkles,
  ChevronDown,
  ChevronRight,
  Link,
  FileText,
  Bot,
  MapPinned,
  Clapperboard,
  Clock,
  Layers,
  Share2,
  TicketPercent,
  Image,
  Scissors,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { UserMenu } from "@/components/user-menu"

type NavItem = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: string
  iconColor?: string
  iconBg?: string
  children?: {
    label: string
    icon: React.ComponentType<{ className?: string }>
    iconColor?: string
  }[]
}

export type MainView = "工作台" | "文案创作" | string

const mainNav: NavItem[] = [
  { label: "工作台", icon: LayoutDashboard, iconColor: "text-blue-500", iconBg: "bg-blue-500/10" },
  { label: "身份定位", icon: Target, iconColor: "text-rose-500", iconBg: "bg-rose-500/10" },
  { label: "文案创作", icon: PenLine, iconColor: "text-emerald-500", iconBg: "bg-emerald-500/10",
    children: [
      { label: "文案创作", icon: PenLine, iconColor: "text-emerald-500" },
      { label: "文案提取", icon: FileText, iconColor: "text-blue-500" },
    ],
  },
  { label: "视频创作", icon: Clapperboard, badge: "NEW", iconColor: "text-rose-500", iconBg: "bg-rose-500/10",
    children: [
      { label: "视频创作", icon: Clapperboard, iconColor: "text-rose-500" },
      { label: "图文视频", icon: Image, iconColor: "text-emerald-500" },
      { label: "视频混剪", icon: Scissors, iconColor: "text-violet-500" },
      { label: "批量混剪", icon: Layers, iconColor: "text-violet-500" },
      { label: "历史记录", icon: Clock, iconColor: "text-amber-500" },
    ],
  },
  { label: "一键分发", icon: Share2, badge: "NEW", iconColor: "text-sky-500", iconBg: "bg-sky-500/10" },
  { label: "充值兑换", icon: TicketPercent, iconColor: "text-amber-500", iconBg: "bg-amber-500/10" },
  { label: "智能体中心", icon: Bot, iconColor: "text-indigo-500", iconBg: "bg-indigo-500/10" },
  { label: "规划路线", icon: MapPinned, iconColor: "text-orange-500", iconBg: "bg-orange-500/10" },
]

const bottomNav: NavItem[] = [
  { label: "账号绑定", icon: Link, iconColor: "text-blue-500", iconBg: "bg-blue-500/10" },
  { label: "帮助中心", icon: LifeBuoy, iconColor: "text-sky-500", iconBg: "bg-sky-500/10" },
]

type DashboardSidebarProps = {
  active: MainView
  onSelect: (view: MainView) => void
}

export function DashboardSidebar({ active, onSelect }: DashboardSidebarProps) {
  /* Auto-expand groups whose child is currently active */
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    mainNav.forEach((item) => {
      if (item.children?.some((c) => c.label === active)) {
        initial[item.label] = true
      }
    })
    return initial
  })

  /* Keep the group open when active changes to one of its children */
  React.useEffect(() => {
    mainNav.forEach((item) => {
      if (item.children?.some((c) => c.label === active)) {
        setExpanded((prev) => ({ ...prev, [item.label]: true }))
      }
    })
  }, [active])

  const toggleExpand = (label: string) => {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }))
  }

  return (
    <aside className="sticky top-0 hidden h-screen w-[240px] shrink-0 border-r border-sidebar-border bg-sidebar lg:flex lg:flex-col">
      {/* Brand */}
      <div className="flex h-16 items-center gap-2 px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground soft-shadow">
          <Sparkles className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-[15px] font-semibold text-sidebar-foreground">AgentHub</span>
          <span className="text-[11px] text-muted-foreground">AI 智能体中心</span>
        </div>
      </div>

      {/* Section label */}
      <div className="px-5 pb-2 pt-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">主导航</p>
      </div>

      {/* Main Nav */}
      <nav className="flex-1 overflow-y-auto px-3">
        <ul className="flex flex-col gap-1">
          {mainNav.map((item) => {
            const Icon = item.icon
            const hasChildren = item.children && item.children.length > 0
            const isChildActive = hasChildren && item.children!.some(child => child.label === active)
            const isActive = item.label === active || isChildActive
            const isExpanded = expanded[item.label]

            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => {
                    if (hasChildren) {
                      toggleExpand(item.label)
                    } else {
                      onSelect(item.label as MainView)
                    }
                  }}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                    isActive && !hasChildren
                      ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                      isActive && !hasChildren
                        ? "bg-primary text-primary-foreground"
                        : cn(
                            item.iconBg || "bg-sidebar-accent/70", 
                            item.iconColor || "text-primary",
                            "group-hover:opacity-80"
                          )
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span
                    className={cn(
                      "flex-1 truncate",
                      isChildActive &&
                        !isExpanded &&
                        "font-medium text-primary",
                    )}
                  >
                    {item.label}
                  </span>
                  {item.badge ? (
                    <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                      {item.badge}
                    </span>
                  ) : null}
                  {hasChildren && (
                    <span className="text-muted-foreground/50 transition-transform duration-200">
                      {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                  )}
                </button>

                {hasChildren && isExpanded && (
                  <ul className="mt-0.5 flex flex-col gap-0.5 pl-12 pr-3 pb-1">
                    {item.children!.map((child) => {
                      const ChildIcon = child.icon
                      const isCurrentActive = active === child.label
                      return (
                        <li key={child.label}>
                          <button
                            type="button"
                            onClick={() => onSelect(child.label as MainView)}
                            className={cn(
                              "group flex w-full items-center gap-2.5 rounded-full px-3 py-1.5 text-left text-[13px] transition-colors",
                              isCurrentActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                                : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                            )}
                          >
                            <ChildIcon
                              className={cn(
                                "h-4 w-4 shrink-0 transition-colors",
                                isCurrentActive
                                  ? "text-primary"
                                  : (child.iconColor || "text-muted-foreground/60")
                              )}
                            />
                            <span className="flex-1 truncate">{child.label}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>

        <div className="mt-6 px-2 pb-2 pt-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">更多</p>
        </div>
        <ul className="flex flex-col gap-1">
          {bottomNav.map((item) => {
            const Icon = item.icon
            const isBottomActive = active === item.label
            return (
              <li key={item.label}>
                <button
                  type="button"
                  onClick={() => onSelect(item.label as MainView)}
                  className={cn(
                    "group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                    isBottomActive
                      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/60",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg transition-colors group-hover:opacity-80",
                      item.iconBg || "bg-sidebar-accent/70",
                      item.iconColor || "text-primary",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* User menu */}
      <UserMenu />
    </aside>
  )
}

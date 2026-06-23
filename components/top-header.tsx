"use client"

import { Github } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"
import { GlobalSearchBar } from "@/components/global-search-bar"
import { CreditBadge } from "@/components/credit/credit-badge"
import type { MainView } from "@/components/dashboard-sidebar"

const openSourceRepoUrl = (process.env.NEXT_PUBLIC_OPEN_SOURCE_REPO_URL || "").trim()

type TopHeaderProps = {
  currentPage: string
  /** 仅「声音克隆」页内嵌的开源 WebUI 需标明出处，其余业务页不展示 */
  showOpenSourceAttribution?: boolean
  onNavigate: (view: MainView) => void
  onOpenAgent: (name: string, meta?: { avatarUrl?: string; role?: string }) => void
}

export function TopHeader({
  currentPage,
  showOpenSourceAttribution = false,
  onNavigate,
  onOpenAgent,
}: TopHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center gap-4 border-b border-border/60 bg-background/85 px-4 backdrop-blur-md sm:px-6">
      <div className="hidden min-w-0 shrink items-center gap-3 text-sm md:flex">
        <div className="flex min-w-0 items-center gap-2">
          {currentPage.split(" / ").map((segment, i, arr) => (
            <span key={`${segment}-${i}`} className="flex min-w-0 items-center gap-2">
              {i > 0 && <span className="shrink-0 text-muted-foreground/60">/</span>}
              <span
                className={
                  i === arr.length - 1
                    ? "truncate font-medium text-foreground"
                    : "shrink-0 text-muted-foreground"
                }
              >
                {segment}
              </span>
            </span>
          ))}
        </div>
        {showOpenSourceAttribution ? (
          <>
            <span className="shrink-0 text-muted-foreground/40" aria-hidden>
              |
            </span>
            {openSourceRepoUrl ? (
              <a
                href={openSourceRepoUrl}
                target="_blank"
                rel="noopener noreferrer"
                title="查看本页嵌入工具对应的 GitHub 开源仓库"
                className="inline-flex shrink-0 items-center gap-1 text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
              >
                <Github className="h-3.5 w-3.5" aria-hidden />
                <span>GitHub 开源项目</span>
              </a>
            ) : (
              <span
                className="inline-flex shrink-0 items-center gap-1 text-muted-foreground"
                title="本页为第三方开源 TTS WebUI；可在 NEXT_PUBLIC_OPEN_SOURCE_REPO_URL 配置仓库链接"
              >
                <Github className="h-3.5 w-3.5" aria-hidden />
                <span>GitHub 开源项目</span>
              </span>
            )}
          </>
        ) : null}
      </div>

      <GlobalSearchBar
        variant="header"
        instanceId="header"
        onNavigate={onNavigate}
        onOpenAgent={onOpenAgent}
        className="ml-auto flex-1 max-w-md"
      />

      <div className="flex items-center gap-2">
        <CreditBadge />
        <ThemeToggle />
      </div>
    </header>
  )
}

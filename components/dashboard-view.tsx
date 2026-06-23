import { TopBanner } from "@/components/top-banner"
import { DashboardDataPanel } from "@/components/dashboard-data-panel"
import { DashboardQuickActions } from "@/components/dashboard-quick-actions"
import { DashboardAIInsights } from "@/components/dashboard-ai-insights"
import { AgentCard, type AgentCardProps } from "@/components/agent-card"
import { TEAM_AGENTS } from "@/lib/team-agents"
import { ChevronRight } from "lucide-react"

const agents: AgentCardProps[] = TEAM_AGENTS.map((agent) => ({
  name: agent.name,
  role: agent.role,
  description: agent.description,
  avatar: agent.avatar,
  tags: agent.tags,
  status: agent.status,
}))

export type OpenAgentMeta = { avatarUrl?: string; role?: string }

type Props = {
  onOpenAgent?: (agentName: string, meta?: OpenAgentMeta) => void
  onNavigate?: (view: string) => void
}

export function DashboardView({ onOpenAgent, onNavigate }: Props) {
  const handleOpenAgent = (name: string) => {
    if (name.includes("获客脚本") || name.includes("口播脚本") || name.includes("洗稿")) {
      // Copywriting agent — dispatch to copywriting panel
      onNavigate?.("文案创作")
      // Could pre-select the agent via URL param or state in future
      return
    }
    onOpenAgent?.(name)
  }

  return (
    <main className="min-h-0 flex-1 overflow-y-auto bg-gradient-to-br from-slate-50/85 via-sky-50/35 to-white px-4 py-5 sm:px-6 sm:py-6 dark:from-slate-950 dark:via-slate-950/90 dark:to-background">
      <TopBanner />

      {/* ================================================================ */}
      {/*  Main grid: left content + right sidebar                          */}
      {/* ================================================================ */}
      <div className="mt-5 flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:gap-6">
        {/* -------------------- Left Column -------------------- */}
        <div className="flex min-w-0 flex-1 flex-col gap-5">
          {/* 功能一：平台数据看板 */}
          <DashboardDataPanel />

          {/* 功能二：快速创作入口 */}
          <DashboardQuickActions
            onNavigate={(v) => onNavigate?.(v)}
            onOpenAgent={handleOpenAgent}
          />

          {/* 功能三：智能体团队概览（紧凑） */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[16px] font-bold text-foreground">智能体团队</h2>
              <button
                onClick={() => onNavigate?.("智能体中心")}
                className="flex items-center gap-0.5 text-[12px] text-slate-500 hover:text-primary transition-colors"
              >
                查看全部 <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {agents.map((a, i) => (
                <AgentCard
                  key={a.name}
                  variant="compact"
                  index={i}
                  {...a}
                  onCall={() => onOpenAgent?.(a.name, { avatarUrl: a.avatar, role: a.role })}
                />
              ))}
            </div>
          </section>
        </div>

        {/* -------------------- Right Sidebar -------------------- */}
        <div className="w-full shrink-0 lg:sticky lg:top-20 lg:w-[340px] lg:self-start">
          <DashboardAIInsights />
        </div>
      </div>
    </main>
  )
}

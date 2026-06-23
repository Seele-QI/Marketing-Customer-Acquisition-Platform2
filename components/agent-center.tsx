"use client"

import { AgentCard, type AgentCardProps } from "@/components/agent-card"
import { GlobalSearchBar } from "@/components/global-search-bar"
import type { OpenAgentMeta } from "@/components/dashboard-view"
import type { MainView } from "@/components/dashboard-sidebar"
import * as React from "react"
import { TEAM_AGENTS } from "@/lib/team-agents"
import { cn } from "@/lib/utils"

/* ------------------------------------------------------------------ */
/*  Agents data                                                        */
/* ------------------------------------------------------------------ */

const agents: AgentCardProps[] = TEAM_AGENTS.map((agent) => ({
  name: agent.name,
  role: agent.role,
  description: agent.description,
  avatar: agent.avatar,
  tags: agent.tags,
  status: agent.status,
}))

function agentMatchesFilter(query: string, agent: AgentCardProps): boolean {
  const t = query.trim()
  if (!t) return true
  const low = t.toLowerCase()
  const blob = [agent.name, agent.role, agent.description, ...agent.tags].join(" ").toLowerCase()
  return blob.includes(low)
}

type AgentCenterProps = {
  onOpenAgent?: (name: string, meta?: OpenAgentMeta) => void
  onNavigate?: (view: MainView) => void
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function AgentCenter({ onOpenAgent, onNavigate }: AgentCenterProps) {
  const [filterQuery, setFilterQuery] = React.useState("")

  const noopNavigate = React.useCallback((_view: MainView) => {}, [])
  const navigate = onNavigate ?? noopNavigate

  const filteredAgents = React.useMemo(
    () => agents.filter((a) => agentMatchesFilter(filterQuery, a)),
    [filterQuery],
  )

  return (
    <div className="h-full overflow-y-auto bg-slate-100/90 dark:bg-background">
      <div className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8">
        <section className="mx-auto max-w-3xl text-center">
          <h1 className="text-[26px] font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-[28px]">
            选择您的 AI 智能助手
          </h1>
          <p className="mt-2 text-[15px] text-muted-foreground">
            搜索智能体、文案模板与热点；下方列表会随关键词筛选本页团队智能体
          </p>

          <div className="mx-auto mt-8 max-w-2xl">
            <GlobalSearchBar
              variant="hero"
              instanceId="agent-center"
              query={filterQuery}
              onQueryChange={setFilterQuery}
              onNavigate={navigate}
              onOpenAgent={(name, meta) => {
                onOpenAgent?.(name, meta)
              }}
            />
          </div>
        </section>

        <section className="mt-12">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3 border-b border-border/40 pb-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">我的智能体团队</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {filterQuery.trim()
                  ? `与「${filterQuery.trim()}」相关的智能体 · ${filteredAgents.length} 位`
                  : `${agents.length} 位 AI 伙伴随时待命`}
              </p>
            </div>
            {filterQuery.trim() ? (
              <button
                type="button"
                className="text-sm font-medium text-primary hover:underline"
                onClick={() => setFilterQuery("")}
              >
                清空筛选
              </button>
            ) : null}
          </div>

          <div
            className={cn(
              "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4",
              filteredAgents.length === 0 && filterQuery.trim() && "min-h-[200px]",
            )}
          >
            {filteredAgents.map((agent, i) => (
              <AgentCard
                key={agent.name}
                index={i}
                {...agent}
                onCall={
                  onOpenAgent
                    ? () =>
                        onOpenAgent(agent.name, {
                          avatarUrl: agent.avatar,
                          role: agent.role,
                        })
                    : undefined
                }
              />
            ))}
          </div>

          {filteredAgents.length === 0 && filterQuery.trim() ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              没有匹配当前关键词的团队智能体。试试上方下拉中的「模板」「热点」结果，或清空筛选浏览全部。
            </p>
          ) : null}
        </section>
      </div>
    </div>
  )
}

"use client"

import type { OpenAgentMeta } from "@/components/dashboard-view"
import type { MainView } from "@/components/dashboard-sidebar"
import { TeamAgentCenter } from "@/components/agents/team-agent-center"

/* ------------------------------------------------------------------ */
/*  Agents data                                                        */
/* ------------------------------------------------------------------ */

type AgentCenterProps = {
  onOpenAgent?: (name: string, meta?: OpenAgentMeta) => void
  onNavigate?: (view: MainView) => void
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function AgentCenter({ onOpenAgent, onNavigate }: AgentCenterProps) {
  return <TeamAgentCenter onOpenAgent={onOpenAgent} onNavigate={onNavigate} />
}

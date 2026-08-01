import { CheckCircle2, CircleDashed, TriangleAlert, UsersRound } from "lucide-react"

import type { EnterpriseAgentRunResponse } from "@/lib/agents/client"
import { cn } from "@/lib/utils"

export function CollaborationPanel({ run }: { run: EnterpriseAgentRunResponse | null }) {
  if (!run) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700">
        <UsersRound className="mb-3 h-5 w-5" />
        主责部门和最多三位会签部门将在任务开始后显示。
      </div>
    )
  }
  const members = [run.result.primary, ...run.result.cosigners]
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">联合办理</h3>
        <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider", run.result.status === "partial" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
          {run.result.status}
        </span>
      </div>
      {members.map((member) => (
        <div key={`${member.role}-${member.agentId}`} className="flex gap-2.5 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          {member.status === "completed" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : member.status === "failed" ? <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />}
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{member.name} · {member.role === "primary" ? "主责" : "会签"}</p>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">{member.status === "completed" ? member.title : member.error ?? "未完成"}</p>
          </div>
        </div>
      ))}
      {run.result.conflicts.length ? (
        <div className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <p className="font-semibold">保留的专业分歧</p>
          {run.result.conflicts.map((item) => <p key={item} className="mt-1">{item}</p>)}
        </div>
      ) : null}
    </div>
  )
}


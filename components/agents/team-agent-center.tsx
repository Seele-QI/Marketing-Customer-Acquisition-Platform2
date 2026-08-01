"use client"

import Image from "next/image"
import * as React from "react"
import { ArrowRight, Building2, CheckCircle2, Search, ShieldCheck, Sparkles, UsersRound } from "lucide-react"

import type { OpenAgentMeta } from "@/components/dashboard-view"
import type { MainView } from "@/components/dashboard-sidebar"
import { ModuleTutorialButton } from "@/components/tutorial/module-tutorial-button"
import { AGENT_DEFINITIONS } from "@/lib/agents/registry"
import { getSkillCatalogForAgent } from "@/lib/agents/skills"
import type { AgentGroup } from "@/lib/agents/types"
import { cn } from "@/lib/utils"

const GROUPS: Array<{ id: AgentGroup | "all"; label: string }> = [
  { id: "all", label: "全部部门" },
  { id: "governance", label: "治理职能" },
  { id: "product_technology", label: "产品与技术" },
  { id: "market_growth", label: "市场与增长" },
  { id: "delivery", label: "交付与服务" },
  { id: "industry", label: "行业专家" },
]

export function TeamAgentCenter({
  onOpenAgent,
}: {
  onOpenAgent?: (name: string, meta?: OpenAgentMeta) => void
  onNavigate?: (view: MainView) => void
}) {
  const [query, setQuery] = React.useState("")
  const [group, setGroup] = React.useState<(typeof GROUPS)[number]["id"]>("all")
  const coordinator = AGENT_DEFINITIONS[0]
  const roles = React.useMemo(() => {
    const search = query.trim().toLowerCase()
    return AGENT_DEFINITIONS.slice(1).filter((agent) => {
      if (group !== "all" && agent.group !== group) return false
      if (!search) return true
      const skills = getSkillCatalogForAgent(agent.id)
      return [agent.name, agent.title, agent.department, agent.description, ...agent.tags, ...skills.map((skill) => skill.name)]
        .join(" ")
        .toLowerCase()
        .includes(search)
    })
  }, [group, query])

  const open = (agent: (typeof AGENT_DEFINITIONS)[number]) =>
    onOpenAgent?.(agent.name, { avatarUrl: agent.avatar, role: `${agent.title} · ${agent.level}` })

  return (
    <main className="min-h-full overflow-y-auto bg-[#f3f1eb] text-slate-950 dark:bg-[#090d14] dark:text-slate-100">
      <div className="mx-auto max-w-[1480px] px-5 py-7 sm:px-8 lg:px-12 lg:py-10">
        <div className="mb-6 flex items-center justify-between border-b border-slate-300/80 pb-4 dark:border-slate-700">
          <div className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
            <Building2 className="h-4 w-4" /> Enterprise Agent Office
          </div>
          <ModuleTutorialButton view="智能体中心" />
        </div>

        <section className="relative overflow-hidden rounded-[28px] bg-[#101d34] px-6 py-7 text-white shadow-[0_24px_80px_rgba(15,29,52,0.22)] sm:px-9 lg:grid lg:grid-cols-[1.4fr_0.8fr] lg:gap-10 lg:px-12 lg:py-11">
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.13)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.13)_1px,transparent_1px)] [background-size:38px_38px]" />
          <div className="relative z-10">
            <p className="text-xs font-bold tracking-[0.22em] text-blue-300 uppercase">一项任务 · 一个主责 · 有限会签</p>
            <h1 className="mt-4 max-w-3xl font-serif text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              让一家公司真正能协同工作的智能体团队
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300 sm:text-base">
              十个企业通用部门、四位 AI 内容行业专家与一位总协调官。专业意见保留依据和分歧，高风险动作必须经过人工审批。
            </p>
            <button type="button" onClick={() => coordinator && open(coordinator)} className="mt-7 inline-flex h-11 items-center gap-2 rounded-full bg-[#e8b85b] px-5 text-sm font-bold text-[#142037] transition hover:-translate-y-0.5 hover:bg-[#f4c970]">
              交给总协调官分诊 <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          {coordinator ? (
            <div className="relative z-10 mt-8 flex items-center gap-5 rounded-2xl border border-white/15 bg-white/8 p-5 backdrop-blur lg:mt-0 lg:self-end">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-slate-700">
                <Image src={coordinator.avatar} alt={`${coordinator.name} 头像`} fill sizes="80px" className="object-cover" />
              </div>
              <div>
                <p className="text-xs font-semibold text-blue-200">总协调办公室 · {coordinator.level}</p>
                <h2 className="mt-1 text-xl font-semibold">{coordinator.name} · 总协调官</h2>
                <p className="mt-2 text-xs leading-5 text-slate-300">识别主责，组织最多三方会签，输出管理层可决策结论。</p>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-8">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <label className="relative block max-w-2xl">
              <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索部门、专业能力或任务，例如：合同、预算、GEO" className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-sm outline-none transition focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 dark:border-slate-700 dark:bg-slate-900" />
            </label>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 服务可用 · 云端自动选模
            </div>
          </div>
          <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
            {GROUPS.map((item) => (
              <button key={item.id} type="button" onClick={() => setGroup(item.id)} className={cn("shrink-0 rounded-full border px-4 py-2 text-xs font-semibold transition", group === item.id ? "border-[#163d73] bg-[#163d73] text-white" : "border-slate-300 bg-transparent text-slate-600 hover:border-slate-500 dark:border-slate-700 dark:text-slate-300")}>
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {roles.map((agent, index) => {
            const skills = getSkillCatalogForAgent(agent.id).slice(0, 3)
            return (
              <article key={agent.id} className="group relative overflow-hidden rounded-2xl border border-slate-300/80 bg-[#fbfaf7] p-5 transition duration-300 hover:-translate-y-1 hover:border-blue-500 hover:shadow-[0_18px_50px_rgba(30,55,90,0.12)] dark:border-slate-700 dark:bg-[#101722]" style={{ animationDelay: `${index * 35}ms` }}>
                <div className="flex gap-4">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-slate-200 grayscale-[12%] transition group-hover:grayscale-0">
                    <Image src={agent.avatar} alt={`${agent.name} 头像`} fill sizes="64px" className="object-cover" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold tracking-tight">{agent.name}</h2>
                      <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{agent.level}</span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-blue-700 dark:text-blue-300">{agent.department} · {agent.title}</p>
                  </div>
                </div>
                <p className="mt-4 min-h-12 text-sm leading-6 text-slate-600 dark:text-slate-300">{agent.description}</p>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {skills.map((skill) => <span key={skill.id} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">{skill.name}</span>)}
                </div>
                <div className="mt-5 flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-700">
                  <span className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300"><ShieldCheck className="h-3.5 w-3.5" /> 专业边界已启用</span>
                  <button type="button" onClick={() => open(agent)} className="inline-flex items-center gap-1 text-xs font-bold text-[#163d73] hover:underline dark:text-blue-300">进入工作台 <ArrowRight className="h-3.5 w-3.5" /></button>
                </div>
              </article>
            )
          })}
        </section>
        {!roles.length ? <div className="mt-10 rounded-2xl border border-dashed border-slate-300 py-16 text-center text-sm text-slate-500"><UsersRound className="mx-auto mb-3 h-6 w-6" />没有匹配的专业部门</div> : null}

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-300 py-5 text-xs text-slate-500 dark:border-slate-700">
          <span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> 角色、Skill、知识与工具权限相互独立并可审计</span>
          <span>15 位专业角色 · 60 项版本化 Skill</span>
        </footer>
      </div>
    </main>
  )
}


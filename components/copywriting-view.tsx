import type { ComponentType } from "react"
import {
  Store,
  Share2,
  Mic,
  RefreshCw,
  ArrowRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type CopyAgent = {
  name: string
  category: string
  description: string
  icon: ComponentType<{ className?: string }>
  badge: "HOT" | "NEW" | "精选"
  colorClass: { bg: string, text: string }
}

const copyAgents: CopyAgent[] = [
  {
    name: "实体店获客脚本创作",
    category: "获客",
    description: "专为实体店打造获客型短视频脚本，从引流钩子到成交引导，适配餐饮、装修、教育、美业等线下业态。",
    icon: Store,
    badge: "HOT",
    colorClass: { bg: "bg-rose-500/10", text: "text-rose-500" },
  },
  {
    name: "私域裂变脚本",
    category: "裂变",
    description: "输出朋友圈、社群、企微等多触点裂变文案与活动脚本，设计转发理由、福利钩子与转化路径。",
    icon: Share2,
    badge: "NEW",
    colorClass: { bg: "bg-violet-500/10", text: "text-violet-500" },
  },
  {
    name: "高效口播脚本",
    category: "口播",
    description: "面向数字人与真人口播，输出自然好念、气口清晰、带情绪起伏的口播稿，按秒数与平台节奏精准控稿。",
    icon: Mic,
    badge: "HOT",
    colorClass: { bg: "bg-amber-500/10", text: "text-amber-500" },
  },
  {
    name: "爆款脚本洗稿",
    category: "二创",
    description: "基于参考脚本进行结构重组与风格改写，保留爆款逻辑的同时产出原创内容，适配多平台多语气。",
    icon: RefreshCw,
    badge: "NEW",
    colorClass: { bg: "bg-emerald-500/10", text: "text-emerald-500" },
  },
]

type CopywritingViewProps = {
  onOpenAgent?: (agentName: string, meta?: { avatarUrl?: string; role?: string }) => void
}

export function CopywritingView({ onOpenAgent }: CopywritingViewProps) {
  return (
    <main className="flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
      <section className="mx-auto max-w-5xl">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">选择您的 AI 创作分身</h1>
          <p className="mt-3 text-sm text-muted-foreground sm:text-base">精准匹配实体获客与内容创作场景，4 大专业方向供你选择</p>
        </header>

        <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-2">
          {copyAgents.map((agent) => {
            const Icon = agent.icon
            return (
              <article
                key={agent.name}
                className="group relative flex min-h-[270px] flex-col rounded-2xl border border-border/70 bg-card p-5 soft-shadow transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <span className="absolute right-4 top-4 rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                  {agent.badge}
                </span>

                <div className={cn("mb-4 flex h-14 w-14 items-center justify-center rounded-full", agent.colorClass.bg, agent.colorClass.text)}>
                  <Icon className="h-7 w-7" aria-hidden="true" />
                </div>

                <h2 className="text-lg font-semibold leading-tight text-foreground">{agent.name}</h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">{agent.description}</p>

                <div className="mt-4">
                  <span className="rounded-md bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{agent.category}</span>
                </div>

                <div className="mt-auto pt-5">
                  <Button
                    onClick={() => onOpenAgent?.(agent.name)}
                    className="h-10 w-full rounded-xl bg-background text-foreground border border-border/60 text-sm font-medium transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary soft-shadow-sm"
                  >
                    去创作
                    <ArrowRight className="ml-1 h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      </section>
    </main>
  )
}

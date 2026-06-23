import Image from "next/image"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type AgentCardProps = {
  name: string
  role: string
  description: string
  avatar: string
  tags: string[]
  status: "online" | "working" | "idle"
  index?: number
  /** 头像图层额外 class（如 scale / object-position），用于与其它卡片裁剪风格对齐 */
  avatarImageClassName?: string
  /** 点击「立即调用」时打开与图一一致的对话工作台 */
  onCall?: () => void
  /** 紧凑模式：横排小卡片，用于工作台智能体概览行 */
  variant?: "default" | "compact"
}

export function AgentCard({
  name,
  role,
  description,
  avatar,
  tags,
  status,
  index = 0,
  avatarImageClassName,
  onCall,
  variant = "default",
}: AgentCardProps) {
  // Compact variant — horizontal small card
  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={onCall}
        className="group flex shrink-0 items-center gap-3 rounded-xl border border-border/60 bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md dark:bg-white/5"
      >
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border-2 border-white shadow-sm dark:border-white/10">
          <Image
            src={avatar || "/placeholder.svg"}
            alt={`${name} 头像`}
            fill
            sizes="40px"
            className={cn("object-cover object-center", avatarImageClassName)}
          />
        </div>
        <div className="min-w-0 flex-1 text-left">
          <p className="truncate text-[13px] font-semibold text-foreground">{name}</p>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{role}</p>
        </div>
        <span
          className={cn(
            "h-2 w-2 shrink-0 rounded-full",
            status === "online" ? "bg-emerald-500" : status === "working" ? "bg-amber-500" : "bg-slate-300",
          )}
        />
      </button>
    )
  }

  // Default variant (unchanged)
  return (
    <article
      className={cn(
        "group relative flex animate-slide-up flex-col overflow-hidden rounded-2xl border border-border/60 bg-card/95 p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:soft-shadow-lg",
        onCall && "cursor-default",
      )}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Hover gradient sheen */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-primary/10 opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
      />
      {/* Avatar：固定圆形容器 + fill 裁剪，保证与各卡片的白色描边、阴影一致 */}
      <div className="relative mb-4">
        <div className="absolute inset-0 -z-10 rounded-full bg-primary/15 blur-xl animate-pulse-glow" aria-hidden="true" />
        <div className="relative h-16 w-16 overflow-hidden rounded-full border-2 border-white shadow-[0_2px_10px_rgba(15,23,42,0.08)] transition-transform duration-500 group-hover:scale-110 group-hover:rotate-3 dark:border-white/10 dark:shadow-black/25">
          <Image
            src={avatar || "/placeholder.svg"}
            alt={`${name} 头像`}
            fill
            sizes="64px"
            className={cn("object-cover object-center", avatarImageClassName)}
          />
        </div>
      </div>

      {/* Title & role */}
      <div>
        <h3 className="text-base font-semibold leading-tight text-foreground">{name}</h3>
        <p className="mt-0.5 text-[12px] font-medium text-foreground transition-colors group-hover:text-primary">
          {role}
        </p>
      </div>

      {/* Description */}
      <p className="mt-2.5 line-clamp-3 text-[13px] leading-relaxed text-muted-foreground">{description}</p>

      {/* Tags */}
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {tags.map((tag) => (
          <li
            key={tag}
            className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            #{tag}
          </li>
        ))}
      </ul>

      {/* Action */}
      <div className="mt-5 pt-4 border-t border-border/60">
        <Button
          type="button"
          disabled={!onCall}
          onClick={() => onCall?.()}
          className="h-9 w-full rounded-xl bg-background text-foreground border border-border/60 text-sm font-medium transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary soft-shadow-sm disabled:pointer-events-none disabled:opacity-60"
        >
          立即调用
          <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </div>
    </article>
  )
}

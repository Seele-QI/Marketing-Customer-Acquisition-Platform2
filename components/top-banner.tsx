"use client"

import * as React from "react"
import Image from "next/image"
import { Sparkles } from "lucide-react"

/* ------------------------------------------------------------------ */
/*  Dynamic greeting helper                                            */
/* ------------------------------------------------------------------ */

function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return "夜深了"
  if (hour < 12) return "早上好"
  if (hour < 14) return "中午好"
  if (hour < 18) return "下午好"
  return "晚上好"
}

type BeijingTimeParts = {
  time: string
  date: string
  weekday: string
}

function getBeijingTimeParts(): BeijingTimeParts {
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    weekday: "long",
    hour12: false,
  })

  const parts = formatter.formatToParts(new Date())
  const valueOf = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ""

  return {
    time: `${valueOf("hour")}:${valueOf("minute")}:${valueOf("second")}`,
    date: `${valueOf("year")}-${valueOf("month")}-${valueOf("day")}`,
    weekday: valueOf("weekday"),
  }
}

/* ------------------------------------------------------------------ */
/*  Component Props                                                    */
/* ------------------------------------------------------------------ */

type TopBannerProps = {
  userName?: string
  agentCount?: number
  hotTrendHighlightCount?: number
}

export function TopBanner({
  userName = "各位朋友",
  agentCount = 8,
  hotTrendHighlightCount = 12,
}: TopBannerProps) {
  const [greeting, setGreeting] = React.useState("你好")
  const [beijingTime, setBeijingTime] = React.useState<BeijingTimeParts>({
    time: "--:--:--",
    date: "---- -- --",
    weekday: "--",
  })

  React.useEffect(() => {
    const updateTime = () => {
      setGreeting(getGreeting())
      setBeijingTime(getBeijingTimeParts())
    }

    updateTime()
    const timer = window.setInterval(updateTime, 1000)

    return () => window.clearInterval(timer)
  }, [])

  return (
    <section className="hero-gradient relative overflow-hidden rounded-2xl border border-white/75 shadow-[0_22px_64px_-28px_rgba(37,99,235,0.28)] ring-1 ring-slate-200/55 dark:border-white/[0.08] dark:shadow-[0_28px_80px_-36px_rgba(0,0,0,0.55)] dark:ring-white/[0.05]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 animate-hero-mesh mask-fade-edges opacity-80 dark:opacity-45"
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-32 -top-32 h-80 w-80 rounded-full bg-primary/25 blur-3xl animate-blob-drift"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 bottom-[-80px] h-72 w-72 rounded-full bg-indigo-400/20 blur-3xl animate-blob-drift"
        style={{ animationDelay: "-7s" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-1/3 top-6 h-40 w-40 rounded-full bg-sky-300/30 blur-3xl animate-pulse-glow"
      />

      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 1200 360"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="wave-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(59,130,246,0)" />
            <stop offset="50%" stopColor="rgba(59,130,246,0.45)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0)" />
          </linearGradient>
          <linearGradient id="wave-grad-soft" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(96,165,250,0)" />
            <stop offset="50%" stopColor="rgba(96,165,250,0.28)" />
            <stop offset="100%" stopColor="rgba(165,180,252,0)" />
          </linearGradient>
          <linearGradient id="wave-grad-faint" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(59,130,246,0)" />
            <stop offset="50%" stopColor="rgba(147,197,253,0.18)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0)" />
          </linearGradient>
        </defs>
        <g className="animate-hero-wave-drift">
          <path d="M0 240 C 200 180, 400 300, 600 220 S 1000 140, 1200 200" fill="none" stroke="url(#wave-grad)" strokeWidth="1.5" strokeDasharray="240" className="animate-wave-line" />
          <path d="M0 280 C 220 220, 460 320, 700 250 S 1080 200, 1200 240" fill="none" stroke="url(#wave-grad)" strokeWidth="1" strokeDasharray="240" className="animate-wave-line" style={{ animationDelay: "-2s" }} />
          <path d="M0 200 C 280 240, 520 120, 780 200 S 1050 260, 1200 180" fill="none" stroke="url(#wave-grad-soft)" strokeWidth="0.85" strokeDasharray="200" className="animate-wave-line-slow" style={{ animationDelay: "-4s" }} />
          <path d="M0 165 C 230 110, 480 195, 720 140 S 980 125, 1200 155" fill="none" stroke="url(#wave-grad-soft)" strokeWidth="0.7" strokeDasharray="160" className="animate-wave-line-fast" style={{ animationDelay: "-0.8s" }} opacity={0.85} />
          <path d="M0 305 C 160 275, 420 335, 620 290 S 910 320, 1200 288" fill="none" stroke="url(#wave-grad-faint)" strokeWidth="0.65" strokeDasharray="220" className="animate-wave-line-mid" style={{ animationDelay: "-3.5s" }} opacity={0.9} />
          <path d="M0 128 C 310 85, 560 150, 820 95 S 1080 115, 1200 108" fill="none" stroke="url(#wave-grad-faint)" strokeWidth="0.55" strokeDasharray="140" className="animate-wave-line-slow" style={{ animationDelay: "-6s" }} opacity={0.75} />
        </g>
        <g className="animate-hero-wave-drift" style={{ animationDelay: "-7s" }}>
          <path d="M0 218 C 210 260, 450 175, 690 235 S 960 195, 1200 228" fill="none" stroke="url(#wave-grad)" strokeWidth="0.9" strokeDasharray="260" className="animate-wave-line-mid" style={{ animationDelay: "-1.2s" }} opacity={0.65} />
          <path d="M0 262 C 275 230, 510 295, 760 248 S 1020 275, 1200 252" fill="none" stroke="url(#wave-grad-soft)" strokeWidth="0.75" strokeDasharray="190" className="animate-wave-line-fast" style={{ animationDelay: "-2.8s" }} opacity={0.8} />
          <path d="M0 332 C 190 310, 450 348, 680 318 S 940 338, 1200 322" fill="none" stroke="url(#wave-grad-faint)" strokeWidth="0.6" strokeDasharray="200" className="animate-wave-line-slow" style={{ animationDelay: "-5s" }} opacity={0.7} />
          <path d="M0 188 C 240 155, 500 215, 740 170 S 990 200, 1200 182" fill="none" stroke="url(#wave-grad-faint)" strokeWidth="0.55" strokeDasharray="175" className="animate-wave-line" style={{ animationDelay: "-4.2s" }} opacity={0.72} />
        </g>
      </svg>

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 animate-hero-grid-breathe opacity-[0.11] [background-image:linear-gradient(to_right,rgba(59,130,246,0.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(56,189,248,0.1)_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_85%_70%_at_50%_48%,black_28%,transparent_78%)] dark:opacity-[0.09]"
      />

      <div className="relative grid grid-cols-1 items-center gap-6 px-6 py-7 md:grid-cols-[280px_minmax(0,1fr)_auto] md:gap-8 md:px-10 md:py-9 lg:grid-cols-[320px_minmax(0,1fr)_auto] lg:px-12">
        <div className="relative flex h-[240px] items-end justify-center md:h-[280px] md:justify-start lg:h-[300px]">
          <div aria-hidden="true" className="absolute left-1/2 top-1/2 -z-10 h-[320px] w-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/20 blur-[80px] animate-breathe-glow md:left-[45%]" />
          <div aria-hidden="true" className="absolute left-1/2 top-[55%] -z-10 h-[200px] w-[240px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky-300/20 blur-[60px] animate-breathe-glow md:left-[45%]" style={{ animationDelay: "-2s" }} />

          <div aria-hidden="true" className="absolute inset-0 pointer-events-none">
            <span className="absolute left-[15%] top-[20%] h-1.5 w-1.5 rounded-full bg-primary/50 animate-particle-float" />
            <span className="absolute left-[75%] top-[15%] h-1 w-1 rounded-full bg-sky-400/60 animate-particle-float" style={{ animationDelay: "-1.5s" }} />
            <span className="absolute left-[80%] top-[50%] h-1.5 w-1.5 rounded-full bg-indigo-400/40 animate-particle-float" style={{ animationDelay: "-3s" }} />
            <span className="absolute left-[10%] top-[60%] h-1 w-1 rounded-full bg-primary/40 animate-particle-float" style={{ animationDelay: "-4.5s" }} />
            <span className="absolute left-[60%] top-[75%] h-1 w-1 rounded-full bg-sky-300/50 animate-particle-float" style={{ animationDelay: "-2.5s" }} />
            <span className="absolute left-[30%] top-[10%] h-0.5 w-0.5 rounded-full bg-indigo-300/60 animate-particle-float" style={{ animationDelay: "-5s" }} />
          </div>

          <div className="relative h-full w-[280px] animate-slide-up md:w-[320px] lg:w-[360px]">
            <div className="absolute inset-0 animate-avatar-breathe">
              <Image
                src="/avatar-girl-nobg.png"
                alt="AI超级个体数字形象"
                width={680}
                height={680}
                className="h-full w-full select-none object-contain object-bottom drop-shadow-xl"
                priority
              />
            </div>
          </div>
        </div>

        <div className="relative min-w-0 text-center md:text-left">
          <div className="mb-3 inline-flex animate-slide-up items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-medium text-primary">
            <Sparkles className="h-3 w-3 animate-pulse" />
            ✨ 状态拉满 · AI超级个体工作站
          </div>

          <h1 className="animate-slide-up delay-100 text-balance text-2xl font-semibold leading-tight tracking-tight text-foreground sm:text-[28px] lg:text-[32px]">
            {greeting}，<span className="shimmer-text">{userName}</span>，你的「AI超级个体」已经准备就绪
          </h1>

          <p className="mt-2 animate-slide-up delay-200 text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
            一人即可掌控全域增长——AI 数据洞察、脚本创作、视频生成一站完成。
          </p>
        </div>

        <div className="relative flex min-h-[220px] w-full flex-col items-center justify-center overflow-hidden rounded-[1.75rem] border border-white/60 bg-white/55 px-5 py-6 text-center shadow-[0_24px_80px_-48px_rgba(37,99,235,0.75)] backdrop-blur-xl animate-slide-up delay-200 md:min-h-[240px] md:w-[260px] lg:w-[300px] dark:border-white/10 dark:bg-slate-950/35">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(56,189,248,0.26),transparent_34%),radial-gradient(circle_at_86%_78%,rgba(99,102,241,0.24),transparent_36%)]" />
          <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-36 w-36 rounded-full border border-sky-300/30 bg-sky-300/10 blur-sm animate-pulse-glow" />
          <div aria-hidden="true" className="pointer-events-none absolute bottom-4 left-4 h-20 w-20 rounded-full border border-primary/15" />

          <div className="relative z-10 flex w-full flex-col items-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400 shadow-sm dark:text-slate-300">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.85)]" />
              </span>
              <span>SYS_TIME / BJT_LIVE</span>
            </div>

            <div
              className="mt-6 w-full text-center font-mono text-[42px] font-bold leading-none tracking-[-0.04em] text-transparent bg-clip-text bg-gradient-to-r from-slate-950 via-blue-700 to-cyan-500 drop-shadow-sm sm:text-5xl lg:text-[52px] dark:from-white dark:via-sky-200 dark:to-cyan-300"
              style={{ fontVariantNumeric: "tabular-nums" }}
              aria-label={`北京时间 ${beijingTime.time}`}
            >
              {beijingTime.time}
            </div>

            <div className="mt-4 flex w-full max-w-[230px] items-center justify-between rounded-2xl border border-slate-200/70 bg-white/50 px-4 py-2 shadow-sm backdrop-blur dark:border-white/10 dark:bg-white/5">
              <div className="flex flex-col items-start">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                  Date
                </span>
                <span className="font-mono text-sm font-semibold text-slate-600 dark:text-slate-200">
                  {beijingTime.date}
                </span>
              </div>
              <div className="h-8 w-px bg-slate-200 dark:bg-white/10" />
              <div className="flex flex-col items-end">
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                  Week
                </span>
                <span className="text-sm font-semibold text-slate-600 dark:text-slate-200">
                  {beijingTime.weekday}
                </span>
              </div>
            </div>

            <div className="mt-4 grid w-full max-w-[230px] grid-cols-3 gap-2">
              {["UTC+8", "SYNC", "LIVE"].map((label) => (
                <span
                  key={label}
                  className="rounded-xl border border-primary/10 bg-primary/5 px-2 py-1.5 text-center font-mono text-[10px] font-semibold tracking-widest text-primary/70 dark:text-sky-300/80"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

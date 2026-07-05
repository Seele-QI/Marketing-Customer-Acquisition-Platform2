"use client"

import * as React from "react"
import { Search, Loader2, Radar, Link2, Quote, ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "@/hooks/use-toast"
import { parseApiErrorResponse } from "@/lib/api/parse-detail"
import type { LlmProviderId } from "@/lib/geo/llm/router"
import type { AiProbeResponse, PlatformId, ResearchResponse } from "@/lib/geo/retrieval/types"

const PLATFORMS: { id: PlatformId; label: string }[] = [
  { id: "zhihu", label: "知乎" },
  { id: "xiaohongshu", label: "小红书" },
  { id: "tieba", label: "贴吧" },
  { id: "trends", label: "热搜" },
]

type Props = {
  onInsertCitation: (block: string) => void
  defaultOpen?: boolean
  modelSkillId?: string | null
  enterpriseSnapshot?: string | null
  /** AI 可见度探测所用推理引擎 */
  provider?: LlmProviderId
}

function ResultSkeleton() {
  return (
    <div className="space-y-2 animate-pulse" aria-hidden>
      {[1, 2].map((i) => (
        <div key={i} className="rounded-lg bg-slate-100/80 p-2 dark:bg-white/5">
          <div className="h-3 w-3/4 rounded bg-slate-200 dark:bg-white/10" />
          <div className="mt-2 h-2 w-full rounded bg-slate-200 dark:bg-white/10" />
        </div>
      ))}
    </div>
  )
}

export function GeoResearchPanel({
  onInsertCitation,
  defaultOpen = true,
  modelSkillId,
  enterpriseSnapshot,
  provider = "deepseek",
}: Props) {
  const [open, setOpen] = React.useState(defaultOpen)
  const [showUrls, setShowUrls] = React.useState(false)
  const [keyword, setKeyword] = React.useState("")
  const [urlText, setUrlText] = React.useState("")
  const [platforms, setPlatforms] = React.useState<PlatformId[]>([
    "zhihu",
    "xiaohongshu",
    "tieba",
    "trends",
  ])
  const [loading, setLoading] = React.useState(false)
  const [probeLoading, setProbeLoading] = React.useState(false)
  const [result, setResult] = React.useState<ResearchResponse | null>(null)
  const [probe, setProbe] = React.useState<AiProbeResponse | null>(null)

  const togglePlatform = (id: PlatformId) => {
    setPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    )
  }

  const runResearch = async () => {
    const urls = urlText
      .split(/\n/)
      .map((u) => u.trim())
      .filter(Boolean)

    if (!keyword.trim() && urls.length === 0) {
      toast({ title: "请输入关键词或粘贴参考 URL", variant: "destructive" })
      return
    }

    setLoading(true)
    setOpen(true)
    try {
      const res = await fetch("/api/geo/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ keyword, platforms, urls }),
      })
      const body = await res.json()
      if (!res.ok) {
        throw new Error(parseApiErrorResponse(res.status, body, "检索失败"))
      }
      setResult(body as ResearchResponse)
      if (body.partial) {
        toast({
          title: "部分平台未返回结果",
          description: "请检查 API Key 或改用 URL 提取",
        })
      }
    } catch (err) {
      toast({
        title: "检索失败",
        description: err instanceof Error ? err.message : "未知错误",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const runProbe = async () => {
    const topic = keyword.trim() || "AI 视频翻译"
    setProbeLoading(true)
    setOpen(true)
    try {
      const res = await fetch("/api/geo/ai-probe", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          provider,
          modelSkillId: modelSkillId ?? undefined,
          enterpriseSnapshot: enterpriseSnapshot ?? undefined,
        }),
      })
      const body = await res.json()
      if (!res.ok) {
        if (res.status === 401) throw new Error("请先登录后再探测")
        if (res.status === 402) throw new Error(parseApiErrorResponse(res.status, body, "积分不足"))
        throw new Error(parseApiErrorResponse(res.status, body, "探测失败"))
      }
      setProbe(body as AiProbeResponse)
    } catch (err) {
      toast({
        title: "AI 可见度探测失败",
        description: err instanceof Error ? err.message : "未知错误",
        variant: "destructive",
      })
    } finally {
      setProbeLoading(false)
    }
  }

  const platformLabel = (id: PlatformId) =>
    PLATFORMS.find((p) => p.id === id)?.label ?? id

  const resultCount = result?.items.length ?? 0

  return (
    <section className="border-b border-slate-100 dark:border-white/5">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-slate-50/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-cyan-500/30 dark:hover:bg-white/5"
      >
        <span className="flex items-center gap-2 text-[12px] font-semibold text-slate-800 dark:text-slate-200">
          <Search className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
          资料检索
          {resultCount > 0 && (
            <span className="rounded-full bg-cyan-100 px-1.5 py-0.5 text-[10px] font-medium text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
              {resultCount}
            </span>
          )}
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-slate-400 transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="space-y-2.5 px-3 pb-3">
          <Input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="关键词，如「AI 视频翻译」"
            className="h-8 border-slate-200 bg-white text-[12px] dark:border-white/10 dark:bg-white/5"
            aria-label="检索关键词"
            onKeyDown={(e) => {
              if (e.key === "Enter") void runResearch()
            }}
          />

          <div className="flex flex-wrap gap-1" role="group" aria-label="检索平台">
            {PLATFORMS.map((p) => {
              const active = platforms.includes(p.id)
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => togglePlatform(p.id)}
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[10px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40",
                    active
                      ? "bg-cyan-600 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-400 dark:hover:bg-white/15",
                  )}
                >
                  {p.label}
                </button>
              )
            })}
          </div>

          {!showUrls ? (
            <button
              type="button"
              onClick={() => setShowUrls(true)}
              className="text-[10px] text-cyan-600 hover:underline dark:text-cyan-400"
            >
              + 粘贴参考 URL
            </button>
          ) : (
            <textarea
              value={urlText}
              onChange={(e) => setUrlText(e.target.value)}
              placeholder="知乎 / 贴吧 / 小红书链接，每行一个"
              aria-label="参考 URL"
              className="min-h-[52px] w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 dark:border-white/10 dark:bg-white/5"
            />
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 flex-1 bg-cyan-600 text-[11px] hover:bg-cyan-700"
              disabled={loading}
              onClick={runResearch}
            >
              {loading ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Search className="mr-1 h-3 w-3" />
              )}
              检索
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 flex-1 text-[11px]"
              disabled={probeLoading}
              onClick={runProbe}
            >
              {probeLoading ? (
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              ) : (
                <Radar className="mr-1 h-3 w-3" />
              )}
              AI 探测
            </Button>
          </div>

          {loading && <ResultSkeleton />}

          {!loading && result && (
            <div className="max-h-44 space-y-1.5 overflow-y-auto">
              {result.items.length === 0 ? (
                <p className="py-2 text-center text-[11px] text-slate-400">
                  暂无结果，调整关键词或配置 API Key
                </p>
              ) : (
                result.items.map((item, i) => (
                  <div
                    key={`${item.platform}-${i}`}
                    className="group rounded-lg bg-slate-50/80 p-2 dark:bg-white/5"
                  >
                    <div className="flex items-start gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-medium text-slate-800 dark:text-slate-200">
                          <span className="text-cyan-600 dark:text-cyan-400">
                            {platformLabel(item.platform)}
                          </span>
                          {" · "}
                          {item.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-[10px] leading-relaxed text-slate-500">
                          {item.snippet}
                        </p>
                        {item.url && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-0.5 text-[10px] text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-400"
                          >
                            <Link2 className="h-3 w-3" /> 来源
                          </a>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`插入引用：${item.title}`}
                        className="h-6 shrink-0 px-1.5 text-[10px] opacity-70 group-hover:opacity-100"
                        onClick={() =>
                          onInsertCitation(
                            `\n\n> 参考（${platformLabel(item.platform)}）：${item.snippet}${item.url ? `\n> 来源：${item.url}` : ""}\n`,
                          )
                        }
                      >
                        <Quote className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {probe && !probeLoading && (
            <div className="rounded-lg border border-violet-200/60 bg-violet-50/40 px-2.5 py-2 dark:border-violet-500/20 dark:bg-violet-500/5">
              <p className="text-[11px] font-medium text-violet-800 dark:text-violet-200">
                AI 提及可能性 · {probe.mentionLikelihood}
              </p>
              {probe.gaps.slice(0, 1).map((g, i) => (
                <p key={i} className="mt-1 line-clamp-2 text-[10px] text-slate-500">
                  缺口：{g.prompt}
                </p>
              ))}
            </div>
          )}

          {!loading && !result && !probe && (
            <p className="text-center text-[10px] text-slate-400">
              先检索再动笔 · 知乎/小红书/贴吧/热搜
            </p>
          )}
        </div>
      )}
    </section>
  )
}

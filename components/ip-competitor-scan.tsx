"use client"

import * as React from "react"
import { Search, Loader2, Sparkles, ChevronDown, ExternalLink } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"

type CompetitorRow = {
  name: string
  platform: string
  followers: string
  niche: string
  style: string
  strengths: string
  weaknesses: string
}

type Props = {
  stageTitle?: string
  stageHint?: string
  onAnalysisComplete?: (analysis: string) => void
}

export function IPCompetitorScan({ stageTitle, stageHint, onAnalysisComplete }: Props) {
  const [handles, setHandles] = React.useState("")
  const [platform, setPlatform] = React.useState("抖音")
  const [myPositioning, setMyPositioning] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [analysis, setAnalysis] = React.useState("")
  const [showPlatforms, setShowPlatforms] = React.useState(false)

  const platforms = ["抖音", "快手", "小红书", "B站", "视频号"]

  const handleScan = React.useCallback(async () => {
    const list = handles
      .split(/[,，\n]/)
      .map((h) => h.trim())
      .filter(Boolean)

    if (list.length === 0) {
      toast({ title: "请输入竞品名称", description: "用逗号或换行分隔多个账号", variant: "destructive" })
      return
    }

    setLoading(true)
    setAnalysis("")

    try {
      const res = await fetch("/api/ai/ip-competitor-scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          competitorHandles: list,
          platform,
          myPositioning: myPositioning.trim(),
          stageTitle: stageTitle ?? "",
          stageHint: stageHint ?? "",
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "分析失败")

      setAnalysis(data.analysis)
      onAnalysisComplete?.(data.analysis)
      toast({ title: "竞品分析完成" })
    } catch (e) {
      toast({
        title: "分析失败",
        description: e instanceof Error ? e.message : "请稍后重试",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [handles, platform, myPositioning, stageTitle, stageHint, onAnalysisComplete])

  return (
    <div className="flex flex-col gap-5">
      {/* Input Section */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* 竞品名称 */}
        <div className="lg:col-span-2">
          <label className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">
            竞品账号名称
          </label>
          <textarea
            className="w-full min-h-[80px] resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:placeholder:text-slate-600"
            placeholder="输入竞品账号名称，用逗号或换行分隔&#10;例如：李一舟, 鹤老师说经济, 崔磊"
            value={handles}
            onChange={(e) => setHandles(e.target.value)}
          />
        </div>

        {/* 平台 & 我的定位 */}
        <div className="flex flex-col gap-3">
          {/* Platform Selector */}
          <div className="relative">
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">
              平台
            </label>
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] dark:border-white/[0.08] dark:bg-white/[0.03]"
              onClick={() => setShowPlatforms(!showPlatforms)}
            >
              <span>{platform}</span>
              <ChevronDown className={cn("h-4 w-4 transition-transform", showPlatforms && "rotate-180")} />
            </button>
            {showPlatforms && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-slate-200 bg-white py-1 shadow-lg dark:border-white/[0.08] dark:bg-card">
                {platforms.map((p) => (
                  <button
                    key={p}
                    type="button"
                    className={cn(
                      "w-full px-4 py-2 text-left text-[14px] transition-colors hover:bg-blue-50 dark:hover:bg-blue-500/10",
                      p === platform && "bg-blue-50 font-medium text-blue-600 dark:bg-blue-500/10 dark:text-blue-400",
                    )}
                    onClick={() => {
                      setPlatform(p)
                      setShowPlatforms(false)
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">
              我的定位（可选）
            </label>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:placeholder:text-slate-600"
              placeholder="简述你的人设与赛道"
              value={myPositioning}
              onChange={(e) => setMyPositioning(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Action */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleScan}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 px-6 py-2.5 text-[14px] font-semibold text-white shadow-lg shadow-blue-500/20 transition-all duration-200 hover:from-blue-600 hover:to-indigo-600 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
          {loading ? "分析中…" : "开始竞品扫描"}
        </Button>
        {analysis && (
          <span className="text-[13px] text-green-600 dark:text-green-400">
            ✓ 分析完成 · {analysis.length} 字符
          </span>
        )}
      </div>

      {/* Result */}
      {analysis && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800 dark:text-slate-100">
              <Sparkles className="h-4 w-4 text-blue-500" />
              竞品分析报告
            </h3>
          </div>
          <div className="prose prose-sm max-w-none dark:prose-invert whitespace-pre-wrap break-words text-[14px] leading-relaxed text-slate-700 dark:text-slate-300">
            {analysis}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!analysis && !loading && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 py-16 dark:border-white/[0.06]">
          <Search className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="text-[14px] text-slate-400 dark:text-slate-500">
            输入竞品账号名称，开始 AI 深度竞品分析
          </p>
        </div>
      )}
    </div>
  )
}

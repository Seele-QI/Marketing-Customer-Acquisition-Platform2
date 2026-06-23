"use client"

import * as React from "react"
import { Loader2, TrendingUp, Lightbulb, Tag, Zap } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"

type Props = {
  stageTitle?: string
  stageHint?: string
  onAnalysisComplete?: (analysis: string) => void
}

/** 从分析文本中提取 pattern 标签 */
function extractTags(text: string): string[] {
  const tags: string[] = []
  const patterns = [
    /钩子类型[：:]\s*(.+?)(?:\n|$)/gi,
    /#[^\s#]+/g,
  ]
  for (const p of patterns) {
    const matches = text.match(p)
    if (matches) {
      for (const m of matches) {
        const cleaned = m.replace(/钩子类型[：:]\s*/i, "").trim()
        if (cleaned && !tags.includes(cleaned)) tags.push(cleaned)
      }
    }
  }
  // Limit to 12 tags
  return tags.slice(0, 12)
}

const TAG_COLORS = [
  "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-400",
  "bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  "bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400",
  "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  "bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-400",
  "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-400",
]

export function IPViralAnalysis({ stageTitle, stageHint, onAnalysisComplete }: Props) {
  const [contentText, setContentText] = React.useState("")
  const [niche, setNiche] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [analysis, setAnalysis] = React.useState("")
  const [tags, setTags] = React.useState<string[]>([])

  const handleAnalyze = React.useCallback(async () => {
    const text = contentText.trim()
    if (!text) {
      toast({ title: "请粘贴爆款内容", description: "至少提供一条爆款内容的文字", variant: "destructive" })
      return
    }

    setLoading(true)
    setAnalysis("")
    setTags([])

    try {
      const res = await fetch("/api/ai/ip-viral-analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentTexts: [text],
          niche: niche.trim(),
          stageTitle: stageTitle ?? "",
          stageHint: stageHint ?? "",
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "分析失败")

      setAnalysis(data.analysis)
      setTags(extractTags(data.analysis))
      onAnalysisComplete?.(data.analysis)
      toast({ title: "爆款分析完成" })
    } catch (e) {
      toast({
        title: "分析失败",
        description: e instanceof Error ? e.message : "请稍后重试",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [contentText, niche, stageTitle, stageHint, onAnalysisComplete])

  return (
    <div className="flex flex-col gap-5">
      {/* Input Section */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">
            粘贴爆款内容
          </label>
          <textarea
            className="w-full min-h-[120px] resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:placeholder:text-slate-600"
            placeholder="粘贴爆款视频/笔记的文字内容，或描述其结构特点&#10;AI 将拆解：钩子类型、情绪曲线、内容公式、可复用模板"
            value={contentText}
            onChange={(e) => setContentText(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="mb-1.5 block text-[13px] font-medium text-slate-700 dark:text-slate-300">
              你的赛道/垂类（可选）
            </label>
            <input
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[14px] placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 dark:border-white/[0.08] dark:bg-white/[0.03] dark:placeholder:text-slate-600"
              placeholder="如：知识付费、美妆、母婴"
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
            />
          </div>

          <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
            <div className="flex items-start gap-2">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <p className="text-[13px] leading-relaxed text-amber-800 dark:text-amber-300">
                <strong>提示：</strong>AI 会从钩子类型、情绪曲线、信息密度、话题标签策略等维度进行拆解，并提炼可复用的内容公式模板。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Action */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleAnalyze}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-2.5 text-[14px] font-semibold text-white shadow-lg shadow-rose-500/20 transition-all duration-200 hover:from-rose-600 hover:to-pink-600 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <TrendingUp className="h-4 w-4" />
          )}
          {loading ? "分析中…" : "开始爆款拆解"}
        </Button>
        {analysis && (
          <span className="text-[13px] text-green-600 dark:text-green-400">
            ✓ 拆解完成
          </span>
        )}
      </div>

      {/* Tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag, i) => (
            <span
              key={tag}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-medium",
                TAG_COLORS[i % TAG_COLORS.length],
              )}
            >
              <Tag className="h-3 w-3" />
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Result */}
      {analysis && (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm dark:border-white/[0.06] dark:bg-white/[0.02]">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-[15px] font-semibold text-slate-800 dark:text-slate-100">
              <Zap className="h-4 w-4 text-rose-500" />
              爆款拆解报告
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
          <TrendingUp className="h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="text-[14px] text-slate-400 dark:text-slate-500">
            粘贴爆款内容文字，AI 帮你拆解爆款公式
          </p>
        </div>
      )}
    </div>
  )
}

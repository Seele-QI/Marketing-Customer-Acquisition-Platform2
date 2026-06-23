"use client"

/**
 * 创作历史 页面组件
 *
 * 存储逻辑已抽取到 lib/video/storage.ts，此处仅负责展示。
 */
import * as React from "react"
import { Trash2, Eye, Clock, Film, Download, Image as ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import type { HistoryRecord } from "@/lib/video/types"
import { getHistoryRecords, removeHistoryRecord, clearAllHistory } from "@/lib/video/storage"

export type { ShareVideo } from "@/lib/video/types"
export { addHistoryRecord, addShareVideo, getShareVideos as loadShareVideos } from "@/lib/video/storage"

/* ------------------------------------------------------------------ */
/*  Utilities                                                          */
/* ------------------------------------------------------------------ */

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function getExcerpt(text: string, max = 50): string {
  return text.length > max ? text.slice(0, max) + "…" : text
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function VideoHistory() {
  const [records, setRecords] = React.useState<HistoryRecord[]>([])

  React.useEffect(() => {
    setRecords(getHistoryRecords())
  }, [])

  const handleDelete = (id: string) => {
    const next = removeHistoryRecord(id)
    setRecords(next)
    toast({ title: "已删除", description: "该条记录已移除" })
  }

  const handleClearAll = () => {
    setRecords(clearAllHistory())
    toast({ title: "已清空", description: "所有历史记录已清除" })
  }

  return (
    <div className="h-full overflow-y-auto bg-[#fafaf8] dark:bg-slate-950">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
        <header className="mb-8">
          <div className="mb-4 h-1 w-12 rounded-full bg-rose-500/60" />
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[34px] dark:text-slate-50">
                创作<span className="text-rose-500 dark:text-rose-400">历史</span>
              </h1>
              <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">最近 14 天的视频创作记录</p>
            </div>
            {records.length > 0 && (
              <button onClick={handleClearAll}
                className="rounded-xl px-4 py-2 text-[13px] font-medium text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
              >清空全部</button>
            )}
          </div>
        </header>

        {records.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 py-20">
            <Film className="h-12 w-12 text-slate-300 dark:text-slate-600" />
            <p className="text-[15px] font-medium text-slate-400">暂无创作记录</p>
            <p className="text-[13px] text-slate-400">回到视频创作，生成你的第一个数字人视频吧</p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {records.map((record) => (
            <div key={record.id}
              className={cn(
                "group relative overflow-hidden rounded-2xl border bg-white shadow-sm transition-all hover:shadow-md dark:border-white/10 dark:bg-white/5",
                record.status === "failed" && "border-amber-200/60 dark:border-amber-500/20",
              )}
            >
              <div className="aspect-[3/4] w-full overflow-hidden bg-slate-100 dark:bg-white/5">
                {record.coverUrl ? (
                  <img src={record.coverUrl} alt="封面图" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center">
                    <ImageIcon className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                  </div>
                )}
              </div>

              <div className="p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className={cn(
                    "rounded-md px-2 py-0.5 text-[11px] font-medium",
                    record.status === "success"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
                  )}>
                    {record.status === "success" ? "已完成" : "失败"}
                  </span>
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-white/10 dark:text-slate-400">
                    {record.gender === "male" ? "男" : "女"}
                  </span>
                </div>

                <p className="mb-1 line-clamp-2 text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                  {getExcerpt(record.script)}
                </p>

                <p className="flex items-center gap-1 text-[11px] text-slate-400">
                  <Clock className="h-3 w-3" />{formatTime(record.createdAt)}
                </p>

                <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 dark:border-white/5">
                  {record.videoUrl && (
                    <a href={record.videoUrl} target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-[12px] font-medium text-slate-600 transition-colors hover:bg-slate-200 dark:bg-white/10 dark:text-slate-400 dark:hover:bg-white/20">
                      <Eye className="h-3.5 w-3.5" />查看视频
                    </a>
                  )}
                  {record.coverUrl && (
                    <a href={record.coverUrl} target="_blank" rel="noopener noreferrer" download
                      className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-[12px] font-medium text-rose-600 transition-colors hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20">
                      <Download className="h-3.5 w-3.5" />下载封面
                    </a>
                  )}
                  <button onClick={() => handleDelete(record.id)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/10 dark:hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

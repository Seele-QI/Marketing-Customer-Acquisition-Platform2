"use client"

import * as React from "react"
import { Send, Clock, Tag, MoreHorizontal } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"

type QueueItem = {
  id: string
  title: string
  platforms: string[]
  scheduledAt: string
  geoTags: string[]
  status: "draft" | "scheduled" | "published"
}

const MOCK_QUEUE: QueueItem[] = [
  {
    id: "1",
    title: "AI 视频翻译完全指南",
    platforms: ["公众号", "知乎"],
    scheduledAt: "2026-07-05 10:00",
    geoTags: ["视频翻译", "多语言"],
    status: "scheduled",
  },
  {
    id: "2",
    title: "如何选择企业级本地化方案",
    platforms: ["官网 CMS"],
    scheduledAt: "待定",
    geoTags: ["内容本地化", "企业方案"],
    status: "draft",
  },
  {
    id: "3",
    title: "字幕生成准确率对比实测",
    platforms: ["小红书", "视频号"],
    scheduledAt: "2026-07-08 18:00",
    geoTags: ["字幕生成", "技术参数"],
    status: "scheduled",
  },
]

const STATUS_LABEL: Record<QueueItem["status"], string> = {
  draft: "草稿",
  scheduled: "已排期",
  published: "已发布",
}

type GeoPublishQueueProps = {
  className?: string
}

export function GeoPublishQueue({ className }: GeoPublishQueueProps) {
  const [items] = React.useState<QueueItem[]>(MOCK_QUEUE)

  const handleAction = (action: string) => {
    toast({
      title: "功能开发中",
      description: `${action} 将在后续版本接入真实发布 API`,
    })
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-white/5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
            <Send className="h-3.5 w-3.5 text-cyan-500" />
          </span>
          <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">发布队列</span>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 text-[12px]"
          onClick={() => handleAction("添加文章")}
        >
          添加文章
        </Button>
      </div>

      <div className="divide-y divide-slate-100 dark:divide-white/5">
        {items.map((item) => (
          <div key={item.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h4 className="truncate text-[13px] font-medium text-slate-800 dark:text-slate-200">
                  {item.title}
                </h4>
                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {item.scheduledAt}
                  </span>
                  <span>·</span>
                  <span>{item.platforms.join("、")}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {item.geoTags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-flex items-center gap-0.5 rounded-md bg-cyan-50 px-1.5 py-0.5 text-[10px] text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                    >
                      <Tag className="h-2.5 w-2.5" />
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    item.status === "scheduled"
                      ? "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300"
                      : item.status === "published"
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20"
                        : "bg-slate-100 text-slate-600 dark:bg-white/10",
                  )}
                >
                  {STATUS_LABEL[item.status]}
                </span>
                <button
                  type="button"
                  onClick={() => handleAction("编辑队列项")}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="mt-2 flex gap-2">
              <Button
                type="button"
                size="sm"
                className="h-7 bg-cyan-600 text-[11px] hover:bg-cyan-700"
                onClick={() => handleAction("立即发布")}
              >
                立即发布
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => handleAction("调整排期")}
              >
                调整排期
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

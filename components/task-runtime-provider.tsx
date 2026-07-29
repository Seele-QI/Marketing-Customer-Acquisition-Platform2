"use client"

/**
 * 全局任务运行时 Provider — 挂载即恢复轮询，完成时 Toast（非当前页）。
 */
import * as React from "react"
import { toast } from "@/hooks/use-toast"
import {
  getTaskRuntime,
  TASK_KIND_LABELS,
  VIEW_TO_TASK_KIND,
  type TaskKind,
} from "@/lib/task-runtime"

type Props = {
  children: React.ReactNode
  /** 当前主视图，用于判断是否在任务所属页（避免重复打扰） */
  activeView: string
  onNavigate?: (view: string) => void
}

const KIND_TO_VIEW: Record<TaskKind, string> = {
  "dh-video-v2": "数字人视频创作（新）",
  "dh-video-economy": "数字人视频创作（经济版）",
  "image-video": "图文视频",
  mashup: "视频混剪",
  "promo-video": "宣传视频",
  "copywriting-extract": "文案提取",
}

function isOnTaskPage(activeView: string, kind: TaskKind): boolean {
  const mapped = VIEW_TO_TASK_KIND[activeView]
  if (mapped === kind) return true
  return activeView === KIND_TO_VIEW[kind]
}

export function TaskRuntimeProvider({ children, activeView, onNavigate }: Props) {
  const activeViewRef = React.useRef(activeView)
  activeViewRef.current = activeView
  const onNavigateRef = React.useRef(onNavigate)
  onNavigateRef.current = onNavigate

  React.useEffect(() => {
    const rt = getTaskRuntime()
    rt.start()

    return rt.subscribe((ev) => {
      if (ev.type !== "task-terminal") return
      const { task } = ev
      const label = TASK_KIND_LABELS[task.kind]
      const onPage = isOnTaskPage(activeViewRef.current, task.kind)

      if (task.status === "success") {
        if (onPage) return
        const goHistory = task.kind !== "copywriting-extract"
        toast({
          title: `${label}已完成`,
          description: goHistory
            ? "已保存到创作历史，可在「历史记录」查看下载。"
            : "可返回文案提取页查看结果。",
        })
        return
      }

      if (task.status === "failed") {
        if (onPage) return
        toast({
          title: `${label}失败`,
          description: task.error || "请返回对应页面查看详情",
          variant: "destructive",
        })
      }
    })
  }, [])

  return <>{children}</>
}

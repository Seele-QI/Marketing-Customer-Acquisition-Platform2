"use client"

import { LifeBuoy } from "lucide-react"

export function HelpCenterView() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-background p-6">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
            <LifeBuoy className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">帮助中心</h1>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          使用说明与常见问题整理中。如需支持，请通过产品内反馈渠道联系运营团队。
        </p>
      </div>
    </div>
  )
}

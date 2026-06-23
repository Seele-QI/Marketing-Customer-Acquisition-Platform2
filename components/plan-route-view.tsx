"use client"

import { MapPinned } from "lucide-react"

export function PlanRouteView() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto bg-background p-6">
      <div className="mx-auto w-full max-w-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400">
            <MapPinned className="h-5 w-5" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">规划路线</h1>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          行程与路线规划能力接入中。可先通过「文案创作」整理目的地素材与口播脚本。
        </p>
      </div>
    </div>
  )
}

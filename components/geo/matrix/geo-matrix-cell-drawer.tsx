"use client"

import * as React from "react"
import type { MatrixCell } from "@/lib/geo/matrix-types"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"

type Props = {
  cell: MatrixCell | null
  platformLabel: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onCellSave?: (cell: MatrixCell) => void
  saving?: boolean
}

export function GeoMatrixCellDrawer({
  cell,
  platformLabel,
  open,
  onOpenChange,
  onCellSave,
  saving,
}: Props) {
  const [direction, setDirection] = React.useState("")

  React.useEffect(() => {
    setDirection(cell?.contentDirection ?? "")
  }, [cell])

  const dirty = cell != null && direction.trim() !== cell.contentDirection

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        {cell && (
          <>
            <SheetHeader>
              <SheetTitle className="text-left text-[16px]">{cell.title}</SheetTitle>
              <SheetDescription className="text-left">
                {platformLabel} · {cell.format} · {cell.geoIntent}
              </SheetDescription>
            </SheetHeader>
            <div className="mt-6 space-y-4 px-1 text-[13px]">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  主题弧
                </p>
                <p className="text-slate-800 dark:text-slate-200">{cell.themeArc}</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  创作方向
                </p>
                <Textarea
                  value={direction}
                  onChange={(e) => setDirection(e.target.value)}
                  rows={5}
                  className="text-[13px] leading-relaxed"
                />
                {onCellSave && dirty && (
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2"
                    disabled={saving}
                    onClick={() =>
                      onCellSave({ ...cell, contentDirection: direction.trim() })
                    }
                  >
                    {saving ? "保存中…" : "保存创作方向"}
                  </Button>
                )}
              </div>
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  平台原生要点
                </p>
                <p className="leading-relaxed text-slate-700 dark:text-slate-300">
                  {cell.platformNative}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-[12px]">
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-white/5">
                  <p className="text-slate-400">计划日期</p>
                  <p className="font-medium text-slate-700 dark:text-slate-300">{cell.date}</p>
                </div>
                <div className="rounded-lg bg-slate-50 p-2 dark:bg-white/5">
                  <p className="text-slate-400">周次</p>
                  <p className="font-medium text-slate-700 dark:text-slate-300">第 {cell.week} 周</p>
                </div>
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

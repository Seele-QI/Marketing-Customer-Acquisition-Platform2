"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  markdown: string
}

export function GeoArticlePreviewDialog({ open, onOpenChange, title, markdown }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-hidden p-0">
        <DialogHeader className="border-b border-slate-100 px-5 py-3 dark:border-white/10">
          <DialogTitle className="text-[14px] font-semibold">{title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[calc(85vh-4rem)] overflow-y-auto px-5 py-4">
          <pre className="whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
            {markdown}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  )
}

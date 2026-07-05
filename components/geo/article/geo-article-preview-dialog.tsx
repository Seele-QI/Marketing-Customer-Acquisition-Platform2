"use client"

import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

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
          <div
            className={cn(
              "prose prose-sm max-w-none dark:prose-invert",
              "prose-p:my-2 prose-headings:my-3 prose-li:my-0.5",
              "prose-code:text-[13px] text-slate-700 dark:text-slate-300",
            )}
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

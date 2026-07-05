"use client"

import * as React from "react"
import { Code2, Copy, Check } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

type GeoSchemaPreviewProps = {
  schema: object
  title?: string
  className?: string
}

export function GeoSchemaPreview({
  schema,
  title = "JSON-LD 预览",
  className,
}: GeoSchemaPreviewProps) {
  const [copied, setCopied] = React.useState(false)
  const json = JSON.stringify(schema, null, 2)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <section
      aria-label={title}
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-white/[0.03]",
        className,
      )}
    >
      <div className="flex items-center justify-between px-3.5 py-2.5">
        <div className="flex items-center gap-2">
          <Code2 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" aria-hidden />
          <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">{title}</span>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={copied ? "已复制 JSON-LD" : "复制 JSON-LD"}
          onClick={handleCopy}
          className="h-7 text-[11px]"
        >
          {copied ? (
            <>
              <Check className="mr-1 h-3 w-3 text-emerald-500" aria-hidden /> 已复制
            </>
          ) : (
            <>
              <Copy className="mr-1 h-3 w-3" aria-hidden /> 复制
            </>
          )}
        </Button>
      </div>
      <pre className="max-h-[280px] overflow-auto border-t border-slate-100 bg-slate-50/50 p-3 text-[10px] leading-relaxed text-slate-600 dark:border-white/5 dark:bg-black/20 dark:text-slate-400">
        <code>{json}</code>
      </pre>
    </section>
  )
}

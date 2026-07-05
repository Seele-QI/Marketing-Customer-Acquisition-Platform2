"use client"

import * as React from "react"
import { Upload, FileText, X, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"

export type GeoUploadedDoc = {
  name: string
  size: number
  text: string
  preview?: string
}

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown"]
const UNSUPPORTED_HINT = "PDF / Word 请先转为 .txt 或 .md 后上传"

type Props = {
  docs: GeoUploadedDoc[]
  onChange: (docs: GeoUploadedDoc[]) => void
  className?: string
}

function isTextFile(name: string): boolean {
  const lower = name.toLowerCase()
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function isUnsupportedBinary(name: string): boolean {
  const lower = name.toLowerCase()
  return [".pdf", ".doc", ".docx"].some((ext) => lower.endsWith(ext))
}

function makePreview(text: string, maxLen = 120): string {
  const oneLine = text.replace(/\s+/g, " ").trim()
  return oneLine.length > maxLen ? `${oneLine.slice(0, maxLen)}…` : oneLine
}

async function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () => reject(new Error("文件读取失败"))
    reader.readAsText(file, "utf-8")
  })
}

export function GeoDocUploadPanel({ docs, onChange, className }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  const processFile = async (file: File) => {
    if (isUnsupportedBinary(file.name)) {
      toast({
        title: "暂不支持该格式",
        description: UNSUPPORTED_HINT,
        variant: "destructive",
      })
      return
    }

    if (!isTextFile(file.name)) {
      toast({
        title: "仅支持文本格式",
        description: "请上传 .txt 或 .md 文件",
        variant: "destructive",
      })
      return
    }

    try {
      const text = await readTextFile(file)
      if (!text.trim()) {
        toast({ title: "文件为空", description: file.name, variant: "destructive" })
        return
      }
      const entry: GeoUploadedDoc = {
        name: file.name,
        size: file.size,
        text,
        preview: makePreview(text),
      }
      onChange([...docs, entry])
      toast({ title: "文档已添加", description: file.name })
    } catch {
      toast({ title: "读取失败", description: file.name, variant: "destructive" })
    }
  }

  const handleFiles = (files: FileList | null) => {
    if (!files) return
    Array.from(files).forEach((f) => void processFile(f))
  }

  const removeDoc = (index: number) => {
    onChange(docs.filter((_, i) => i !== index))
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">资料库</h3>
          <p className="text-[11px] text-slate-500">支持 .txt / .md 即时解析</p>
        </div>
        <span className="text-[11px] text-slate-400">{docs.length} 份</span>
      </div>

      <div
        role="button"
        tabIndex={0}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200/80 bg-slate-50/40 p-6 transition-colors hover:border-cyan-400/60 hover:bg-cyan-50/20 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-cyan-500/30"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
        }}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
          <Upload className="h-4 w-4 text-cyan-500" />
        </span>
        <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300">
          拖拽或点击上传企业资料
        </p>
        <p className="text-[10px] text-slate-400">{UNSUPPORTED_HINT}</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.markdown"
        multiple
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
      />

      {docs.length > 0 && (
        <ul className="mt-3 space-y-2">
          {docs.map((d, i) => (
            <li
              key={`${d.name}-${i}`}
              className="group flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2 dark:border-white/5 dark:bg-white/[0.03]"
            >
              <FileText className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-500" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12px] font-medium text-slate-700 dark:text-slate-300">
                  {d.name}
                </p>
                {d.preview && (
                  <p className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-slate-400">
                    {d.preview}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label={`移除 ${d.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  removeDoc(i)
                }}
                className="shrink-0 text-slate-400 opacity-60 transition-opacity hover:text-red-500 group-hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {docs.length === 0 && (
        <p className="mt-2 flex items-center gap-1 text-[10px] text-amber-600/80 dark:text-amber-400/70">
          <AlertCircle className="h-3 w-3" />
          上传资料可提升 Skill 质量；也可仅用实体信息生成
        </p>
      )}
    </div>
  )
}

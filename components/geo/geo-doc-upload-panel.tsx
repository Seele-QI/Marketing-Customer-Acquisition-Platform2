"use client"

import * as React from "react"
import { Upload, FileText, X, AlertCircle, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import {
  ACCEPTED_DOCUMENT_EXTENSIONS,
  isSupportedDocumentName,
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
} from "@/lib/ip-positioning-upload"

export type GeoUploadedDoc = {
  name: string
  size: number
  text: string
  preview?: string
}

const TEXT_EXTENSIONS = [".txt", ".md", ".markdown"]

type Props = {
  docs: GeoUploadedDoc[]
  onChange: (docs: GeoUploadedDoc[]) => Promise<void> | void
  className?: string
}

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".")
  return idx < 0 ? "" : name.slice(idx).toLowerCase()
}

function isTextFile(name: string): boolean {
  return TEXT_EXTENSIONS.includes(getExtension(name))
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

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  let binary = ""
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

async function extractViaApi(file: File): Promise<string> {
  const base64 = await fileToBase64(file)
  const res = await fetch("/api/geo/documents/extract", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      base64,
    }),
  })
  const data = (await res.json()) as { text?: string; error?: string }
  if (!res.ok) {
    if (res.status === 401) throw new Error("请先登录后再上传文档")
    throw new Error(data.error || "文档解析失败")
  }
  if (!data.text?.trim()) throw new Error(data.error || "未能提取有效正文")
  return data.text
}

export function GeoDocUploadPanel({ docs, onChange, className }: Props) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const busyRef = React.useRef(false)
  const [busyName, setBusyName] = React.useState<string | null>(null)

  const processFile = async (file: File): Promise<GeoUploadedDoc | null> => {
    if (!isSupportedDocumentName(file.name)) {
      const ext = getExtension(file.name)
      toast({
        title: "暂不支持该格式",
        description:
          ext === ".doc"
            ? "旧版 .doc 请另存为 .docx 后上传"
            : `请上传 Word (.docx) / PDF / TXT / MD`,
        variant: "destructive",
      })
      return null
    }

    if (file.size > MAX_DOCUMENT_BYTES) {
      toast({
        title: "文件过大",
        description: `${file.name} 超过 20MB`,
        variant: "destructive",
      })
      return null
    }

    setBusyName(file.name)
    try {
      const text = isTextFile(file.name)
        ? await readTextFile(file)
        : await extractViaApi(file)

      if (!text.trim()) {
        toast({ title: "文件为空", description: file.name, variant: "destructive" })
        return null
      }
      const entry: GeoUploadedDoc = {
        name: file.name,
        size: file.size,
        text,
        preview: makePreview(text),
      }
      return entry
    } catch (err) {
      toast({
        title: "解析失败",
        description: err instanceof Error ? err.message : file.name,
        variant: "destructive",
      })
      return null
    } finally {
      setBusyName(null)
    }
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files || busyRef.current) return
    const candidates = Array.from(files).slice(0, Math.max(0, MAX_DOCUMENTS - docs.length))
    if (candidates.length < files.length) {
      toast({ title: "已达上限", description: `最多上传 ${MAX_DOCUMENTS} 份资料`, variant: "destructive" })
    }
    if (!candidates.length) return
    busyRef.current = true
    try {
      const added: GeoUploadedDoc[] = []
      for (const file of candidates) {
        const entry = await processFile(file)
        if (entry) added.push(entry)
      }
      if (added.length) {
        await onChange([...docs, ...added])
        toast({ title: "文档已添加", description: `已保存 ${added.length} 份企业资料` })
      }
    } catch (err) {
      toast({ title: "资料保存失败", description: err instanceof Error ? err.message : "请重试", variant: "destructive" })
    } finally {
      busyRef.current = false
      setBusyName(null)
    }
  }

  const removeDoc = async (index: number) => {
    if (busyRef.current) return
    try {
      await onChange(docs.filter((_, i) => i !== index))
    } catch (err) {
      toast({ title: "资料移除失败", description: err instanceof Error ? err.message : "请重试", variant: "destructive" })
    }
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
          <p className="text-[11px] text-slate-500">
            支持 Word (.docx) / PDF / TXT / MD · 单文件 ≤ 20MB
          </p>
        </div>
        <span className="text-[11px] text-slate-400">
          {docs.length}/{MAX_DOCUMENTS} 份
        </span>
      </div>

      <div
        role="button"
        tabIndex={0}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-200/80 bg-slate-50/40 p-6 transition-colors hover:border-cyan-400/60 hover:bg-cyan-50/20 dark:border-white/10 dark:bg-white/[0.02] dark:hover:border-cyan-500/30",
          busyName && "pointer-events-none opacity-70",
        )}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          void handleFiles(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click()
        }}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
          {busyName ? (
            <Loader2 className="h-4 w-4 animate-spin text-cyan-500" />
          ) : (
            <Upload className="h-4 w-4 text-cyan-500" />
          )}
        </span>
        <p className="text-[12px] font-medium text-slate-700 dark:text-slate-300">
          {busyName ? `正在解析 ${busyName}…` : "拖拽或点击上传企业资料"}
        </p>
        <p className="text-[10px] text-slate-400">.docx / .pdf / .txt / .md</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_DOCUMENT_EXTENSIONS}
        multiple
        disabled={Boolean(busyName)}
        className="hidden"
        onChange={(e) => {
          void handleFiles(e.target.files)
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
                disabled={Boolean(busyName)}
                aria-label={`移除 ${d.name}`}
                onClick={(e) => {
                  e.stopPropagation()
                  void removeDoc(i)
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
          上传后自动提取企业事实；资料缺失项会标记待补充，不要求手工整理
        </p>
      )}
    </div>
  )
}

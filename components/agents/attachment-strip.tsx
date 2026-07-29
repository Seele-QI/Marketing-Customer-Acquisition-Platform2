"use client"

import * as React from "react"
import { FileText, ImageIcon, Loader2, Paperclip, TriangleAlert, X } from "lucide-react"

import {
  AGENT_ATTACHMENT_ACCEPT,
  createPreparingAgentAttachment,
  prepareAgentAttachment,
  releaseAgentAttachment,
  validateAgentAttachmentFiles,
  type AgentAttachment,
  type AgentAttachmentScope,
} from "@/lib/agents/attachments"
import { cn } from "@/lib/utils"

export function AttachmentStrip({
  attachments,
  onChange,
  disabled,
}: {
  attachments: AgentAttachment[]
  onChange: React.Dispatch<React.SetStateAction<AgentAttachment[]>>
  disabled?: boolean
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const controllers = React.useRef(new Map<string, AbortController>())
  const latestAttachments = React.useRef(attachments)
  const [notice, setNotice] = React.useState("")

  React.useEffect(() => {
    latestAttachments.current = attachments
  }, [attachments])

  React.useEffect(
    () => () => {
      controllers.current.forEach((controller) => controller.abort())
      latestAttachments.current.forEach(releaseAgentAttachment)
    }, [],
  )

  const addFiles = React.useCallback(
    (files: File[]) => {
      const existing = {
        images: attachments.filter((item) => item.kind === "image").length,
        documents: attachments.filter((item) => item.kind === "document").length,
      }
      const { accepted, rejected } = validateAgentAttachmentFiles(files, existing)
      setNotice(rejected.map((item) => `${item.file.name}：${item.reason}`).join("；"))
      for (const file of accepted) {
        const pending = createPreparingAgentAttachment(file)
        const controller = new AbortController()
        controllers.current.set(pending.id, controller)
        onChange((current) => [...current, pending])
        void prepareAgentAttachment(pending, file, { signal: controller.signal }).then((ready) => {
          controllers.current.delete(pending.id)
          onChange((current) => current.map((item) => (item.id === pending.id ? ready : item)))
        })
      }
    },
    [attachments, onChange],
  )

  const remove = (attachment: AgentAttachment) => {
    controllers.current.get(attachment.id)?.abort()
    controllers.current.delete(attachment.id)
    releaseAgentAttachment(attachment)
    onChange((current) => current.filter((item) => item.id !== attachment.id))
  }

  const setScope = (id: string, scope: AgentAttachmentScope) => {
    onChange((current) => current.map((item) => (item.id === id ? { ...item, scope } : item)))
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        className="sr-only"
        type="file"
        multiple
        accept={AGENT_ATTACHMENT_ACCEPT}
        onChange={(event) => {
          addFiles(Array.from(event.currentTarget.files ?? []))
          event.currentTarget.value = ""
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-blue-500 hover:text-blue-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        <Paperclip className="h-3.5 w-3.5" />
        上传图片或文件
      </button>
      {notice ? (
        <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
          <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {notice}
        </p>
      ) : null}
      {attachments.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className={cn(
                "flex min-w-0 items-center gap-2 rounded-xl border bg-slate-50 px-2.5 py-2 dark:bg-slate-900",
                attachment.status === "failed" ? "border-rose-300" : "border-slate-200 dark:border-slate-700",
              )}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white text-slate-600 shadow-sm dark:bg-slate-800">
                {attachment.status === "preparing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : attachment.kind === "image" ? (
                  <ImageIcon className="h-4 w-4" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{attachment.name}</p>
                {attachment.kind === "document" && attachment.status === "ready" ? (
                  <select
                    aria-label={`${attachment.name} 知识范围`}
                    value={attachment.scope}
                    onChange={(event) => setScope(attachment.id, event.target.value as AgentAttachmentScope)}
                    className="mt-1 max-w-full bg-transparent text-[11px] text-slate-500 outline-none"
                  >
                    <option value="temporary">仅当前任务</option>
                    <option value="department">部门知识库</option>
                    <option value="company">公司知识库</option>
                  </select>
                ) : (
                  <p className={cn("mt-0.5 truncate text-[11px]", attachment.status === "failed" ? "text-rose-600" : "text-slate-500")}>
                    {attachment.status === "preparing" ? "正在安全解析" : attachment.error ?? "当前任务图片"}
                  </p>
                )}
              </div>
              <button type="button" onClick={() => remove(attachment)} aria-label={`移除 ${attachment.name}`} className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-800">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}

"use client"

import * as React from "react"
import {
  Images,
  Trash2,
  ExternalLink,
  Download,
  X,
  HardDrive,
  RefreshCw,
  Package,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  SECONDARY_ARCHIVE_STORAGE_KEY,
  listArchivedSecondaryImages,
  removeArchivedSecondaryImage,
  clearArchivedSecondaryImages,
  type ArchivedSecondaryImage,
} from "@/lib/generated-image-archive"
import { downloadImageFromUrl } from "@/lib/download-image"
import { cn } from "@/lib/utils"
import { toFriendlyUpdateError } from "@/lib/update-error"
import { ModuleTutorialButton } from "@/components/tutorial/module-tutorial-button"
import { MemoryCenterDialog } from "@/components/memory/memory-center-dialog"
import { MemorySettingsCard } from "@/components/memory/memory-settings-card"

type UpdateStatusState = {
  status: string
  currentVersion: string
  availableVersion?: string
  releaseNotes?: string
  percent?: number
  transferred?: number
  total?: number
  error?: string
  forceRequired?: boolean
}

function formatSavedAt(iso: string): string {
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return d.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

function statusLabel(status: string | undefined): string {
  switch (status) {
    case "checking":
      return "正在检查…"
    case "available":
      return "发现新版本"
    case "not-available":
      return "已是最新版本"
    case "downloading":
      return "正在下载…"
    case "ready":
      return "更新已就绪，可安装并重启"
    case "error":
      return "更新出错"
    default:
      return "未检查"
  }
}

function AppUpdateSection() {
  const api = typeof window !== "undefined" ? window.electronAPI : undefined
  const [version, setVersion] = React.useState<string>("—")
  const [isPackaged, setIsPackaged] = React.useState(false)
  const [feedConfigured, setFeedConfigured] = React.useState(false)
  const [status, setStatus] = React.useState<UpdateStatusState | null>(null)
  const [busy, setBusy] = React.useState<"check" | "download" | "install" | null>(null)
  const [message, setMessage] = React.useState<string>("")

  React.useEffect(() => {
    if (!api) return
    let cancelled = false
    ;(async () => {
      try {
        if (api.getAppInfo) {
          const info = await api.getAppInfo()
          if (cancelled) return
          setVersion(info.version)
          setIsPackaged(info.isPackaged)
          setFeedConfigured(info.feedConfigured)
        } else {
          const v = await api.getAppVersion()
          if (!cancelled) setVersion(v)
        }
        if (api.getUpdateStatus) {
          const st = await api.getUpdateStatus()
          if (!cancelled) setStatus(st)
        }
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api])

  React.useEffect(() => {
    if (!api?.onUpdateStatus) return
    return api.onUpdateStatus((payload) => {
      setStatus(payload)
      if (payload.error) setMessage(toFriendlyUpdateError(payload.error))
    })
  }, [api])

  React.useEffect(() => {
    if (!api?.onUpdateProgress) return
    return api.onUpdateProgress((payload) => {
      setStatus((prev) =>
        prev
          ? {
              ...prev,
              status: "downloading",
              percent: payload.percent,
              transferred: payload.transferred,
              total: payload.total,
            }
          : {
              status: "downloading",
              currentVersion: version,
              percent: payload.percent,
              transferred: payload.transferred,
              total: payload.total,
            },
      )
    })
  }, [api, version])

  const percent = Math.max(0, Math.min(100, Math.round(status?.percent ?? 0)))
  const canCheck = Boolean(api) && isPackaged && feedConfigured && busy == null
  const canDownload =
    Boolean(api) &&
    isPackaged &&
    busy == null &&
    (status?.status === "available" || status?.status === "error")
  const canInstall = Boolean(api) && busy == null && status?.status === "ready"

  const onCheck = async () => {
    if (!api) return
    setBusy("check")
    setMessage("")
    try {
      const result = await api.checkForUpdate()
      if (!result.ok) {
        setMessage(toFriendlyUpdateError(result.error || "检查更新失败"))
        return
      }
      if (result.info?.version) {
        setMessage(`发现新版本 v${result.info.version}`)
      } else if (result.status === "not-available") {
        setMessage(`已是最新版本 v${version}`)
      }
      if (api.getUpdateStatus) setStatus(await api.getUpdateStatus())
    } catch (e) {
      setMessage(toFriendlyUpdateError(e instanceof Error ? e.message : "检查更新失败"))
    } finally {
      setBusy(null)
    }
  }

  const onDownload = async () => {
    if (!api) return
    setBusy("download")
    setMessage("")
    try {
      const result = await api.downloadUpdate()
      if (!result.ok) {
        setMessage(toFriendlyUpdateError(result.error || "下载失败"))
        return
      }
      setMessage("下载完成，可安装并重启")
      if (api.getUpdateStatus) setStatus(await api.getUpdateStatus())
    } catch (e) {
      setMessage(toFriendlyUpdateError(e instanceof Error ? e.message : "下载失败"))
    } finally {
      setBusy(null)
    }
  }

  const onInstall = async () => {
    if (!api) return
    setBusy("install")
    setMessage("正在安装并重启…")
    try {
      await api.installUpdate()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "安装失败")
      setBusy(null)
    }
  }

  if (!api) {
    return (
      <section className="mb-8 rounded-2xl border border-border/70 bg-card/55 p-5 shadow-sm ring-1 ring-border/40 backdrop-blur-sm dark:bg-card/40 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300">
            <Package className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">应用更新</p>
            <p className="mt-1 text-sm text-muted-foreground">
              版本检查与安装包更新仅在桌面客户端（Electron）中可用。请使用安装版应用进入本页拉取更新。
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="mb-8 rounded-2xl border border-border/70 bg-card/55 p-5 shadow-sm ring-1 ring-border/40 backdrop-blur-sm dark:bg-card/40 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-300">
            <Package className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <p className="text-sm font-medium text-foreground">应用更新</p>
            <p className="text-sm text-muted-foreground">
              当前版本{" "}
              <span className="font-mono font-semibold tabular-nums text-foreground">v{version}</span>
              {status?.availableVersion ? (
                <>
                  {" "}
                  · 最新{" "}
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    v{status.availableVersion}
                  </span>
                </>
              ) : null}
            </p>
            <p className="text-xs text-muted-foreground">{statusLabel(status?.status)}</p>
            {!isPackaged ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                当前为开发运行，自动更新仅在打包安装包中可用。
              </p>
            ) : null}
            {isPackaged && !feedConfigured ? (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                未配置 UPDATE_FEED_URL / CENTRAL_UPDATE_URL，无法检查更新源。
              </p>
            ) : null}
            {status?.releaseNotes ? (
              <pre className="mt-2 max-h-28 overflow-auto whitespace-pre-wrap rounded-lg border border-border/60 bg-background/60 p-2 text-xs text-muted-foreground">
                {status.releaseNotes}
              </pre>
            ) : null}
            {message ? <p className="text-xs text-foreground/80">{message}</p> : null}
            {status?.status === "downloading" || (busy === "download" && percent > 0) ? (
              <div className="mt-3 w-full max-w-md space-y-1.5">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-[width] duration-200"
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <p className="font-mono text-[11px] tabular-nums text-muted-foreground">{percent}%</p>
              </div>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!canCheck}
            onClick={() => void onCheck()}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", busy === "check" && "animate-spin")} aria-hidden />
            检查更新
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={!canDownload}
            onClick={() => void onDownload()}
          >
            <Download className="h-3.5 w-3.5" aria-hidden />
            下载更新
          </Button>
          <Button
            type="button"
            size="sm"
            className="gap-1.5"
            disabled={!canInstall}
            onClick={() => void onInstall()}
          >
            安装并重启
          </Button>
        </div>
      </div>
    </section>
  )
}

export function SettingsView() {
  const [items, setItems] = React.useState<ArchivedSecondaryImage[]>([])
  const [preview, setPreview] = React.useState<ArchivedSecondaryImage | null>(null)
  const [memoryCenterOpen, setMemoryCenterOpen] = React.useState(false)

  const refresh = React.useCallback(() => {
    setItems(listArchivedSecondaryImages())
  }, [])

  React.useEffect(() => {
    refresh()
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key === SECONDARY_ARCHIVE_STORAGE_KEY) refresh()
    }
    const onCustom = () => refresh()
    window.addEventListener("storage", onStorage)
    window.addEventListener("agenthub-archive-updated", onCustom as EventListener)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener("agenthub-archive-updated", onCustom as EventListener)
    }
  }, [refresh])

  React.useEffect(() => {
    if (preview == null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPreview(null)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [preview])

  return (
    <div className="relative isolate flex h-full min-h-0 flex-col overflow-auto">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-teal-50/55 via-sky-50/30 to-background dark:from-teal-950/25 dark:via-slate-950 dark:to-background"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [background-image:radial-gradient(ellipse_900px_480px_at_15%_-10%,rgba(20,184,166,0.14),transparent_55%),radial-gradient(ellipse_800px_420px_at_92%_108%,rgba(56,189,248,0.12),transparent_52%)] dark:[background-image:radial-gradient(ellipse_900px_480px_at_12%_0%,rgba(45,212,191,0.08),transparent_55%),radial-gradient(ellipse_720px_380px_at_88%_100%,rgba(59,130,246,0.1),transparent_50%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-[0.35] dark:opacity-[0.12] [background-image:linear-gradient(to_right,rgba(15,118,110,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(14,165,233,0.05)_1px,transparent_1px)] [background-size:56px_56px] [mask-image:radial-gradient(ellipse_75%_65%_at_50%_40%,black,transparent)]"
      />

      <div className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-4 flex justify-end">
          <ModuleTutorialButton view="设置" />
        </div>
        <header className="relative mb-8 overflow-hidden rounded-2xl border border-border/60 bg-card/75 shadow-sm ring-1 ring-teal-500/10 backdrop-blur-md dark:bg-card/50 dark:ring-teal-400/10">
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-br from-teal-500/[0.06] via-transparent to-sky-500/[0.05] dark:from-teal-400/[0.04] dark:to-sky-500/[0.03]"
          />
          <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:gap-6 sm:p-8">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500/15 to-sky-500/10 text-teal-600 shadow-inner ring-1 ring-teal-500/15 dark:text-teal-300 dark:ring-teal-400/20">
              <Images className="h-7 w-7" aria-hidden />
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[26px]">
                  设置
                </h1>
                <p className="mt-2 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                  管理应用更新与自动保存的图片归档。外链可能过期，请及时下载备份。
                </p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-background/80 px-3 py-1.5 font-medium text-foreground/90 backdrop-blur-sm dark:bg-background/40">
                  <HardDrive className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                  本地归档 · 最多 50 条
                </span>
              </div>
            </div>
          </div>
        </header>

        <AppUpdateSection />

        <MemorySettingsCard onOpen={() => setMemoryCenterOpen(true)} />

        <section className="rounded-2xl border border-border/70 bg-card/55 p-5 shadow-sm ring-1 ring-border/40 backdrop-blur-sm dark:bg-card/40 sm:p-6">
          <div className="mb-6 flex flex-col gap-4 border-b border-border/60 pb-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">自动保存图片</p>
              <p className="mt-1 text-sm text-muted-foreground">
                共 <span className="font-mono font-semibold tabular-nums text-foreground">{items.length}</span>{" "}
                条记录（最多保留 50 条）
              </p>
            </div>
            {items.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5 border-destructive/25 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => {
                  if (window.confirm("确定清空全部自动保存的图片记录？")) {
                    clearArchivedSecondaryImages()
                  }
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                清空全部
              </Button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-teal-500/25 bg-gradient-to-b from-teal-500/[0.04] to-muted/20 px-6 py-16 text-center dark:border-teal-400/20 dark:from-teal-500/[0.03]">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground ring-1 ring-border/60">
                <Images className="h-7 w-7 opacity-60" aria-hidden />
              </div>
              <p className="max-w-md text-pretty text-sm leading-relaxed text-muted-foreground">
                暂无记录。AI 生成的图片与成稿会自动出现在此。
              </p>
            </div>
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {items.map((it) => (
                <li
                  key={it.id}
                  className={cn(
                    "group/card flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm",
                    "ring-1 ring-black/[0.03] transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md dark:ring-white/[0.04]",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setPreview(it)}
                    className={cn(
                      "relative flex aspect-square w-full cursor-zoom-in outline-none",
                      "bg-gradient-to-b from-slate-100/90 to-slate-200/40 dark:from-muted/50 dark:to-muted/25",
                      "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    )}
                    aria-label={`查看「${it.slotLabel}」大图`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={it.url}
                      alt=""
                      className="pointer-events-none h-full w-full object-contain p-2 transition-transform duration-300 group-hover/card:scale-[1.03]"
                      loading="lazy"
                    />
                    <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-white opacity-0 shadow-md backdrop-blur-sm transition-opacity group-hover/card:opacity-100">
                      点击查看大图
                    </span>
                  </button>
                  <div className="flex flex-1 flex-col gap-3 border-t border-border/70 p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-lg bg-muted/90 px-2 py-1 text-xs font-semibold text-foreground ring-1 ring-border/50">
                        {it.slotLabel}
                      </span>
                      <span
                        className={cn(
                          "rounded-lg px-2 py-1 text-xs font-medium ring-1",
                          "bg-emerald-500/10 text-emerald-800 ring-emerald-500/20 dark:text-emerald-200",
                        )}
                      >
                        {it.source}
                      </span>
                    </div>
                    <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                      {formatSavedAt(it.savedAt)}
                    </p>
                    <div className="mt-auto flex flex-wrap gap-2 border-t border-border/50 pt-3">
                      <Button type="button" variant="secondary" size="sm" className="flex-1 gap-1 sm:flex-none" asChild>
                        <a href={it.url} target="_blank" rel="noopener noreferrer">
                          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                          新标签
                        </a>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="flex-1 gap-1 sm:flex-none"
                        onClick={() =>
                          void downloadImageFromUrl(
                            it.url,
                            `${it.slotLabel}-${it.savedAt.slice(0, 10)}`,
                          )
                        }
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden />
                        下载
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeArchivedSecondaryImage(it.id)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {preview ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="archive-preview-title"
        >
          <button
            type="button"
            className="absolute inset-0 bg-black/78 backdrop-blur-md"
            aria-label="关闭预览"
            onClick={() => setPreview(null)}
          />
          <div className="relative z-10 flex max-h-[min(92vh,900px)] w-full max-w-[min(96vw,1100px)] flex-col items-center gap-3">
            <div className="flex w-full items-center justify-between gap-3 text-white">
              <p id="archive-preview-title" className="truncate text-sm font-medium drop-shadow">
                {preview.slotLabel} · {preview.source}
              </p>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
                aria-label="关闭"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <div className="max-h-[min(85vh,820px)] w-full overflow-auto rounded-xl bg-black/20 p-2 ring-1 ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={preview.url}
                alt={preview.slotLabel}
                className="mx-auto max-h-[min(82vh,800px)] w-auto max-w-full object-contain"
              />
            </div>
            <p className="text-center text-xs text-white/75">{formatSavedAt(preview.savedAt)}</p>
          </div>
        </div>
      ) : null}
      <MemoryCenterDialog open={memoryCenterOpen} onOpenChange={setMemoryCenterOpen} />
    </div>
  )
}

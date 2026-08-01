import { AlertCircle, Download, ImageIcon, Loader2 } from "lucide-react"

import type { PosterAspectRatio } from "@/lib/poster/types"

export type PosterViewStatus = "idle" | "running" | "success" | "failed"

type PosterResultGalleryProps = {
  status: PosterViewStatus
  imageUrls: string[]
  aspectRatio: PosterAspectRatio
  stageLabel: string
  warning: string
  error: string
}

export function PosterResultGallery({
  status,
  imageUrls,
  aspectRatio,
  stageLabel,
  warning,
  error,
}: PosterResultGalleryProps) {
  const previewRatio = aspectRatio.replace(":", " / ")

  return (
    <section className="min-h-[560px] rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-950">生成结果</h2>
        <span className="text-xs text-slate-400">确认后下载使用</span>
      </div>

      {status === "success" && imageUrls.length > 0 ? (
        <>
          {warning && (
            <p className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-700">
              {warning}
            </p>
          )}
          <div className="mt-5 grid items-start gap-4 md:grid-cols-2">
            {imageUrls.map((url, index) => (
              <figure
                key={`${url}-${index}`}
                className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100"
              >
                <div
                  className="flex max-h-[660px] w-full items-center justify-center bg-slate-100"
                  style={{ aspectRatio: previewRatio }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={`生成的海报 ${index + 1}`}
                    className="h-full w-full object-contain"
                  />
                </div>
                <figcaption className="flex items-center justify-between gap-3 bg-white p-3">
                  <span className="text-xs text-slate-500">
                    方案 {index + 1} · {aspectRatio}
                  </span>
                  <a
                    href={url}
                    download={`poster-${index + 1}.png`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-700"
                  >
                    <Download className="h-3.5 w-3.5" />
                    下载
                  </a>
                </figcaption>
              </figure>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-5 flex min-h-[490px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 text-center">
          {status === "running" ? (
            <>
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-violet-500 shadow-sm">
                <Loader2 className="h-6 w-6 animate-spin" />
              </span>
              <p className="mt-4 text-sm font-medium text-slate-700">
                {stageLabel || "RunningHub 正在生成海报"}
              </p>
              <p className="mt-1 text-xs text-slate-400">两张候选图会并行生成，请保持当前页面开启</p>
            </>
          ) : status === "failed" ? (
            <>
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                <AlertCircle className="h-6 w-6" />
              </span>
              <p className="mt-4 text-sm font-medium text-rose-700">海报生成失败</p>
              <p className="mt-1 max-w-md text-xs leading-5 text-slate-500">{error}</p>
            </>
          ) : (
            <>
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-slate-300 shadow-sm">
                <ImageIcon className="h-6 w-6" />
              </span>
              <p className="mt-4 text-sm font-medium text-slate-600">填写左侧设置后生成海报</p>
              <p className="mt-1 text-xs text-slate-400">
                使用 RunningHub 图片模型，每次生成 2 张候选图
              </p>
            </>
          )}
        </div>
      )}
    </section>
  )
}

import {
  AlertCircle,
  Download,
  ImageIcon,
  Loader2,
  RefreshCw,
  ScanSearch,
} from "lucide-react"

import type { ImageWorkbenchResultState } from "@/components/image-workbench/image-result-gallery"
import type {
  ImageWorkbenchMode,
  ReferenceRole,
} from "@/lib/image-workbench/types"

type ImageResultCanvasProps = ImageWorkbenchResultState & {
  mode: ImageWorkbenchMode
  onUseAsReference: (url: string, role: ReferenceRole) => void
  onRegenerate: () => void
}

export function ImageResultCanvas({
  mode,
  status,
  imageUrls,
  aspectRatio,
  stageLabel,
  warning,
  error,
  onUseAsReference,
  onRegenerate,
}: ImageResultCanvasProps) {
  const noun = mode === "poster" ? "海报" : "图片"
  const previewRatio = aspectRatio.replace(":", " / ")

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-[#e9ebef]">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[#d9dce2] px-4 text-xs text-[#6d727c]">
        <strong className="text-[#262930]">候选结果</strong>
        <span>{imageUrls.length || 2} 张</span>
        <span className="ml-auto">适应画布 · 并排比较 · {aspectRatio}</span>
      </div>

      <div className="min-h-[430px] flex-1 overflow-y-auto p-4 pb-6 sm:p-6">
        {status === "success" && imageUrls.length > 0 ? (
          <>
            {warning && (
              <p className="mx-auto mb-4 max-w-4xl rounded-lg bg-[#fff6df] px-3 py-2 text-xs text-[#8a6415]">
                {warning}
              </p>
            )}
            <div className="mx-auto grid max-w-5xl items-start justify-center gap-4 md:grid-cols-2">
              {imageUrls.map((url, index) => (
                <figure
                  key={`${url}-${index}`}
                  className="group overflow-hidden rounded-xl border border-[#ced1d8] bg-[#f7f7f5] shadow-[0_18px_44px_rgba(27,31,42,0.12)]"
                >
                  <div
                    className="flex max-h-[650px] w-full items-center justify-center bg-[radial-gradient(#d2d5dc_0.7px,transparent_0.7px)] [background-size:12px_12px]"
                    style={{ aspectRatio: previewRatio }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`生成的${noun} ${index + 1}`}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <figcaption className="flex flex-wrap items-center gap-1.5 border-t border-[#e0e1df] bg-[#fbfbf9] p-2.5">
                    <span className="mr-auto text-[11px] text-[#737782]">
                      方案 {index + 1}
                    </span>
                    {mode === "poster" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => onUseAsReference(url, "subject")}
                          className="rounded-md px-2 py-1.5 text-[11px] text-[#555b66] hover:bg-[#eef1f8]"
                        >
                          设为主体
                        </button>
                        <button
                          type="button"
                          onClick={() => onUseAsReference(url, "style")}
                          className="rounded-md px-2 py-1.5 text-[11px] text-[#555b66] hover:bg-[#eef1f8]"
                        >
                          设为风格
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onUseAsReference(url, "general")}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[11px] text-[#555b66] hover:bg-[#eef1f8]"
                      >
                        <ScanSearch className="h-3.5 w-3.5" />
                        设为参考
                      </button>
                    )}
                    <a
                      href={url}
                      download={`image-workbench-${mode}-${index + 1}.png`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-[#24272d] px-2.5 py-1.5 text-[11px] font-medium text-white"
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载
                    </a>
                  </figcaption>
                </figure>
              ))}
            </div>
            <div className="mt-4 flex justify-center">
              <button
                type="button"
                onClick={onRegenerate}
                className="inline-flex items-center gap-2 rounded-lg border border-[#cfd2d8] bg-[#fbfbf9] px-3 py-2 text-xs font-medium text-[#4f545e] hover:bg-white"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                使用相同设置再次生成
              </button>
            </div>
          </>
        ) : (
          <div className="mx-auto flex h-full min-h-[400px] max-w-2xl flex-col items-center justify-center text-center">
            {status === "running" ? (
              <>
                <div className="flex gap-3">
                  {[0, 1].map((item) => (
                    <div
                      key={item}
                      className="flex h-44 w-32 items-center justify-center rounded-xl border border-[#d5d8df] bg-[#f4f5f5] shadow-sm"
                    >
                      <Loader2 className="h-6 w-6 animate-spin text-[#3157df]" />
                    </div>
                  ))}
                </div>
                <p className="mt-5 text-sm font-medium text-[#444952]">
                  {stageLabel || `正在生成${noun}候选图`}
                </p>
                <p className="mt-1 text-xs text-[#858a94]">两张候选图并行创作，请稍候</p>
              </>
            ) : status === "failed" ? (
              <>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fff0ee]">
                  <AlertCircle className="h-5 w-5 text-[#d34b40]" />
                </span>
                <p className="mt-4 text-sm font-semibold text-[#30333a]">{noun}生成失败</p>
                <p className="mt-1 max-w-md text-xs leading-5 text-[#777c86]">{error}</p>
                <button
                  type="button"
                  onClick={onRegenerate}
                  className="mt-4 rounded-lg bg-[#25282e] px-3 py-2 text-xs font-medium text-white"
                >
                  重新生成
                </button>
              </>
            ) : (
              <>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#d8dbe1] bg-[#f7f7f5]">
                  <ImageIcon className="h-5 w-5 text-[#9ba0aa]" />
                </span>
                <p className="mt-4 text-sm font-semibold text-[#3c4048]">从描述开始创作</p>
                <p className="mt-1 max-w-sm text-xs leading-5 text-[#858a94]">
                  设置左侧参数，在下方输入画面描述，每次生成 2 张候选图。
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"

import { ImageRatioSelector } from "@/components/image-workbench/image-ratio-selector"
import type {
  GeneratedReferenceSeed,
  ImageWorkbenchPanelDraft,
} from "@/components/image-workbench/panel-contract"
import { ReferenceImageUploader } from "@/components/image-workbench/reference-image-uploader"
import { buildGeneralImagePrompt } from "@/lib/image-workbench/image-prompt"
import { generatedImageUrlToReference } from "@/lib/image-workbench/reference-images"
import {
  resolveImageAspectRatio,
  type ImageOrientation,
  type ImageRatioFamily,
  type ImageResolution,
  type ReferenceMode,
  type WorkbenchReferenceImage,
} from "@/lib/image-workbench/types"

const IMAGE_TEMPLATE_OPTIONS = ["电商主图", "人物写真", "场景设计", "社媒配图", "自由创作"] as const
const REFERENCE_MODE_OPTIONS = [
  ["preserve_subject", "保持主体"],
  ["style_only", "参考风格"],
  ["remix", "综合重绘"],
] as const

type ImageCreationPanelProps = {
  loading: boolean
  creativePrompt: string
  referenceSeed?: GeneratedReferenceSeed | null
  onDraftChange: (draft: ImageWorkbenchPanelDraft) => void
  onReferenceSeedConsumed: (id: string, error?: string) => void
}

export function ImageCreationPanel({
  loading,
  creativePrompt,
  referenceSeed,
  onDraftChange,
  onReferenceSeedConsumed,
}: ImageCreationPanelProps) {
  const [template, setTemplate] = useState<string>("电商主图")
  const [requirements, setRequirements] = useState("")
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>("remix")
  const [ratioFamily, setRatioFamily] = useState<ImageRatioFamily>("1:1")
  const [orientation, setOrientation] = useState<ImageOrientation>("portrait")
  const [resolution, setResolution] = useState<ImageResolution>("2k")
  const [references, setReferences] = useState<WorkbenchReferenceImage[]>([])
  const consumedSeed = useRef("")

  const moveReference = (index: number, direction: -1 | 1) => {
    setReferences((current) => {
      const target = index + direction
      if (target < 0 || target >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(index, 1)
      if (!moved) return current
      next.splice(target, 0, moved)
      return next
    })
  }

  useEffect(() => {
    if (!referenceSeed || referenceSeed.mode !== "image") return
    if (consumedSeed.current === referenceSeed.id) return
    consumedSeed.current = referenceSeed.id
    if (references.length >= 4) {
      onReferenceSeedConsumed(referenceSeed.id, "参考图已满 4 张，请先移除一张。")
      return
    }
    void generatedImageUrlToReference(referenceSeed.url, "general")
      .then((reference) => {
        setReferences((current) => [...current, reference].slice(0, 4))
        onReferenceSeedConsumed(referenceSeed.id)
      })
      .catch(() => {
        onReferenceSeedConsumed(
          referenceSeed.id,
          "无法把该结果设为参考图，请先下载后上传。",
        )
      })
  }, [onReferenceSeedConsumed, referenceSeed, references.length])

  useEffect(() => {
    const aspectRatio = resolveImageAspectRatio(ratioFamily, orientation)
    const description = creativePrompt.trim()
    onDraftChange({
      request: description
        ? {
            mode: "image",
            prompt: buildGeneralImagePrompt({
              template,
              description,
              requirements,
              aspectRatio,
              orientation,
              referenceMode,
              referenceCount: references.length,
            }),
            aspectRatio,
            resolution,
            referenceMode,
            referenceImages: references,
          }
        : null,
      referenceCount: references.length,
      outputLabel: `${aspectRatio} · ${resolution.toUpperCase()}`,
    })
  }, [
    creativePrompt,
    onDraftChange,
    orientation,
    ratioFamily,
    referenceMode,
    references,
    requirements,
    resolution,
    template,
  ])

  return (
    <section className="bg-[#fbfbf8] text-[#24272d]">
      <div className="border-b border-[#e1e2df] px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#3157df]">
          Create
        </p>
        <h2 className="mt-1 text-sm font-semibold">图片生成设置</h2>
      </div>

      <div className="border-b border-[#e1e2df] px-4 py-4">
        <span className="text-xs font-semibold">创作模板</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {IMAGE_TEMPLATE_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              disabled={loading}
              onClick={() => setTemplate(item)}
              className={`rounded-full px-2.5 py-1.5 text-[11px] ${
                template === item
                  ? "bg-[#24272d] text-white"
                  : "bg-[#eceef1] text-[#636873] hover:bg-[#e2e5ea]"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="border-b border-[#e1e2df] px-4 py-4">
        <label className="block">
          <span className="text-xs font-semibold">补充要求</span>
          <textarea
            value={requirements}
            disabled={loading}
            onChange={(event) => setRequirements(event.target.value)}
            rows={3}
            placeholder="例如：自然肤质、纯白背景、右侧留白"
            className="mt-2 w-full resize-none rounded-lg border border-[#d9dce2] bg-white px-3 py-2.5 text-sm leading-5 outline-none focus:border-[#3157df]"
          />
        </label>
      </div>

      <div className="border-b border-[#e1e2df] px-4 py-4">
        <ReferenceImageUploader
          label="参考图"
          help="最多 4 张，顺序代表参考优先级"
          role="general"
          images={references}
          maxFiles={4}
          disabled={loading}
          onAdd={(images) => setReferences((current) => [...current, ...images].slice(0, 4))}
          onRemove={(id) => setReferences((current) => current.filter((item) => item.id !== id))}
          onMove={moveReference}
        />

        {references.length > 0 && (
          <div className="mt-4">
            <span className="text-xs font-semibold">参考方式</span>
            <div className="mt-2 grid grid-cols-3 gap-1.5">
              {REFERENCE_MODE_OPTIONS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={loading}
                  onClick={() => setReferenceMode(value)}
                  className={`rounded-lg border px-1 py-2 text-[11px] ${
                    referenceMode === value
                      ? "border-[#3157df] bg-[#edf1ff] font-semibold text-[#294bc7]"
                      : "border-[#d9dce2] bg-white text-[#666b75]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-4">
        <ImageRatioSelector
          ratioFamily={ratioFamily}
          orientation={orientation}
          resolution={resolution}
          disabled={loading}
          onRatioFamilyChange={setRatioFamily}
          onOrientationChange={setOrientation}
          onResolutionChange={setResolution}
        />
      </div>
    </section>
  )
}

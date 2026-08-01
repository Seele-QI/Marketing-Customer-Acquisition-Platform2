"use client"

import { useEffect, useRef, useState } from "react"

import { ImageRatioSelector } from "@/components/image-workbench/image-ratio-selector"
import type {
  GeneratedReferenceSeed,
  ImageWorkbenchPanelDraft,
} from "@/components/image-workbench/panel-contract"
import { ReferenceImageUploader } from "@/components/image-workbench/reference-image-uploader"
import { buildPosterWorkbenchPrompt } from "@/lib/image-workbench/poster-prompt"
import {
  generatedImageUrlToReference,
  sortPosterReferences,
} from "@/lib/image-workbench/reference-images"
import {
  resolveImageAspectRatio,
  type ImageOrientation,
  type ImageRatioFamily,
  type ImageResolution,
  type ReferenceRole,
  type WorkbenchReferenceImage,
} from "@/lib/image-workbench/types"

const POSTER_TEMPLATE_OPTIONS = ["品牌宣传", "活动促销", "新品发布", "知识海报"] as const
const POSTER_STYLES = ["高级简约", "国潮东方", "清新自然", "科技未来", "活力促销"] as const

type PosterCreationPanelProps = {
  loading: boolean
  creativePrompt: string
  referenceSeed?: GeneratedReferenceSeed | null
  onDraftChange: (draft: ImageWorkbenchPanelDraft) => void
  onReferenceSeedConsumed: (id: string, error?: string) => void
}

export function PosterCreationPanel({
  loading,
  creativePrompt,
  referenceSeed,
  onDraftChange,
  onReferenceSeedConsumed,
}: PosterCreationPanelProps) {
  const [template, setTemplate] = useState<string>("品牌宣传")
  const [purpose, setPurpose] = useState("品牌宣传")
  const [headline, setHeadline] = useState("")
  const [body, setBody] = useState("")
  const [style, setStyle] = useState<string>("高级简约")
  const [ratioFamily, setRatioFamily] = useState<ImageRatioFamily>("3:4")
  const [orientation, setOrientation] = useState<ImageOrientation>("portrait")
  const [resolution, setResolution] = useState<ImageResolution>("2k")
  const [references, setReferences] = useState<WorkbenchReferenceImage[]>([])
  const consumedSeed = useRef("")

  const referencesFor = (role: ReferenceRole) =>
    references.filter((image) => image.role === role)

  const replaceRole = (role: ReferenceRole, images: WorkbenchReferenceImage[]) => {
    setReferences((current) =>
      sortPosterReferences([
        ...current.filter((image) => image.role !== role),
        ...images.slice(-1),
      ]),
    )
  }

  useEffect(() => {
    if (!referenceSeed || referenceSeed.mode !== "poster") return
    if (consumedSeed.current === referenceSeed.id) return
    consumedSeed.current = referenceSeed.id
    void generatedImageUrlToReference(referenceSeed.url, referenceSeed.role)
      .then((reference) => {
        replaceRole(referenceSeed.role, [reference])
        onReferenceSeedConsumed(referenceSeed.id)
      })
      .catch(() => {
        onReferenceSeedConsumed(
          referenceSeed.id,
          "无法把该结果设为参考图，请先下载后上传。",
        )
      })
  }, [referenceSeed, onReferenceSeedConsumed])

  useEffect(() => {
    const aspectRatio = resolveImageAspectRatio(ratioFamily, orientation)
    const orderedReferences = sortPosterReferences(references)
    const cleanHeadline = headline.trim()
    onDraftChange({
      request: cleanHeadline
        ? {
            mode: "poster",
            prompt: buildPosterWorkbenchPrompt({
              template,
              purpose,
              headline: cleanHeadline,
              body,
              creativeDirection: creativePrompt,
              style,
              aspectRatio,
              orientation,
              referenceRoles: orderedReferences.map((image) => image.role),
            }),
            aspectRatio,
            resolution,
            referenceImages: orderedReferences,
          }
        : null,
      referenceCount: orderedReferences.length,
      outputLabel: `${aspectRatio} · ${resolution.toUpperCase()}`,
    })
  }, [
    body,
    creativePrompt,
    headline,
    onDraftChange,
    orientation,
    purpose,
    ratioFamily,
    references,
    resolution,
    style,
    template,
  ])

  return (
    <section className="bg-[#fbfbf8] text-[#24272d]">
      <div className="border-b border-[#e1e2df] px-4 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[.14em] text-[#3157df]">
          Poster
        </p>
        <h2 className="mt-1 text-sm font-semibold">海报生成设置</h2>
      </div>

      <div className="border-b border-[#e1e2df] px-4 py-4">
        <span className="text-xs font-semibold">海报模板</span>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {POSTER_TEMPLATE_OPTIONS.map((item) => (
            <button
              key={item}
              type="button"
              disabled={loading}
              onClick={() => setTemplate(item)}
              className={`rounded-lg border px-2 py-2 text-xs transition ${
                template === item
                  ? "border-[#3157df] bg-[#edf1ff] font-semibold text-[#294bc7]"
                  : "border-[#d9dce2] bg-white text-[#666b75] hover:border-[#aeb9e8]"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 border-b border-[#e1e2df] px-4 py-4">
        <span className="text-xs font-semibold">海报内容</span>
        <input
          value={purpose}
          disabled={loading}
          onChange={(event) => setPurpose(event.target.value)}
          placeholder="海报用途"
          className="w-full rounded-lg border border-[#d9dce2] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3157df]"
        />
        <input
          value={headline}
          disabled={loading}
          onChange={(event) => setHeadline(event.target.value)}
          placeholder="主标题 *"
          className="w-full rounded-lg border border-[#d9dce2] bg-white px-3 py-2.5 text-sm outline-none focus:border-[#3157df]"
        />
        <textarea
          value={body}
          disabled={loading}
          onChange={(event) => setBody(event.target.value)}
          rows={3}
          placeholder="辅助文案、时间、地点与行动提示"
          className="w-full resize-none rounded-lg border border-[#d9dce2] bg-white px-3 py-2.5 text-sm leading-5 outline-none focus:border-[#3157df]"
        />
      </div>

      <div className="border-b border-[#e1e2df] px-4 py-4">
        <span className="text-xs font-semibold">视觉方向</span>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {POSTER_STYLES.map((item) => (
            <button
              key={item}
              type="button"
              disabled={loading}
              onClick={() => setStyle(item)}
              className={`rounded-full px-2.5 py-1.5 text-[11px] ${
                style === item
                  ? "bg-[#24272d] text-white"
                  : "bg-[#eceef1] text-[#636873] hover:bg-[#e2e5ea]"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4 border-b border-[#e1e2df] px-4 py-4">
        <ReferenceImageUploader
          label="商品 / 主体图"
          help="保持商品、人物或核心物体特征"
          role="subject"
          images={referencesFor("subject")}
          maxFiles={1}
          disabled={loading}
          onAdd={(images) => replaceRole("subject", images)}
          onRemove={(id) => setReferences((current) => current.filter((item) => item.id !== id))}
        />
        <ReferenceImageUploader
          label="风格参考图"
          help="参考配色、材质、光影与版式氛围"
          role="style"
          images={referencesFor("style")}
          maxFiles={1}
          disabled={loading}
          onAdd={(images) => replaceRole("style", images)}
          onRemove={(id) => setReferences((current) => current.filter((item) => item.id !== id))}
        />
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

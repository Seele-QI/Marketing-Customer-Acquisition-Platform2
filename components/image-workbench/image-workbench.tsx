"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { X } from "lucide-react"

import { ImageCreationPanel } from "@/components/image-workbench/image-creation-panel"
import { ImagePromptComposer } from "@/components/image-workbench/image-prompt-composer"
import { ImageResultCanvas } from "@/components/image-workbench/image-result-canvas"
import {
  type ImageWorkbenchResultState,
} from "@/components/image-workbench/image-result-gallery"
import { ImageWorkbenchToolbar } from "@/components/image-workbench/image-workbench-toolbar"
import type {
  GeneratedReferenceSeed,
  ImageWorkbenchPanelDraft,
} from "@/components/image-workbench/panel-contract"
import { PosterCreationPanel } from "@/components/image-workbench/poster-creation-panel"
import {
  submitImageWorkbenchTask,
  waitForImageWorkbenchResult,
  type SubmitImageWorkbenchInput,
} from "@/lib/image-workbench/api"
import type {
  ImageWorkbenchMode,
  ReferenceRole,
} from "@/lib/image-workbench/types"
import { resolveMediaUrl } from "@/lib/video/utils"

const INITIAL_RESULT: ImageWorkbenchResultState = {
  status: "idle",
  taskId: "",
  imageUrls: [],
  aspectRatio: "1:1",
  stageLabel: "",
  warning: "",
  error: "",
}

const INITIAL_DRAFT: ImageWorkbenchPanelDraft = {
  request: null,
  referenceCount: 0,
  outputLabel: "1:1 · 2K",
}

function publicStageLabel(label: string | undefined): string {
  if (!label) return "正在生成候选图"
  const allowed = new Set([
    "正在处理参考图",
    "正在生成 2 张候选图",
    "图片生成完成",
    "图片生成失败",
  ])
  return allowed.has(label) ? label : "正在生成 2 张候选图"
}

function publicErrorMessage(caught: unknown): string {
  const message = caught instanceof Error ? caught.message : ""
  if (/积分|余额|登录|计费项目/.test(message)) return message
  if (/参考图|图片格式|10MB/.test(message)) return message
  return "创作服务暂时繁忙，请稍后重试。"
}

export function ImageWorkbench() {
  const [activeMode, setActiveMode] = useState<ImageWorkbenchMode>("poster")
  const [creativePrompts, setCreativePrompts] = useState<Record<ImageWorkbenchMode, string>>({
    poster: "",
    image: "",
  })
  const [drafts, setDrafts] = useState<Record<ImageWorkbenchMode, ImageWorkbenchPanelDraft>>({
    poster: { ...INITIAL_DRAFT, outputLabel: "3:4 · 2K" },
    image: INITIAL_DRAFT,
  })
  const [results, setResults] = useState<Record<ImageWorkbenchMode, ImageWorkbenchResultState>>({
    poster: { ...INITIAL_RESULT, aspectRatio: "3:4" },
    image: { ...INITIAL_RESULT },
  })
  const [referenceSeed, setReferenceSeed] = useState<GeneratedReferenceSeed | null>(null)
  const [notice, setNotice] = useState("")
  const [taskCount, setTaskCount] = useState(0)
  const controllers = useRef<Record<ImageWorkbenchMode, AbortController | null>>({
    poster: null,
    image: null,
  })
  const lastSubmissions = useRef<
    Partial<Record<ImageWorkbenchMode, SubmitImageWorkbenchInput>>
  >({})

  useEffect(() => {
    const activeControllers = controllers.current
    return () => {
      activeControllers.poster?.abort()
      activeControllers.image?.abort()
    }
  }, [])

  const updateResult = (
    mode: ImageWorkbenchMode,
    update: Partial<ImageWorkbenchResultState>,
  ) => {
    setResults((current) => ({
      ...current,
      [mode]: { ...current[mode], ...update },
    }))
  }

  const generate = async (input: SubmitImageWorkbenchInput) => {
    const mode = input.mode
    controllers.current[mode]?.abort()
    const controller = new AbortController()
    controllers.current[mode] = controller
    lastSubmissions.current[mode] = input

    updateResult(mode, {
      status: "running",
      taskId: "",
      imageUrls: [],
      aspectRatio: input.aspectRatio,
      stageLabel: "正在准备创作任务",
      warning: "",
      error: "",
    })

    try {
      const submitted = await submitImageWorkbenchTask(input)
      setTaskCount((count) => count + 1)
      updateResult(mode, {
        taskId: submitted.task_id,
        stageLabel: input.referenceImages.length
          ? "正在处理参考图并生成 2 张候选图"
          : "正在生成 2 张候选图",
      })
      const terminal = await waitForImageWorkbenchResult(submitted.task_id, {
        signal: controller.signal,
      })
      updateResult(mode, {
        status: "success",
        imageUrls: terminal.image_urls.map(resolveMediaUrl),
        warning: terminal.warning || "",
        stageLabel: publicStageLabel(terminal.stage_label || "图片生成完成"),
      })
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return
      updateResult(mode, {
        status: "failed",
        error: publicErrorMessage(caught),
        stageLabel: "图片生成失败",
      })
    } finally {
      if (controllers.current[mode] === controller) {
        controllers.current[mode] = null
      }
    }
  }

  const updatePosterDraft = useCallback((draft: ImageWorkbenchPanelDraft) => {
    setDrafts((current) => ({ ...current, poster: draft }))
  }, [])

  const updateImageDraft = useCallback((draft: ImageWorkbenchPanelDraft) => {
    setDrafts((current) => ({ ...current, image: draft }))
  }, [])

  const consumeReferenceSeed = useCallback((id: string, error?: string) => {
    setReferenceSeed((current) => (current?.id === id ? null : current))
    setNotice(error || "已加入参考图")
  }, [])

  const useAsReference = (url: string, role: ReferenceRole) => {
    setReferenceSeed({
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      mode: activeMode,
      url,
      role,
    })
  }

  const regenerate = () => {
    const input = lastSubmissions.current[activeMode]
    if (input) void generate(input)
  }

  const activeDraft = drafts[activeMode]
  const activeResult = results[activeMode]
  const activeLoading = activeResult.status === "running"

  const panels = (
    <>
      <div className={activeMode === "poster" ? "block" : "hidden"}>
        <PosterCreationPanel
          loading={results.poster.status === "running"}
          creativePrompt={creativePrompts.poster}
          referenceSeed={referenceSeed?.mode === "poster" ? referenceSeed : null}
          onDraftChange={updatePosterDraft}
          onReferenceSeedConsumed={consumeReferenceSeed}
        />
      </div>
      <div className={activeMode === "image" ? "block" : "hidden"}>
        <ImageCreationPanel
          loading={results.image.status === "running"}
          creativePrompt={creativePrompts.image}
          referenceSeed={referenceSeed?.mode === "image" ? referenceSeed : null}
          onDraftChange={updateImageDraft}
          onReferenceSeedConsumed={consumeReferenceSeed}
        />
      </div>
    </>
  )

  return (
    <main className="relative min-h-0 flex-1 overflow-y-auto bg-[#eef0f3] lg:h-[calc(100vh-64px)] lg:flex-none lg:overflow-hidden">
      <div className="flex min-h-full flex-col lg:h-full lg:min-h-0">
        <ImageWorkbenchToolbar
          mode={activeMode}
          onModeChange={setActiveMode}
          taskCount={taskCount}
        />

        {notice && (
          <div className="absolute right-5 top-20 z-30 flex items-center gap-3 rounded-lg border border-[#d4d8e0] bg-[#fbfbf9] px-3 py-2 text-xs text-[#555a64] shadow-lg">
            {notice}
            <button type="button" aria-label="关闭提示" onClick={() => setNotice("")}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
          <aside className="order-2 min-h-0 border-r border-[#d9dce2] bg-[#fbfbf8] lg:order-1 lg:overflow-y-auto">
            <details open>
              <summary className="cursor-pointer border-b border-[#d9dce2] px-4 py-3 text-sm font-semibold text-[#30333a] lg:hidden">
                创作设置
              </summary>
              {panels}
            </details>
          </aside>

          <section className="order-1 flex min-h-[620px] min-w-0 flex-col lg:order-2 lg:min-h-0">
            <ImageResultCanvas
              mode={activeMode}
              {...activeResult}
              onUseAsReference={useAsReference}
              onRegenerate={regenerate}
            />
            <ImagePromptComposer
              mode={activeMode}
              value={creativePrompts[activeMode]}
              onChange={(value) =>
                setCreativePrompts((current) => ({ ...current, [activeMode]: value }))
              }
              loading={activeLoading}
              canGenerate={Boolean(activeDraft.request)}
              referenceCount={activeDraft.referenceCount}
              outputLabel={activeDraft.outputLabel}
              stageLabel={activeResult.stageLabel}
              onGenerate={() => {
                if (activeDraft.request) void generate(activeDraft.request)
              }}
            />
          </section>
        </div>
      </div>
    </main>
  )
}

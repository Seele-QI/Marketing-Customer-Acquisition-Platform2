"use client"

import * as React from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Sparkles,
  Sprout,
  TrendingUp,
  Gem,
  Upload,
  X,
} from "lucide-react"

import { AiModelPicker, useAiModels } from "@/components/ai-model-picker"
import { PositioningQuestionCard } from "@/components/ip-positioning/positioning-question-card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import {
  ACCEPTED_DOCUMENT_EXTENSIONS,
  MAX_DOCUMENTS,
  MAX_DOCUMENT_BYTES,
} from "@/lib/ip-positioning-upload"
import {
  EMPTY_INTAKE,
  getMissingIntakeFieldLabels,
  validateIntake,
  type IpPositioningIntake,
  type UploadedDocumentPayload,
} from "@/lib/ip-positioning-schema"
import {
  hydrateIpDocuments,
  persistIpDocument,
  removeIpDocument,
} from "@/lib/ip-positioning-asset-persist"
import {
  loadIpPositioningSession,
  saveIpPositioningSession,
  type IpPositioningFileRef,
} from "@/lib/ip-positioning-store"
import {
  INTAKE_GROUPS,
  IP_POSITIONING_ALLOWED_MODELS,
  STAGE_OPTIONS,
  type StageId,
} from "@/lib/ip-positioning-skill"
import { cn } from "@/lib/utils"

type UploadedFile = UploadedDocumentPayload & { assetId?: string }

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const STAGE_ICONS = {
  novice: Sprout,
  growth: TrendingUp,
  mature: Gem,
} as const

type Props = {
  onSubmit: (payload: {
    intake: IpPositioningIntake
    files: UploadedFile[]
    modelId: string
  }) => Promise<void>
  analyzing: boolean
}

export function PositioningIntakeWizard({ onSubmit, analyzing }: Props) {
  const { models, modelId, setModelId, loaded } = useAiModels()
  const ipModels = React.useMemo(
    () =>
      models.filter((m) =>
        (IP_POSITIONING_ALLOWED_MODELS as readonly string[]).includes(m.id),
      ),
    [models],
  )

  const [step, setStep] = React.useState(0)
  const [intake, setIntake] = React.useState<IpPositioningIntake>(EMPTY_INTAKE)
  const [files, setFiles] = React.useState<UploadedFile[]>([])
  const [fileRefs, setFileRefs] = React.useState<IpPositioningFileRef[]>([])
  const [hydrated, setHydrated] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [submitError, setSubmitError] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const session = loadIpPositioningSession()
      if (!session || session.report) {
        setHydrated(true)
        return
      }
      setStep(session.wizardStep)
      setIntake(session.intake)
      setFileRefs(session.fileRefs)
      const hydratedFiles = await hydrateIpDocuments(session.fileRefs)
      if (!cancelled) {
        setFiles(
          hydratedFiles.map((f, i) => ({
            ...f,
            assetId: session.fileRefs[i]?.id,
          })),
        )
        setHydrated(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  React.useEffect(() => {
    if (!loaded || ipModels.length === 0 || !hydrated) return
    const saved = loadIpPositioningSession()?.modelId
    if (saved && ipModels.some((m) => m.id === saved && m.configured)) {
      setModelId(saved)
      return
    }
    const preferred = ipModels.find((m) => m.id === "gpt-5.5" && m.configured)
    const fallback = ipModels.find((m) => m.configured)
    if (preferred) setModelId(preferred.id)
    else if (fallback) setModelId(fallback.id)
  }, [loaded, ipModels, setModelId, hydrated])

  React.useEffect(() => {
    if (!hydrated) return
    saveIpPositioningSession({
      wizardStep: step,
      intake,
      modelId,
      fileRefs,
    })
  }, [hydrated, step, intake, modelId, fileRefs])

  const totalSteps = INTAKE_GROUPS.length + 1
  const isStageStep = step === 0
  const groupIndex = step - 1
  const currentGroup = !isStageStep ? INTAKE_GROUPS[groupIndex] : null

  const updateField = React.useCallback(
    (key: keyof IpPositioningIntake, value: string | StageId | null) => {
      setIntake((prev) => ({ ...prev, [key]: value }))
      setSubmitError(null)
    },
    [],
  )

  const isLastStep = step === totalSteps - 1
  const missingFieldLabels = React.useMemo(
    () => getMissingIntakeFieldLabels(intake),
    [intake],
  )

  const canProceed = React.useMemo(() => {
    if (isStageStep) return true
    if (!currentGroup) return false
    const stepOk = currentGroup.questions.every((q) => {
      if (!q.required) return true
      const value = intake[q.id as keyof IpPositioningIntake]
      return typeof value === "string" && value.trim().length > 0
    })
    if (!stepOk) return false
    if (isLastStep) return missingFieldLabels.length === 0
    return true
  }, [currentGroup, intake, isLastStep, isStageStep, missingFieldLabels.length])

  const handleFileUpload = React.useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files ?? [])
    const valid: UploadedFile[] = []
    const newRefs: IpPositioningFileRef[] = []

    for (const file of selected) {
      if (file.size > MAX_DOCUMENT_BYTES) {
        toast({ title: "文件过大", description: `${file.name} 超过 20MB` })
        continue
      }
      try {
        const persisted = await persistIpDocument(file)
        if (!persisted) {
          toast({ title: "保存失败", description: `${file.name} 无法写入本地缓存` })
          continue
        }
        valid.push({
          name: file.name,
          size: file.size,
          type: file.type,
          base64: persisted.base64,
          assetId: persisted.ref.id,
        })
        newRefs.push(persisted.ref)
      } catch {
        toast({ title: "读取失败", description: file.name })
      }
    }

    setFiles((prev) => [...prev, ...valid].slice(0, MAX_DOCUMENTS))
    setFileRefs((prev) => [...prev, ...newRefs].slice(0, MAX_DOCUMENTS))
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [])

  const removeFile = React.useCallback((name: string) => {
    setFiles((prev) => {
      const target = prev.find((f) => f.name === name)
      if (target?.assetId) void removeIpDocument(target.assetId)
      return prev.filter((f) => f.name !== name)
    })
    setFileRefs((prev) => prev.filter((f) => f.name !== name))
  }, [])

  const fillDemo = React.useCallback(() => {
    setIntake({
      stage: "growth",
      industry: "互联网运营",
      keyExperiences:
        "5年互联网运营总监，带过20人团队，从0到1做过3个百万用户级项目，擅长用户增长和数据分析",
      resources: "数据分析、用户增长策略、团队管理、公开演讲、行业人脉",
      contrarianTrigger: "大家都追热点，但我认为可持续增长来自用户价值而非流量技巧",
      frequentQuestions: "如何做用户增长？如何带团队？如何从0到1启动项目？",
      uniqueExperience: "从大厂中层到创业公司 COO 的完整链路，经历过三次从0到百万用户",
      targetAudience: "25-35岁互联网从业者，想突破职业天花板或准备创业的人",
      shortTermMonetization: "运营方法论课程 + 1v1 咨询",
      longTermVision: "成为「增长战略」品类的头部 IP，出书 + 企业内训",
      excludeAudience: "只想躺平、不愿执行的人",
      contentFormats: "口播 + 案例拆解 + 公众号长文",
      outputFrequency: "每周 3 条短视频 + 1 篇长文",
      rememberedVibe: "犀利但有温度，像一位说真话的过来人",
      extraInfo: "目标平台：抖音和小红书",
    })
    toast({ title: "已填充示例数据" })
  }, [])

  const handleSubmit = React.useCallback(async () => {
    const err = validateIntake(intake)
    if (err) {
      setSubmitError(err)
      toast({
        title: "信息不完整",
        description: "请返回前面步骤补全必填项",
        variant: "destructive",
      })
      return
    }

    setSubmitError(null)
    setSubmitting(true)
    try {
      let submitFiles = files
      const missingBase64 = files.some((f) => !f.base64)
      if (missingBase64) {
        submitFiles = await hydrateIpDocuments(fileRefs)
      }
      await onSubmit({ intake, files: submitFiles, modelId })
    } catch (e) {
      const message = e instanceof Error ? e.message : "提交失败"
      setSubmitError(message)
      toast({ title: "提交失败", description: message, variant: "destructive" })
    } finally {
      if (!analyzing) setSubmitting(false)
    }
  }, [analyzing, fileRefs, files, intake, modelId, onSubmit])

  const isBusy = analyzing || submitting

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-2 w-8 rounded-full transition-colors",
                i <= step ? "bg-amber-500" : "bg-slate-200 dark:bg-white/10",
              )}
            />
          ))}
        </div>
        <AiModelPicker
          modelId={modelId}
          onChange={setModelId}
          models={ipModels.length > 0 ? ipModels : models}
          disabled={analyzing}
        />
      </div>

      {isStageStep ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900 dark:text-slate-100">
              你现在处于哪个阶段？
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">可选，帮助 AI 调整诊断侧重点</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {STAGE_OPTIONS.map((stage) => {
              const Icon = STAGE_ICONS[stage.id]
              const selected = intake.stage === stage.id
              return (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => updateField("stage", selected ? null : stage.id)}
                  className={cn(
                    "relative flex flex-col items-center gap-3 rounded-2xl border p-5 text-center transition-all",
                    selected
                      ? "border-amber-400/60 bg-amber-50/50 shadow-sm dark:border-amber-500/40 dark:bg-amber-500/10"
                      : "border-slate-200/60 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/5",
                  )}
                >
                  {selected ? (
                    <span className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  ) : null}
                  <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 dark:bg-white/5">
                    <Icon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                      {stage.title}
                    </p>
                    <p className="mt-0.5 text-[12px] text-slate-400">{stage.desc}</p>
                  </div>
                </button>
              )
            })}
          </div>
        </section>
      ) : currentGroup ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-[18px] font-semibold text-slate-900 dark:text-slate-100">
              {currentGroup.title}
            </h2>
            <p className="mt-1 text-[13px] text-slate-500">{currentGroup.description}</p>
          </div>
          <div className="space-y-4">
            {currentGroup.questions.map((q) => (
              <PositioningQuestionCard
                key={q.id}
                label={q.label}
                placeholder={q.placeholder}
                required={q.required}
                multiline={q.multiline}
                value={String(intake[q.id as keyof IpPositioningIntake] ?? "")}
                onChange={(value) => updateField(q.id as keyof IpPositioningIntake, value)}
              />
            ))}
          </div>

          {groupIndex === INTAKE_GROUPS.length - 1 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-5 dark:border-white/10 dark:bg-white/5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Upload className="h-4 w-4 text-slate-400" />
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                  上传资料
                </span>
                <span className="text-[11px] text-slate-400">
                  Word / PDF / TXT / MD · 单文件 ≤ 20MB · 最多 {MAX_DOCUMENTS} 个
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={files.length >= MAX_DOCUMENTS || analyzing}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-[13px] font-medium text-slate-500 transition-colors hover:border-amber-400 hover:text-amber-600 disabled:opacity-40 dark:border-white/10"
                >
                  <Upload className="h-4 w-4" />
                  选择文件
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_DOCUMENT_EXTENSIONS}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void handleFileUpload(e)
                  }}
                />
                {files.map((f) => (
                  <div
                    key={f.name}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200/60 bg-white px-2.5 py-1.5 text-[12px] dark:border-white/10 dark:bg-white/5"
                  >
                    <FileText className="h-3.5 w-3.5 text-slate-400" />
                    <span className="max-w-[140px] truncate">{f.name}</span>
                    <span className="text-[10px] text-slate-400">{formatFileSize(f.size)}</span>
                    <button
                      type="button"
                      onClick={() => removeFile(f.name)}
                      className="ml-0.5 text-slate-400 hover:text-rose-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {isLastStep && missingFieldLabels.length > 0 ? (
        <Alert variant="destructive">
          <AlertTitle>还有 {missingFieldLabels.length} 项未填写</AlertTitle>
          <AlertDescription>
            请返回前面步骤补全：{missingFieldLabels.join("、")}
          </AlertDescription>
        </Alert>
      ) : null}

      {submitError ? (
        <Alert variant="destructive">
          <AlertTitle>无法生成报告</AlertTitle>
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5 dark:border-white/5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fillDemo}
            className="rounded-lg border border-slate-200/60 px-3 py-1.5 text-[12px] text-slate-500 hover:border-amber-300 hover:text-amber-600 dark:border-white/10"
          >
            ✨ 试试示例
          </button>
        </div>
        <div className="flex items-center gap-2">
          {step > 0 ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setStep((s) => s - 1)}
          disabled={analyzing}
          className="rounded-xl"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          上一步
        </Button>
      ) : null}
      {step < totalSteps - 1 ? (
        <Button
          type="button"
          onClick={() => setStep((s) => s + 1)}
          disabled={!canProceed || isBusy}
              className="rounded-xl bg-amber-500 hover:bg-amber-600"
            >
              下一步
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!canProceed || isBusy}
              className="rounded-xl bg-amber-500 hover:bg-amber-600"
            >
              {isBusy ? (
                <>
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  诊断中…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1 h-4 w-4" />
                  生成定位报告
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

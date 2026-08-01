"use client"

import * as React from "react"
import { useLoginRequired } from "@/components/auth/login-required-provider"
import {
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Star,
  Save,
  Pencil,
  ShieldCheck,
  AlertTriangle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import type { GeoUploadedDoc } from "@/components/geo/geo-doc-upload-panel"
import type { GeoEntityData } from "@/lib/geo/entity-types"
import {
  EMPTY_OFFICIAL_CONTACT,
  firstOfficialContactIssue,
} from "@/lib/geo/official-contact"
import {
  addEnterpriseSkill,
  listEnterpriseSkills,
  removeEnterpriseSkill,
  setDefaultEnterpriseSkill,
  updateEnterpriseSkill,
  type EnterpriseSkill,
} from "@/lib/geo/enterprise-skills-store"
import { toast } from "@/hooks/use-toast"

type Props = {
  entity: GeoEntityData | null
  documents: GeoUploadedDoc[]
  className?: string
  onContactValidationError?: (fieldId: string) => void
}

export function GeoSkillGeneratorPanel({
  entity,
  documents,
  className,
  onContactValidationError,
}: Props) {
  const { me } = useLoginRequired()
  const accountScope = me ? `user-${me.user.id}` : null
  const [skillName, setSkillName] = React.useState("")
  const [generating, setGenerating] = React.useState(false)
  const [preview, setPreview] = React.useState<EnterpriseSkill | null>(null)
  const [previewOpen, setPreviewOpen] = React.useState(true)
  const [savedSkills, setSavedSkills] = React.useState<EnterpriseSkill[]>([])
  const [editingId, setEditingId] = React.useState<string | null>(null)
  const [editLabel, setEditLabel] = React.useState("")
  const [editDescription, setEditDescription] = React.useState("")
  const [editContent, setEditContent] = React.useState("")

  const refreshSkills = React.useCallback(() => {
    setSavedSkills(accountScope ? listEnterpriseSkills(accountScope) : [])
  }, [accountScope])

  React.useEffect(() => {
    refreshSkills()
  }, [refreshSkills])

  const canGenerate =
    Boolean(skillName.trim()) &&
    Boolean(entity?.companyName?.trim() || documents.length > 0)

  const handleGenerate = async () => {
    if (!canGenerate) return
    const contactIssue = firstOfficialContactIssue(
      entity?.officialContact ?? EMPTY_OFFICIAL_CONTACT,
    )
    if (contactIssue) {
      toast({
        title: "请完善官方联系方式",
        description: contactIssue.message,
        variant: "destructive",
      })
      onContactValidationError?.(contactIssue.fieldId)
      window.requestAnimationFrame(() => {
        document.getElementById(contactIssue.fieldId)?.focus()
      })
      return
    }
    setGenerating(true)
    setPreview(null)
    setEditingId(null)
    try {
      const res = await fetch("/api/geo/enterprise-skill/generate", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          skillName: skillName.trim(),
          entity: entity ?? {
            companyName: "",
            industry: "",
            coreProduct: "",
            authorityLinks: [],
            authorityPages: [],
            faqs: [],
            officialContact: {
              ...EMPTY_OFFICIAL_CONTACT,
              primary: { ...EMPTY_OFFICIAL_CONTACT.primary },
            },
          },
          documents: documents.map((d) => ({ name: d.name, text: d.text })),
        }),
      })
      const data = (await res.json()) as {
        skill?: EnterpriseSkill
        error?: string
        detail?: { message?: string } | string
      }
      if (!res.ok) {
        const detailMsg =
          typeof data.detail === "object" && data.detail?.message
            ? data.detail.message
            : typeof data.detail === "string"
              ? data.detail
              : undefined
        if (res.status === 401) throw new Error("请先登录后再生成 Skill")
        if (res.status === 402) throw new Error(data.error || detailMsg || "积分不足")
        throw new Error(data.error || detailMsg || "生成失败")
      }
      if (!data.skill) throw new Error("响应缺少 skill")
      setPreview(data.skill)
      setPreviewOpen(true)
      toast({
        title: data.skill.quality?.passed ? "Skill 已生成并通过质量验收" : "Skill 已生成",
        description: data.skill.quality
          ? `质量分数 ${data.skill.quality.score}，可预览后保存`
          : "可直接编辑正文后保存",
      })
    } catch (err) {
      toast({
        title: "生成失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "destructive",
      })
    } finally {
      setGenerating(false)
    }
  }

  const handleSavePreview = () => {
    if (!preview || !accountScope) return
    const content = preview.content.trim()
    if (!content) {
      toast({ title: "保存失败", description: "Skill 正文不能为空", variant: "destructive" })
      return
    }
    try {
      addEnterpriseSkill(accountScope, { ...preview, content })
      refreshSkills()
      toast({ title: "已保存", description: preview.label })
      setPreview(null)
    } catch (err) {
      toast({
        title: "保存失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "destructive",
      })
    }
  }

  const startEditSaved = (skill: EnterpriseSkill) => {
    setPreview(null)
    setEditingId(skill.id)
    setEditLabel(skill.label)
    setEditDescription(skill.description)
    setEditContent(skill.content)
  }

  const cancelEditSaved = () => {
    setEditingId(null)
    setEditLabel("")
    setEditDescription("")
    setEditContent("")
  }

  const handleSaveEdited = () => {
    if (!editingId || !accountScope) return
    try {
      updateEnterpriseSkill(accountScope, editingId, {
        label: editLabel,
        description: editDescription,
        content: editContent,
      })
      refreshSkills()
      toast({ title: "已更新", description: editLabel.trim() })
      cancelEditSaved()
    } catch (err) {
      toast({
        title: "保存失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "destructive",
      })
    }
  }

  const handleRemove = (id: string) => {
    if (!accountScope) return
    if (editingId === id) cancelEditSaved()
    removeEnterpriseSkill(accountScope, id)
    refreshSkills()
    toast({ title: "已删除" })
  }

  const handleSetDefault = (id: string) => {
    if (!accountScope) return
    setDefaultEnterpriseSkill(accountScope, id)
    refreshSkills()
    toast({ title: "已设为默认" })
  }

  return (
    <div
      className={cn(
        "rounded-xl border border-cyan-200/50 bg-gradient-to-b from-cyan-50/30 to-white p-4 dark:border-cyan-500/20 dark:from-cyan-500/5 dark:to-white/[0.02]",
        className,
      )}
    >
      <div className="mb-1 h-0.5 w-8 rounded-full bg-cyan-500/60" />
      <h3 className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
        生成企业 Skill
      </h3>
      <p className="mb-4 text-[11px] text-slate-500">
        整合实体与资料，生成 C 层知识库 Skill（存于浏览器本地，可随时编辑）
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[180px] flex-1">
          <label className="mb-1 block text-[11px] font-medium text-slate-500">Skill 名称</label>
          <Input
            value={skillName}
            onChange={(e) => setSkillName(e.target.value)}
            placeholder="例：某某科技 GEO 知识库"
            className="h-9 text-[13px]"
          />
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!canGenerate || generating}
          onClick={() => void handleGenerate()}
          className="h-9 gap-1.5 bg-cyan-600 hover:bg-cyan-700"
        >
          {generating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {generating ? "生成中…" : "生成"}
        </Button>
      </div>

      {generating && (
        <div className="mt-4 space-y-2 rounded-lg border border-slate-100 bg-white/60 p-4 dark:border-white/5 dark:bg-white/[0.02]">
          <div className="h-3 w-3/4 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
          <div className="h-3 w-full animate-pulse rounded bg-slate-200 dark:bg-white/10" />
          <div className="h-3 w-5/6 animate-pulse rounded bg-slate-200 dark:bg-white/10" />
        </div>
      )}

      {preview && !generating && (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200/80 bg-white dark:border-white/10 dark:bg-slate-900/40">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-white/5">
            <div className="min-w-0 flex-1 pr-2">
              <Input
                value={preview.label}
                onChange={(e) =>
                  setPreview((p) => (p ? { ...p, label: e.target.value } : p))
                }
                className="mb-1 h-7 border-0 bg-transparent px-0 text-[12px] font-medium shadow-none focus-visible:ring-0"
                aria-label="Skill 名称"
              />
              <Input
                value={preview.description}
                onChange={(e) =>
                  setPreview((p) => (p ? { ...p, description: e.target.value } : p))
                }
                className="h-6 border-0 bg-transparent px-0 text-[10px] text-slate-400 shadow-none focus-visible:ring-0"
                aria-label="Skill 描述"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2"
                onClick={() => setPreviewOpen((o) => !o)}
              >
                {previewOpen ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button type="button" size="sm" className="h-7 gap-1" onClick={handleSavePreview}>
                <Save className="h-3 w-3" />
                保存
              </Button>
            </div>
          </div>
          {previewOpen && (
            <>
              {preview.quality && (
                <div
                  className={cn(
                    "border-b px-3 py-2.5 dark:border-white/5",
                    preview.quality.passed
                      ? "border-emerald-100 bg-emerald-50/60 dark:bg-emerald-500/10"
                      : "border-amber-100 bg-amber-50/60 dark:bg-amber-500/10",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {preview.quality.passed ? (
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    )}
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {preview.quality.passed ? "质量验收通过" : "质量验收待处理"}
                    </span>
                    <span className="text-slate-500">
                      质量分数 {preview.quality.score}/100
                    </span>
                    {preview.quality.repaired && (
                      <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300">
                        已自动修复
                      </span>
                    )}
                  </div>
                  {preview.quality.issues.length > 0 && (
                    <ul className="mt-2 space-y-1 text-[10px] text-amber-700 dark:text-amber-300">
                      {preview.quality.issues.map((issue) => (
                        <li key={issue}>· {issue}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              <Textarea
                value={preview.content}
                onChange={(e) =>
                  setPreview((p) => (
                    p ? { ...p, content: e.target.value, quality: undefined } : p
                  ))
                }
                className="min-h-64 max-h-96 resize-y rounded-none border-0 bg-transparent p-3 font-mono text-[11px] leading-relaxed text-slate-600 focus-visible:ring-0 dark:text-slate-400"
                spellCheck={false}
                aria-label="Skill 正文（可编辑）"
              />
            </>
          )}
        </div>
      )}

      {savedSkills.length > 0 && (
        <div className="mt-5">
          <h4 className="mb-2 text-[12px] font-medium text-slate-600 dark:text-slate-400">
            已生成 Skill（{savedSkills.length}）
          </h4>
          <ul className="space-y-2">
            {savedSkills.map((s) => (
              <li
                key={s.id}
                className="rounded-lg border border-slate-100 bg-white/80 dark:border-white/5 dark:bg-white/[0.03]"
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[12px] font-medium text-slate-700 dark:text-slate-300">
                      {s.default && (
                        <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
                      )}
                      {s.label}
                    </p>
                    <p className="truncate text-[10px] text-slate-400">
                      {s.provider} · {new Date(s.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 px-2 text-[10px]"
                      onClick={() =>
                        editingId === s.id ? cancelEditSaved() : startEditSaved(s)
                      }
                    >
                      <Pencil className="h-3 w-3" />
                      {editingId === s.id ? "收起" : "编辑"}
                    </Button>
                    {!s.default && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[10px]"
                        onClick={() => handleSetDefault(s.id)}
                      >
                        默认
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                      aria-label={`删除 ${s.label}`}
                      onClick={() => handleRemove(s.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {editingId === s.id && (
                  <div className="space-y-2 border-t border-slate-100 px-3 py-3 dark:border-white/5">
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-slate-500">
                        名称
                      </label>
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="h-8 text-[12px]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-slate-500">
                        描述
                      </label>
                      <Input
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="h-8 text-[12px]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium text-slate-500">
                        正文（Markdown）
                      </label>
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        className="min-h-56 max-h-96 resize-y font-mono text-[11px] leading-relaxed"
                        spellCheck={false}
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8"
                        onClick={cancelEditSaved}
                      >
                        取消
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={handleSaveEdited}
                      >
                        <Save className="h-3 w-3" />
                        保存修改
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

"use client"

import * as React from "react"
import { ArrowLeft, ArrowRight, CheckCircle2, Cloud, Loader2, Plus, Sparkles, X } from "lucide-react"
import { GeoDocUploadPanel, type GeoUploadedDoc } from "@/components/geo/geo-doc-upload-panel"
import { GeoKnowledgeReviewStep } from "@/components/geo/knowledge/geo-knowledge-review-step"
import { GeoKnowledgeStepNav } from "@/components/geo/knowledge/geo-knowledge-step-nav"
import { useLoginRequired } from "@/components/auth/login-required-provider"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "@/hooks/use-toast"
import { hydrateEnterpriseDocuments, persistEnterpriseDocument, removeEnterpriseDocument } from "@/lib/geo/enterprise-document-persist"
import { generateEnterpriseSkill } from "@/lib/geo/enterprise-skill-client"
import { addEnterpriseSkill, type EnterpriseSkill } from "@/lib/geo/enterprise-skills-store"
import { mergeEnterprisePrefill, type EnterprisePrefill } from "@/lib/geo/enterprise-prefill"
import { clearEnterpriseWizardDraft, defaultEnterpriseWizardDraft, loadEnterpriseWizardDraft, saveEnterpriseWizardDraft, type EnterpriseDocumentRef } from "@/lib/geo/enterprise-wizard-store"
import type { GeoContactMethod, GeoEntityData } from "@/lib/geo/entity-types"
import { CONTACT_METHOD_LABELS, validateOfficialContact } from "@/lib/geo/official-contact"

export function GeoKnowledgeWizard({ onSaved }: { onSaved?: (skill: EnterpriseSkill) => void }) {
  const { me, requireLogin } = useLoginRequired()
  const accountScope = me ? `user-${me.user.id}` : null
  const authResolved = me !== undefined
  const [hydrated, setHydrated] = React.useState(false)
  const [hydratedScope, setHydratedScope] = React.useState<string | null>(null)
  const [step, setStep] = React.useState(0)
  const [maxStep, setMaxStep] = React.useState(0)
  const [entity, setEntity] = React.useState<GeoEntityData>(() => defaultEnterpriseWizardDraft().entity)
  const [confirmed, setConfirmed] = React.useState(defaultEnterpriseWizardDraft().confirmed)
  const [docs, setDocs] = React.useState<GeoUploadedDoc[]>([])
  const [refs, setRefs] = React.useState<EnterpriseDocumentRef[]>([])
  const [prefill, setPrefill] = React.useState<EnterprisePrefill | null>(null)
  const [prefillBusy, setPrefillBusy] = React.useState(false)
  const [generating, setGenerating] = React.useState(false)
  const [skillName, setSkillName] = React.useState("")
  const refsRef = React.useRef<EnterpriseDocumentRef[]>([])
  const accountScopeRef = React.useRef(accountScope)
  accountScopeRef.current = accountScope
  const documentMutationRef = React.useRef<Promise<void>>(Promise.resolve())

  React.useEffect(() => {
    let active = true
    setHydrated(false)
    setHydratedScope(null)
    void (async () => {
      const fresh = defaultEnterpriseWizardDraft()
      if (!accountScope) {
        if (active && authResolved) {
          setStep(0); setMaxStep(0); setEntity(fresh.entity); setConfirmed(fresh.confirmed); setRefs([]); refsRef.current = []; setDocs([]); setPrefill(null); setSkillName(""); setHydratedScope(null); setHydrated(true)
        }
        return
      }
      const draft = loadEnterpriseWizardDraft(accountScope)
      const restoredDocs = draft
        ? await hydrateEnterpriseDocuments(draft.documentRefs, accountScope)
        : []
      if (!active) return
      if (draft) {
        setStep(draft.step); setMaxStep(draft.maxStep); setEntity(draft.entity); setConfirmed(draft.confirmed); setRefs(draft.documentRefs); refsRef.current = draft.documentRefs; setPrefill(draft.prefill); setSkillName(draft.skillName); setDocs(restoredDocs)
      } else {
        setStep(0); setMaxStep(0); setEntity(fresh.entity); setConfirmed(fresh.confirmed); setRefs([]); refsRef.current = []; setDocs([]); setPrefill(null); setSkillName("")
      }
      setHydratedScope(accountScope); setHydrated(true)
    })()
    return () => { active = false }
  }, [accountScope, authResolved])

  React.useEffect(() => {
    if (!hydrated || !accountScope || hydratedScope !== accountScope) return
    saveEnterpriseWizardDraft(accountScope, { step, maxStep, entity, confirmed, documentRefs: refs, prefill, skillName, prefillStatus: prefillBusy ? "loading" : prefill ? "ready" : docs.length ? "manual" : "idle" })
  }, [hydrated, hydratedScope, accountScope, step, maxStep, entity, confirmed, refs, prefill, skillName, prefillBusy, docs.length])

  const advanceTo = (nextStep: number) => {
    setStep(nextStep)
    setMaxStep((current) => Math.max(current, nextStep))
  }

  const handleDocsChange = async (next: GeoUploadedDoc[]) => {
    if (!accountScope) throw new Error("请先登录后再保存企业资料")
    const mutation = documentMutationRef.current.then(async () => {
      const currentRefs = refsRef.current
      const removed = currentRefs.filter((ref) => !next.some((doc) => doc.name === ref.name && doc.size === ref.size))
      const kept = currentRefs.filter((ref) => !removed.includes(ref))
      const added = next.filter((doc) => !kept.some((ref) => ref.name === doc.name && ref.size === doc.size))
      const addedRefs: EnterpriseDocumentRef[] = []
      try {
        for (const doc of added) addedRefs.push(await persistEnterpriseDocument(doc, accountScope))
      } catch (error) {
        await Promise.allSettled(addedRefs.map((ref) => removeEnterpriseDocument(ref.id, accountScope)))
        throw error
      }
      if (accountScopeRef.current !== accountScope) {
        await Promise.allSettled(addedRefs.map((ref) => removeEnterpriseDocument(ref.id, accountScope)))
        throw new Error("账号已切换，请在当前账号下重新上传")
      }
      const nextRefs = [...kept, ...addedRefs]
      refsRef.current = nextRefs
      setRefs(nextRefs)
      setDocs(next)
      await Promise.allSettled(removed.map((ref) => removeEnterpriseDocument(ref.id, accountScope)))
    })
    documentMutationRef.current = mutation.catch(() => undefined)
    await mutation
  }

  const runPrefill = async () => {
    if (!docs.length) { advanceTo(1); return }
    setPrefillBusy(true)
    try {
      const response = await fetch("/api/geo/enterprise-skill/prefill", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documents: docs.map(({ name, text }) => ({ name, text })) }) })
      const data = await response.json() as { prefill?: EnterprisePrefill; error?: string }
      if (!response.ok || !data.prefill) throw new Error(data.error || "企业信息自动提取失败")
      const merged = mergeEnterprisePrefill(entity, confirmed, data.prefill)
      setEntity((current) => ({ ...current, ...merged.entity })); setPrefill(data.prefill)
    } catch (error) {
      toast({ title: "已切换为手动确认", description: error instanceof Error ? error.message : "请填写三个必要字段" })
    } finally { setPrefillBusy(false); advanceTo(1) }
  }

  const updateCore = (key: "companyName" | "industry" | "coreProduct", value: string) => {
    setEntity((current) => ({ ...current, [key]: value }))
    setConfirmed((current) => ({ ...current, [key]: true }))
  }
  const updateContact = (patch: Partial<GeoEntityData["officialContact"]>) => setEntity((current) => ({ ...current, officialContact: { ...current.officialContact, ...patch } }))

  const next = async () => {
    if (step === 0) return void runPrefill()
    if (step === 1) {
      if (![entity.companyName, entity.industry, entity.coreProduct].every((value) => value.trim())) return toast({ title: "请确认三项必要企业信息", variant: "destructive" })
      advanceTo(2); return
    }
    if (step === 2) {
      const issue = validateOfficialContact(entity.officialContact)[0]
      if (issue) { toast({ title: issue.message, variant: "destructive" }); requestAnimationFrame(() => document.getElementById(issue.fieldId)?.focus()); return }
      setSkillName((current) => current || `${entity.companyName} GEO 知识库`); advanceTo(3)
    }
  }

  const generate = async () => {
    if (!accountScope) { await requireLogin("请先登录后再生成企业知识库"); return }
    setGenerating(true)
    try {
      const skill = await generateEnterpriseSkill({ skillName: skillName.trim(), entity, documents: docs.map(({ name, text }) => ({ name, text })) })
      if (accountScopeRef.current !== accountScope) throw new Error("账号已切换，本次结果未写入当前账号")
      const refsToClean = [...refsRef.current]
      addEnterpriseSkill(accountScope, skill); clearEnterpriseWizardDraft(accountScope); onSaved?.(skill)
      toast({ title: "企业知识库已生成并保存", description: skill.label })
      const fresh = defaultEnterpriseWizardDraft(); setStep(0); setMaxStep(0); setEntity(fresh.entity); setConfirmed(fresh.confirmed); setDocs([]); setRefs([]); refsRef.current = []; setPrefill(null); setSkillName("")
      await Promise.allSettled(refsToClean.map((ref) => removeEnterpriseDocument(ref.id, accountScope)))
    } catch (error) { toast({ title: "生成失败，填写内容已保留", description: error instanceof Error ? error.message : "请稍后重试", variant: "destructive" }) }
    finally { setGenerating(false) }
  }

  if (!hydrated || (accountScope !== null && hydratedScope !== accountScope)) {
    return <div className="flex min-h-[430px] items-center justify-center rounded-2xl border border-slate-200/80 bg-white text-sm text-slate-500"><Loader2 className="mr-2 h-4 w-4 animate-spin text-cyan-500" />正在恢复企业知识库草稿</div>
  }
  if (!me) {
    return <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-slate-200/80 bg-white px-6 text-center"><Cloud className="mb-3 h-8 w-8 text-cyan-500" /><h2 className="text-lg font-semibold text-slate-900">登录后搭建企业知识库</h2><p className="mt-2 max-w-md text-sm text-slate-500">企业资料和联系方式会按账号独立保存，避免共享设备上的资料混用。</p><Button type="button" className="mt-5 bg-cyan-600 hover:bg-cyan-700" onClick={() => void requireLogin("登录后可安全保存企业知识库草稿")}>立即登录</Button></div>
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-slate-50/40 shadow-[0_18px_50px_rgba(15,23,42,0.06)] dark:border-white/10 dark:bg-white/[0.02]">
      <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 dark:border-white/10 dark:bg-white/[0.02]"><div><h2 className="text-[17px] font-semibold text-slate-900 dark:text-white">企业知识库轻向导</h2><p className="mt-1 text-[11px] text-slate-500">资料自动整理，只确认必要事实；进度会自动保存</p></div><div className="hidden gap-2 sm:flex"><span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300">约 2 分钟</span><span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">自动保存</span></div></div>
      <div className="grid lg:grid-cols-[220px_minmax(0,1fr)_250px]">
        <GeoKnowledgeStepNav step={step} maxStep={maxStep} onSelect={setStep} />
        <main
          className="min-h-[430px] p-5 sm:p-7"
          data-tutorial-id={
            step === 0
              ? "geo-knowledge-upload"
              : step === 3
                ? "geo-knowledge-review"
                : "geo-knowledge-entity"
          }
        >
          {step === 0 && <><StepTitle kicker="第 1 步 / 共 4 步" title="先导入已有企业资料" desc="上传资料可以自动提取企业事实；暂时没有资料也可以直接手动填写。" /><GeoDocUploadPanel docs={docs} onChange={handleDocsChange} className="shadow-none" /><button type="button" onClick={() => advanceTo(1)} className="mt-3 text-[11px] text-slate-400 underline-offset-4 hover:text-cyan-600 hover:underline">暂不上传，手动填写</button></>}
          {step === 1 && <><StepTitle kicker="第 2 步 / 共 4 步" title="这些企业信息是否准确？" desc={prefill ? "已根据资料自动整理，只需核对或修改。" : "填写三个必要字段即可，其他信息以后再补充。"} />{prefill && <div className="mb-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[11px] text-emerald-700"><CheckCircle2 className="h-4 w-4" />已从企业资料中识别候选事实</div>}<CoreField id="geo-company" label="企业名称" value={entity.companyName} source={prefill?.companyName.sources.join("、")} onChange={(value) => updateCore("companyName", value)} /><CoreField id="geo-industry" label="所属行业" value={entity.industry} source={prefill?.industry.sources.join("、")} onChange={(value) => updateCore("industry", value)} /><CoreField id="geo-product" label="核心产品或服务" value={entity.coreProduct} source={prefill?.coreProduct.sources.join("、")} onChange={(value) => updateCore("coreProduct", value)} /></>}
          {step === 2 && <><StepTitle kicker="第 3 步 / 共 4 步" title="留下一个官方联系方式" desc="只需联系人姓名和一种联系方式，备用方式可以稍后添加。" /><div className="space-y-4"><div><Label htmlFor="geo-contact-name" className="text-[12px]">联系人姓名</Label><Input id="geo-contact-name" className="mt-1.5" value={entity.officialContact.contactName} onChange={(event) => updateContact({ contactName: event.target.value })} placeholder="例：张经理" /></div><div className="grid gap-2 sm:grid-cols-[120px_1fr]"><Select value={entity.officialContact.primary.type} onValueChange={(value) => updateContact({ primary: { type: value as GeoContactMethod, value: "" } })}><SelectTrigger aria-label="首选联系方式"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="phone">手机</SelectItem><SelectItem value="wechat">微信</SelectItem><SelectItem value="email">邮箱</SelectItem></SelectContent></Select><Input id="geo-contact-primary-value" value={entity.officialContact.primary.value} onChange={(event) => updateContact({ primary: { ...entity.officialContact.primary, value: event.target.value } })} placeholder={`请输入${CONTACT_METHOD_LABELS[entity.officialContact.primary.type]}`} /></div>{!entity.officialContact.backup ? <Button type="button" variant="ghost" size="sm" className="gap-1 px-0 text-cyan-700" onClick={() => updateContact({ backup: { type: entity.officialContact.primary.type === "email" ? "phone" : "email", value: "" } })}><Plus className="h-3.5 w-3.5" />添加备用联系方式</Button> : <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-white/5"><div className="mb-2 flex justify-between text-[11px] text-slate-500"><span>备用联系方式（选填）</span><button type="button" onClick={() => setEntity((current) => { const { backup: _backup, ...contact } = current.officialContact; return { ...current, officialContact: contact } })}><X className="h-3.5 w-3.5" /></button></div><div className="grid gap-2 sm:grid-cols-[120px_1fr]"><Select value={entity.officialContact.backup.type} onValueChange={(value) => updateContact({ backup: { type: value as GeoContactMethod, value: "" } })}><SelectTrigger id="geo-contact-backup-type"><SelectValue /></SelectTrigger><SelectContent>{(["phone", "wechat", "email"] as GeoContactMethod[]).filter((type) => type !== entity.officialContact.primary.type).map((type) => <SelectItem key={type} value={type}>{CONTACT_METHOD_LABELS[type]}</SelectItem>)}</SelectContent></Select><Input id="geo-contact-backup-value" value={entity.officialContact.backup.value} onChange={(event) => updateContact({ backup: { ...entity.officialContact.backup!, value: event.target.value } })} /></div></div>}<p className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] leading-relaxed text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">联系方式仅在内容明确涉及咨询、预约或购买时按需引用，不会自动插入普通文章。</p></div></>}
          {step === 3 && <><StepTitle kicker="第 4 步 / 共 4 步" title="确认企业知识" desc="快速浏览即将写入知识库的事实，生成后仍可继续编辑。" /><GeoKnowledgeReviewStep entity={entity} docs={docs} /><div className="mt-4"><Label htmlFor="geo-skill-name" className="text-[12px]">知识库名称</Label><Input id="geo-skill-name" value={skillName} onChange={(event) => setSkillName(event.target.value)} className="mt-1.5" /></div></>}
          <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-white/10"><Button type="button" variant="ghost" disabled={step === 0 || generating} onClick={() => setStep((current) => Math.max(0, current - 1))} className="gap-1"><ArrowLeft className="h-4 w-4" />上一步</Button>{step < 3 ? <Button type="button" disabled={prefillBusy} onClick={() => void next()} className="gap-1 bg-cyan-600 hover:bg-cyan-700">{prefillBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{prefillBusy ? "正在整理资料" : "继续"}<ArrowRight className="h-4 w-4" /></Button> : <Button type="button" disabled={generating || !skillName.trim()} onClick={() => void generate()} className="gap-1 bg-cyan-600 hover:bg-cyan-700">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{generating ? "生成中" : "生成企业知识库 Skill"}</Button>}</div>
          <div className="mt-5 lg:hidden"><KnowledgeReadiness entity={entity} docs={docs} /></div>
        </main>
        <aside className="hidden border-l border-slate-100 bg-white/70 p-5 lg:block dark:border-white/10 dark:bg-white/[0.02]"><KnowledgeReadiness entity={entity} docs={docs} /></aside>
      </div>
    </div>
  )
}

function StepTitle({ kicker, title, desc }: { kicker: string; title: string; desc: string }) { return <div className="mb-5"><p className="text-[10px] font-semibold tracking-[0.12em] text-cyan-600">{kicker}</p><h3 className="mt-1.5 text-[19px] font-semibold text-slate-900 dark:text-white">{title}</h3><p className="mt-1 text-[12px] text-slate-500">{desc}</p></div> }
function CoreField({ id, label, value, source, onChange }: { id: string; label: string; value: string; source?: string; onChange: (value: string) => void }) { return <div className="mb-4"><div className="flex items-center justify-between"><Label htmlFor={id} className="text-[12px]">{label}</Label>{source && <span className="text-[9px] text-emerald-600">来自：{source}</span>}</div><Input id={id} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1.5" /></div> }
function KnowledgeReadiness({ entity, docs }: { entity: GeoEntityData; docs: GeoUploadedDoc[] }) { return <div><h3 className="text-[12px] font-semibold text-slate-700 dark:text-slate-200">知识准备状态</h3><Status label="企业主体" done={Boolean(entity.companyName && entity.industry && entity.coreProduct)} /><Status label="资料可信度" done={docs.length > 0} optional /><Status label="官方联系方式" done={validateOfficialContact(entity.officialContact).length === 0} /><Status label="知识库 Skill" done={false} /><div className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50/50 p-3 text-[10px] leading-relaxed text-cyan-800 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-200"><Cloud className="mb-2 h-4 w-4" />云端智能调度模型，首选渠道不可用时自动切换备用渠道。</div></div> }
function Status({ label, done, optional }: { label: string; done: boolean; optional?: boolean }) { return <div className="mt-3 flex items-center justify-between rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-[11px] dark:border-white/10 dark:bg-white/5"><span className="text-slate-600 dark:text-slate-300">{label}{optional && <small className="ml-1 text-slate-400">选填</small>}</span><span className={done ? "text-emerald-600" : "text-slate-300"}>{done ? "已完成" : "待完成"}</span></div> }

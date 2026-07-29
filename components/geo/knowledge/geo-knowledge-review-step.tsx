"use client"

import { CheckCircle2, FileText, ShieldCheck } from "lucide-react"
import type { GeoUploadedDoc } from "@/components/geo/geo-doc-upload-panel"
import type { GeoEntityData } from "@/lib/geo/entity-types"
import { CONTACT_METHOD_LABELS } from "@/lib/geo/official-contact"

function FactCard({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]"><h4 className="mb-3 text-[12px] font-semibold text-slate-700 dark:text-slate-200">{title}</h4>{children}</section>
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="grid grid-cols-[84px_1fr] gap-3 border-b border-slate-100 py-2 text-[11px] last:border-0 dark:border-white/5"><span className="text-slate-400">{label}</span><strong className="font-medium text-slate-700 dark:text-slate-300">{value || "待补充"}</strong></div>
}

export function GeoKnowledgeReviewStep({ entity, docs }: { entity: GeoEntityData; docs: GeoUploadedDoc[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <FactCard title="企业主体"><Fact label="企业名称" value={entity.companyName} /><Fact label="所属行业" value={entity.industry} /></FactCard>
      <FactCard title="核心业务"><Fact label="产品或服务" value={entity.coreProduct} /></FactCard>
      <FactCard title="官方联系方式"><Fact label="联系人" value={entity.officialContact.contactName} /><Fact label="首选方式" value={`${CONTACT_METHOD_LABELS[entity.officialContact.primary.type]} · ${entity.officialContact.primary.value}`} /></FactCard>
      <FactCard title="知识引用边界"><div className="flex gap-2 text-[11px] leading-relaxed text-slate-500"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><span>普通内容不主动插入联系方式；仅在咨询、预约或购买等明确场景按需引用。</span></div></FactCard>
      <section className="rounded-xl border border-slate-200/80 bg-white p-4 sm:col-span-2 dark:border-white/10 dark:bg-white/[0.03]">
        <h4 className="mb-3 flex items-center gap-2 text-[12px] font-semibold text-slate-700 dark:text-slate-200"><FileText className="h-4 w-4 text-cyan-500" />事实来源</h4>
        {docs.length ? <div className="flex flex-wrap gap-2">{docs.map((doc) => <span key={doc.name} className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[10px] text-slate-500 dark:border-white/10 dark:bg-white/5">{doc.name}</span>)}</div> : <p className="flex items-center gap-2 text-[11px] text-slate-400"><CheckCircle2 className="h-4 w-4" />本次使用人工确认信息生成</p>}
      </section>
    </div>
  )
}

"use client"

import * as React from "react"
import { useLoginRequired } from "@/components/auth/login-required-provider"
import { Pencil, Save, Star, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/hooks/use-toast"
import { claimLegacyEnterpriseSkills, listEnterpriseSkills, listLegacyEnterpriseSkills, removeEnterpriseSkill, setDefaultEnterpriseSkill, updateEnterpriseSkill, type EnterpriseSkill } from "@/lib/geo/enterprise-skills-store"

export function GeoSavedSkillsPanel({ refreshToken = 0 }: { refreshToken?: number }) {
  const { me } = useLoginRequired()
  const accountScope = me ? `user-${me.user.id}` : null
  const [skills, setSkills] = React.useState<EnterpriseSkill[]>([])
  const [legacyCount, setLegacyCount] = React.useState(0)
  const [editing, setEditing] = React.useState<EnterpriseSkill | null>(null)
  const refresh = React.useCallback(() => {
    setSkills(accountScope ? listEnterpriseSkills(accountScope) : [])
    setLegacyCount(accountScope ? listLegacyEnterpriseSkills().length : 0)
  }, [accountScope])
  React.useEffect(refresh, [refresh, refreshToken])
  if (!accountScope || (!skills.length && legacyCount === 0)) return null
  return (
    <section className="mt-5 rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-white/10 dark:bg-white/[0.03]">
      {legacyCount > 0 && <div className="mb-4 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[12px] font-medium text-amber-900">发现 {legacyCount} 个旧版知识库</p><p className="mt-1 text-[10px] leading-relaxed text-amber-700">旧版数据尚未归属账号。请仅在确认这些知识库属于当前账号时迁移。</p></div><Button type="button" variant="outline" size="sm" className="shrink-0 border-amber-300 bg-white text-amber-800 hover:bg-amber-100" onClick={() => { if (!window.confirm("确认这些旧版知识库属于当前登录账号，并迁移到当前账号吗？")) return; try { const count = claimLegacyEnterpriseSkills(accountScope); refresh(); toast({ title: `已迁移 ${count} 个旧版知识库` }) } catch (error) { toast({ title: error instanceof Error ? error.message : "迁移失败", variant: "destructive" }) } }}>迁移到当前账号</Button></div>}
      <div className="mb-3"><h3 className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">已生成知识库</h3><p className="mt-0.5 text-[11px] text-slate-500">可设为默认、编辑或删除，不影响新的向导草稿。</p></div>
      <div className="space-y-2">{skills.map((skill) => <div key={skill.id} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-white/5 dark:bg-white/[0.02]"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><p className="flex items-center gap-1.5 truncate text-[12px] font-medium text-slate-700 dark:text-slate-300">{skill.default && <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />}{skill.label}</p><p className="mt-0.5 text-[10px] text-slate-400">{new Date(skill.createdAt).toLocaleDateString()} · {skill.provider}</p></div><div className="flex shrink-0 gap-1"><Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[10px]" onClick={() => setEditing(editing?.id === skill.id ? null : skill)}><Pencil className="h-3 w-3" />编辑</Button>{!skill.default && <Button variant="ghost" size="sm" className="h-7 px-2 text-[10px]" onClick={() => { setDefaultEnterpriseSkill(accountScope, skill.id); refresh() }}>设为默认</Button>}<Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-slate-400 hover:text-red-500" onClick={() => { removeEnterpriseSkill(accountScope, skill.id); refresh() }}><Trash2 className="h-3.5 w-3.5" /></Button></div></div>{editing?.id === skill.id && <div className="mt-3 space-y-2 border-t border-slate-100 pt-3 dark:border-white/5"><Input value={editing.label} onChange={(event) => setEditing({ ...editing, label: event.target.value })} /><Input value={editing.description} onChange={(event) => setEditing({ ...editing, description: event.target.value })} /><Textarea value={editing.content} onChange={(event) => setEditing({ ...editing, content: event.target.value })} className="min-h-56 font-mono text-[11px]" /><div className="flex justify-end"><Button size="sm" className="gap-1" onClick={() => { try { updateEnterpriseSkill(accountScope, editing.id, editing); setEditing(null); refresh(); toast({ title: "知识库已更新" }) } catch (error) { toast({ title: error instanceof Error ? error.message : "保存失败", variant: "destructive" }) } }}><Save className="h-3.5 w-3.5" />保存修改</Button></div></div>}</div>)}</div>
    </section>
  )
}

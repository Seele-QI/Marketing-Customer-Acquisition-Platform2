"use client"

import { Check, FileUp, Building2, Contact, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

const STEPS = [
  { title: "导入企业资料", desc: "上传文件或跳过", icon: FileUp },
  { title: "确认企业信息", desc: "核对自动提取结果", icon: Building2 },
  { title: "官方联系方式", desc: "姓名 + 一种方式", icon: Contact },
  { title: "预览并生成", desc: "确认后生成 Skill", icon: Sparkles },
] as const

export function GeoKnowledgeStepNav({ step, maxStep, onSelect }: { step: number; maxStep: number; onSelect: (step: number) => void }) {
  return (
    <nav aria-label="企业知识库搭建步骤" className="flex gap-2 overflow-x-auto border-b border-slate-100 bg-white p-3 lg:block lg:space-y-1 lg:border-b-0 lg:border-r lg:p-4 dark:border-white/10 dark:bg-white/[0.02]">
      {STEPS.map((item, index) => {
        const Icon = item.icon
        const done = index < step
        const active = index === step
        return (
          <button
            key={item.title}
            type="button"
            onClick={() => index <= maxStep && onSelect(index)}
            disabled={index > maxStep}
            className={cn(
              "flex min-w-[168px] items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors lg:w-full lg:min-w-0",
              active ? "bg-cyan-50 text-cyan-900 dark:bg-cyan-500/10 dark:text-cyan-100" : "text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5",
              index > maxStep && "cursor-default opacity-55",
            )}
          >
            <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-white/5", (active || done) && "bg-cyan-500 text-white")}>
              {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
            </span>
            <span><strong className="block text-[12px] font-semibold">{item.title}</strong><small className="mt-0.5 block text-[10px] opacity-70">{item.desc}</small></span>
          </button>
        )
      })}
    </nav>
  )
}

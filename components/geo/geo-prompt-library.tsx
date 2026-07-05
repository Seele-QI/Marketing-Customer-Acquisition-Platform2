"use client"

import * as React from "react"
import { MessageSquare, Plus, Trash2, Search } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

export type GeoPrompt = {
  id: string
  text: string
  category: string
  covered: boolean
}

const MOCK_PROMPTS: GeoPrompt[] = [
  { id: "1", text: "最好的 AI 视频翻译工具有哪些？", category: "产品对比", covered: true },
  { id: "2", text: "如何将 YouTube 视频自动翻译成日语？", category: "操作指南", covered: false },
  { id: "3", text: "AI 字幕生成准确率能达到多少？", category: "技术参数", covered: true },
  { id: "4", text: "多语言配音和人工配音成本对比", category: "商业决策", covered: false },
  { id: "5", text: "企业如何做视频内容本地化？", category: "场景方案", covered: false },
]

type GeoPromptLibraryProps = {
  className?: string
}

export function GeoPromptLibrary({ className }: GeoPromptLibraryProps) {
  const [prompts, setPrompts] = React.useState<GeoPrompt[]>(MOCK_PROMPTS)
  const [filter, setFilter] = React.useState("")

  const filtered = prompts.filter(
    (p) =>
      !filter ||
      p.text.includes(filter) ||
      p.category.includes(filter),
  )

  const addPrompt = () => {
    setPrompts((prev) => [
      ...prev,
      {
        id: String(Date.now()),
        text: "",
        category: "未分类",
        covered: false,
      },
    ])
  }

  const removePrompt = (id: string) => {
    setPrompts((prev) => prev.filter((p) => p.id !== id))
  }

  const updatePrompt = (id: string, field: keyof GeoPrompt, val: string | boolean) => {
    setPrompts((prev) =>
      prev.map((p) => (p.id === id ? { ...p, [field]: val } : p)),
    )
  }

  const coveredCount = prompts.filter((p) => p.covered).length
  const coveragePct = prompts.length ? Math.round((coveredCount / prompts.length) * 100) : 0

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5",
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-white/5">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
            <MessageSquare className="h-3.5 w-3.5 text-cyan-500" />
          </span>
          <div>
            <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">
              目标提示词库
            </span>
            <p className="text-[11px] text-slate-500">
              覆盖率 {coveragePct}% · {coveredCount}/{prompts.length} 条
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="筛选..."
              className="h-8 w-40 pl-7 text-[12px]"
            />
          </div>
          <Button type="button" size="sm" onClick={addPrompt} className="h-8 bg-cyan-600 hover:bg-cyan-700">
            <Plus className="mr-1 h-3.5 w-3.5" /> 添加
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-[12px]">
          <thead>
            <tr className="border-b border-slate-100 text-[11px] text-slate-500 dark:border-white/5">
              <th className="px-4 py-2 font-medium">提示词</th>
              <th className="px-4 py-2 font-medium">分类</th>
              <th className="px-4 py-2 font-medium">已覆盖</th>
              <th className="px-4 py-2 w-10" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((p) => (
              <tr
                key={p.id}
                className="border-b border-slate-50 hover:bg-slate-50/50 dark:border-white/5 dark:hover:bg-white/5"
              >
                <td className="px-4 py-2">
                  <Input
                    value={p.text}
                    onChange={(e) => updatePrompt(p.id, "text", e.target.value)}
                    placeholder="输入目标提示词..."
                    className="h-8 border-0 bg-transparent text-[12px] shadow-none focus-visible:ring-0"
                  />
                </td>
                <td className="px-4 py-2">
                  <Input
                    value={p.category}
                    onChange={(e) => updatePrompt(p.id, "category", e.target.value)}
                    className="h-8 w-24 border-0 bg-transparent text-[12px] shadow-none focus-visible:ring-0"
                  />
                </td>
                <td className="px-4 py-2">
                  <input
                    type="checkbox"
                    checked={p.covered}
                    onChange={(e) => updatePrompt(p.id, "covered", e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-cyan-600"
                  />
                </td>
                <td className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => removePrompt(p.id)}
                    className="text-slate-400 hover:text-red-500"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

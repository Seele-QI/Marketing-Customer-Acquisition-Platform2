"use client"

import * as React from "react"
import {
  ChevronRight,
  FileQuestion,
  BarChart2,
  Eye,
  EyeOff,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  GeoWorkflowPage,
  GeoWorkflowHero,
  GeoWorkflowStepIndicator,
  buildGeoArticleSteps,
  type GeoWorkflowStepId,
} from "@/components/geo/geo-workflow-shell"
import { GeoScorePanel } from "@/components/geo/geo-score-panel"
import { GeoLlmProviderSelect } from "@/components/geo/geo-llm-provider-select"
import { GeoSkillToolbar } from "@/components/geo/geo-knowledge-base-picker"
import { GeoResearchPanel } from "@/components/geo/geo-research-panel"
import type { LlmProviderId } from "@/lib/geo/llm/router"
import { getEnterpriseSkillEntry } from "@/lib/geo/skills-registry"

const ARTICLE_PROVIDER_KEY = "geo-article-llm-provider"

const OUTLINE = [
  { id: "1", title: "引言：AI 视频翻译趋势", level: 1 },
  { id: "2", title: "核心概念定义", level: 1 },
  { id: "3", title: "技术原理", level: 2 },
  { id: "4", title: "应用场景", level: 2 },
  { id: "5", title: "数据与证据", level: 1 },
  { id: "6", title: "常见问题 FAQ", level: 1 },
]

const DEFAULT_MARKDOWN = `# AI 视频翻译完全指南

## 什么是 AI 视频翻译？

如果你在为全球观众制作内容，AI 视频翻译能自动将语音和字幕转换为多种语言——无需逐句人工翻译。

## 核心优势

- **100+ 语言支持**，覆盖主流出海市场
- **92% 翻译准确率**（基于 2025 内部基准）
- 人工后期编辑时间减少 **90%**

## 常见问题

### Q: AI 翻译能保证配音与画面同步吗？
A: 是的。神经语音合成技术支持音画对齐，并允许音色定制。

### Q: 适合哪些类型的视频？
A: 教程、产品演示、社媒短视频和企业培训均可高效本地化。
`

export function GeoArticleEditorView() {
  const [step, setStep] = React.useState<GeoWorkflowStepId>(3)
  const [markdown, setMarkdown] = React.useState(DEFAULT_MARKDOWN)
  const [preview, setPreview] = React.useState(false)
  const [activeSection, setActiveSection] = React.useState("1")
  const [modelSkillId, setModelSkillId] = React.useState<string | null>(null)
  const [viralSkillIds, setViralSkillIds] = React.useState<string[]>([])
  const [enterpriseSkillId, setEnterpriseSkillId] = React.useState<string | null>(null)
  const [sidebarCollapsed, setSidebarCollapsed] = React.useState(false)
  const [provider, setProvider] = React.useState<LlmProviderId>("deepseek")

  React.useEffect(() => {
    try {
      const stored = localStorage.getItem(ARTICLE_PROVIDER_KEY)
      if (
        stored === "deepseek" ||
        stored === "doubao" ||
        stored === "kimi" ||
        stored === "gpt" ||
        stored === "claude" ||
        stored === "gemini"
      ) {
        setProvider(stored)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const handleProviderChange = React.useCallback((id: LlmProviderId) => {
    setProvider(id)
    try {
      localStorage.setItem(ARTICLE_PROVIDER_KEY, id)
    } catch {
      /* ignore */
    }
  }, [])

  const enterpriseSnapshot = React.useMemo(
    () => getEnterpriseSkillEntry(enterpriseSkillId)?.content ?? null,
    [enterpriseSkillId],
  )

  const insertBlock = (type: "faq" | "evidence") => {
    const block =
      type === "faq"
        ? `\n\n### Q: 你的问题？\nA: 简明、可验证的回答。\n`
        : `\n\n> 量化数据点：具体数字 + 来源（例：2025 内部基准）\n`
    setMarkdown((prev) => prev + block)
  }

  return (
    <GeoWorkflowPage>
      <GeoWorkflowHero
        title="深度优化"
        accentWord="文章创作"
        description="检索 → 起草 → GEO 四维优化 → 导出。语义、对话、证据、FAQ 缺一不可。"
        trailing={
          <div className="flex flex-wrap items-center gap-2">
            <GeoLlmProviderSelect value={provider} onChange={handleProviderChange} />
            <GeoSkillToolbar
              modelSkillId={modelSkillId}
              viralSkillIds={viralSkillIds}
              enterpriseSkillId={enterpriseSkillId}
              onModelChange={setModelSkillId}
              onViralChange={setViralSkillIds}
              onEnterpriseChange={setEnterpriseSkillId}
            />
          </div>
        }
      />

      <div className="mb-5">
        <GeoWorkflowStepIndicator
          steps={buildGeoArticleSteps(step)}
          onStepClick={setStep}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-12 lg:gap-4">
        {/* 左栏：检索 + 大纲（可收起） */}
        <aside
          className={cn(
            "overflow-hidden rounded-xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-white/[0.03]",
            sidebarCollapsed ? "lg:col-span-1" : "lg:col-span-3",
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-2 py-1.5 dark:border-white/5">
            {!sidebarCollapsed && (
              <span className="px-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                侧栏
              </span>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
              aria-expanded={!sidebarCollapsed}
              className={cn("h-7 w-7 p-0", sidebarCollapsed && "mx-auto")}
              onClick={() => setSidebarCollapsed((c) => !c)}
            >
              {sidebarCollapsed ? (
                <PanelLeft className="h-3.5 w-3.5" />
              ) : (
                <PanelLeftClose className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          {!sidebarCollapsed && (
            <>
              <GeoResearchPanel
                modelSkillId={modelSkillId}
                enterpriseSnapshot={enterpriseSnapshot}
                provider={provider}
                onInsertCitation={(block) => setMarkdown((prev) => prev + block)}
              />
              <div className="p-3">
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                  大纲
                </h3>
                <ul className="space-y-0.5" aria-label="文章大纲">
                  {OUTLINE.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        aria-current={activeSection === item.id ? "true" : undefined}
                        onClick={() => setActiveSection(item.id)}
                        className={cn(
                          "flex w-full items-center gap-1 rounded-md px-2 py-1.5 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30",
                          activeSection === item.id
                            ? "bg-cyan-50 font-medium text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300"
                            : "text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-white/5",
                          item.level === 2 && "pl-4",
                        )}
                      >
                        <ChevronRight
                          className={cn(
                            "h-3 w-3 shrink-0 transition-opacity",
                            activeSection === item.id ? "opacity-70" : "opacity-30",
                          )}
                          aria-hidden
                        />
                        <span className="truncate">{item.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </aside>

        {/* 中栏：编辑器 */}
        <main
          className={cn(
            "flex flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white dark:border-white/10 dark:bg-white/[0.03]",
            sidebarCollapsed ? "lg:col-span-7" : "lg:col-span-5",
          )}
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 dark:border-white/5">
            <span className="text-[12px] font-semibold text-slate-800 dark:text-slate-200">
              正文
            </span>
            <div className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="插入 FAQ 块"
                className="h-7 px-2 text-[11px]"
                onClick={() => insertBlock("faq")}
              >
                <FileQuestion className="mr-1 h-3 w-3" aria-hidden /> FAQ
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="插入证据块"
                className="h-7 px-2 text-[11px]"
                onClick={() => insertBlock("evidence")}
              >
                <BarChart2 className="mr-1 h-3 w-3" aria-hidden /> 证据
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={preview ? "切换到编辑模式" : "切换到预览模式"}
                aria-pressed={preview}
                className={cn(
                  "h-7 px-2 text-[11px]",
                  preview && "bg-cyan-50 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300",
                )}
                onClick={() => setPreview((p) => !p)}
              >
                {preview ? (
                  <>
                    <EyeOff className="mr-1 h-3 w-3" aria-hidden /> 编辑
                  </>
                ) : (
                  <>
                    <Eye className="mr-1 h-3 w-3" aria-hidden /> 预览
                  </>
                )}
              </Button>
            </div>
          </div>
          {preview ? (
            <div className="min-h-[420px] flex-1 overflow-y-auto p-4">
              <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-slate-700 dark:text-slate-300">
                {markdown}
              </pre>
            </div>
          ) : (
            <Textarea
              value={markdown}
              onChange={(e) => setMarkdown(e.target.value)}
              aria-label="文章 Markdown 正文"
              className="min-h-[420px] flex-1 resize-none rounded-none border-0 bg-transparent text-[13px] leading-relaxed shadow-none focus-visible:ring-0"
              placeholder="在此撰写 GEO 优化长文…"
            />
          )}
        </main>

        {/* 右栏：评分 */}
        <aside className="space-y-3 lg:col-span-4">
          <GeoScorePanel />
        </aside>
      </div>
    </GeoWorkflowPage>
  )
}

"use client"

import * as React from "react"
import {
  Building2,
  Plus,
  Trash2,
  Link2,
  Loader2,
  Download,
  CheckCircle2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/hooks/use-toast"

import type { AuthorityPage, GeoEntityData } from "@/lib/geo/entity-types"

export type { GeoEntityData } from "@/lib/geo/entity-types"

const DEFAULT_ENTITY: GeoEntityData = {
  companyName: "",
  industry: "",
  coreProduct: "",
  authorityLinks: [""],
  authorityPages: [],
  faqs: [],
}

type GeoEntityPanelProps = {
  value?: GeoEntityData
  onChange?: (data: GeoEntityData) => void
  className?: string
}

export function GeoEntityPanel({ value, onChange, className }: GeoEntityPanelProps) {
  const [data, setData] = React.useState<GeoEntityData>(value ?? DEFAULT_ENTITY)
  const [fetchingIndex, setFetchingIndex] = React.useState<number | null>(null)

  React.useEffect(() => {
    if (value) setData(value)
  }, [value])

  const update = (
    patch: Partial<GeoEntityData> | ((prev: GeoEntityData) => GeoEntityData),
  ) => {
    setData((prev) => {
      const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch }
      onChange?.(next)
      return next
    })
  }

  const addLink = () => {
    update({ authorityLinks: [...data.authorityLinks, ""] })
  }

  const updateLink = (index: number, val: string) => {
    const prevUrl = data.authorityLinks[index]?.trim()
    const authorityLinks = data.authorityLinks.map((l, i) => (i === index ? val : l))
    let authorityPages = data.authorityPages ?? []
    if (prevUrl && prevUrl !== val.trim()) {
      authorityPages = authorityPages.filter((p) => p.url !== prevUrl)
    }
    update({ authorityLinks, authorityPages })
  }

  const removeLink = (index: number) => {
    const url = data.authorityLinks[index]?.trim()
    const authorityLinks = data.authorityLinks.filter((_, i) => i !== index)
    const authorityPages = (data.authorityPages ?? []).filter((p) => p.url !== url)
    update({
      authorityLinks: authorityLinks.length > 0 ? authorityLinks : [""],
      authorityPages,
    })
  }

  const pageForUrl = (url: string): AuthorityPage | undefined =>
    (data.authorityPages ?? []).find((p) => p.url === url.trim())

  const upsertPage = (page: AuthorityPage) => {
    update((prev) => ({
      ...prev,
      authorityPages: [
        ...(prev.authorityPages ?? []).filter((p) => p.url !== page.url),
        page,
      ],
    }))
  }

  const handleFetch = async (index: number) => {
    const url = data.authorityLinks[index]?.trim()
    if (!url) {
      toast({ title: "请先填写链接", variant: "destructive" })
      return
    }
    setFetchingIndex(index)
    try {
      const res = await fetch("/api/geo/authority-link/fetch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ url }),
      })
      const json = (await res.json()) as {
        page?: AuthorityPage
        error?: string
      }
      if (!res.ok) {
        upsertPage({
          url,
          title: url,
          content: "",
          error: json.error ?? "抓取失败",
        })
        throw new Error(json.error ?? "抓取失败")
      }
      if (!json.page) throw new Error("响应缺少 page")
      upsertPage({
        ...json.page,
        error: undefined,
      })
      toast({
        title: "抓取成功",
        description: "正文已缓存，生成 Skill 时作为 AI 上下文（界面不展示全文）",
      })
    } catch (err) {
      toast({
        title: "抓取失败",
        description: err instanceof Error ? err.message : "请稍后重试",
        variant: "destructive",
      })
    } finally {
      setFetchingIndex(null)
    }
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-white/5",
        className,
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
          <Building2 className="h-4 w-4 text-cyan-500" />
        </span>
        <div>
          <h3 className="text-[15px] font-semibold text-slate-900 dark:text-slate-50">实体建模</h3>
          <p className="text-[12px] text-slate-500">品牌、产品与权威链接结构化定义</p>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="geo-company" className="text-[12px]">
            企业名称
          </Label>
          <Input
            id="geo-company"
            value={data.companyName}
            onChange={(e) => update({ companyName: e.target.value })}
            placeholder="例：KrillinAI"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="geo-industry" className="text-[12px]">
            行业
          </Label>
          <Input
            id="geo-industry"
            value={data.industry}
            onChange={(e) => update({ industry: e.target.value })}
            placeholder="例：AI 视频翻译与内容智能"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="geo-product" className="text-[12px]">
            核心产品
          </Label>
          <Input
            id="geo-product"
            value={data.coreProduct}
            onChange={(e) => update({ coreProduct: e.target.value })}
            placeholder="例：多语言视频翻译套件"
            className="mt-1"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <Label className="text-[12px]">权威链接 (sameAs)</Label>
            <Button type="button" variant="ghost" size="sm" onClick={addLink} className="h-7 text-[11px]">
              <Plus className="mr-1 h-3 w-3" /> 添加
            </Button>
          </div>
          <p className="mb-2 text-[10px] text-slate-400">
            填写可公开访问的网页 URL，点击「抓取」下载正文（仅作 AI 分析上下文，界面不展示全文）；生成 Skill 时也会自动补抓
          </p>
          <div className="space-y-2">
            {data.authorityLinks.map((link, i) => {
              const page = pageForUrl(link)
              const isFetching = fetchingIndex === i
              const ready = Boolean(page?.content?.trim() && !page.error)
              return (
                <div key={i} className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <Input
                      value={link}
                      onChange={(e) => updateLink(i, e.target.value)}
                      placeholder="https://"
                      className="text-[13px]"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9 shrink-0 gap-1 px-2 text-[11px]"
                      disabled={isFetching || !link.trim()}
                      onClick={() => void handleFetch(i)}
                    >
                      {isFetching ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )}
                      抓取
                    </Button>
                    {data.authorityLinks.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-9 w-9 shrink-0 p-0 text-slate-400 hover:text-red-500"
                        aria-label="删除链接"
                        onClick={() => removeLink(i)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {page && (
                    <div className="ml-5 flex items-center gap-1.5 text-[10px]">
                      {page.error && !page.content ? (
                        <span className="text-red-500">{page.error}</span>
                      ) : ready ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-500" />
                          <span className="text-emerald-600 dark:text-emerald-400">
                            已抓取，供 AI 分析使用
                            {page.title ? `（${page.title.slice(0, 40)}${page.title.length > 40 ? "…" : ""}）` : ""}
                          </span>
                        </>
                      ) : null}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

export function entityToSchema(data: GeoEntityData): object {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        name: data.companyName || "Your Brand",
        url: data.authorityLinks.filter(Boolean)[0] || "https://example.com",
        industry: data.industry,
        sameAs: data.authorityLinks.filter(Boolean),
      },
      {
        "@type": "Product",
        name: data.coreProduct || "Core Product",
        brand: { "@type": "Organization", name: data.companyName || "Your Brand" },
        description: `${data.coreProduct} — ${data.industry}`,
      },
    ],
  }
}

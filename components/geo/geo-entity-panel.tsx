"use client"

import * as React from "react"
import { Building2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import type { GeoEntityData } from "@/lib/geo/entity-types"

export type { GeoEntityData } from "@/lib/geo/entity-types"

const DEFAULT_ENTITY: GeoEntityData = {
  companyName: "",
  industry: "",
  coreProduct: "",
  authorityLinks: [],
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

  React.useEffect(() => {
    if (value) setData(value)
  }, [value])

  const update = (patch: Partial<GeoEntityData>) => {
    setData((prev) => {
      const next = {
        ...prev,
        ...patch,
        // UI 已移除权威链接：始终清空，避免旧状态残留进生成链路
        authorityLinks: [],
        authorityPages: [],
      }
      onChange?.(next)
      return next
    })
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
          <p className="text-[12px] text-slate-500">品牌与产品结构化定义</p>
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
        industry: data.industry,
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

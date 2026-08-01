"use client"

import * as React from "react"
import { Building2, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import type { GeoContactMethod, GeoEntityData } from "@/lib/geo/entity-types"
import {
  CONTACT_METHOD_LABELS,
  EMPTY_OFFICIAL_CONTACT,
  validateOfficialContact,
} from "@/lib/geo/official-contact"

export type { GeoEntityData } from "@/lib/geo/entity-types"

const DEFAULT_ENTITY: GeoEntityData = {
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
}

function normalizeEntity(value?: GeoEntityData): GeoEntityData {
  if (!value) return DEFAULT_ENTITY
  const officialContact = (value as Partial<GeoEntityData>).officialContact
  return {
    ...value,
    officialContact: officialContact ?? {
      ...EMPTY_OFFICIAL_CONTACT,
      primary: { ...EMPTY_OFFICIAL_CONTACT.primary },
    },
  }
}

type GeoEntityPanelProps = {
  value?: GeoEntityData
  onChange?: (data: GeoEntityData) => void
  className?: string
  validationAttempt?: number
}

export function GeoEntityPanel({
  value,
  onChange,
  className,
  validationAttempt = 0,
}: GeoEntityPanelProps) {
  const [data, setData] = React.useState<GeoEntityData>(() => normalizeEntity(value))

  React.useEffect(() => {
    if (value) setData(normalizeEntity(value))
  }, [value])

  const update = (patch: Partial<GeoEntityData>) => {
    const next = {
      ...data,
      ...patch,
      // UI 已移除权威链接：始终清空，避免旧状态残留进生成链路
      authorityLinks: [],
      authorityPages: [],
    }
    setData(next)
    onChange?.(next)
  }

  const updateContact = (officialContact: GeoEntityData["officialContact"]) => {
    update({ officialContact })
  }

  const contactIssues = validationAttempt > 0
    ? validateOfficialContact(data.officialContact)
    : []
  const issueFor = (fieldId: string) =>
    contactIssues.find((issue) => issue.fieldId === fieldId)?.message
  const nameError = issueFor("geo-contact-name")
  const primaryError = issueFor("geo-contact-primary-value")
  const backupTypeError = issueFor("geo-contact-backup-type")
  const backupValueError = issueFor("geo-contact-backup-value")

  const setPrimaryType = (type: GeoContactMethod) => {
    const current = data.officialContact
    const backup = current.backup?.type === type ? undefined : current.backup
    updateContact({
      contactName: current.contactName,
      primary: { type, value: "" },
      ...(backup ? { backup } : {}),
    })
  }

  const addBackup = () => {
    const type = (["phone", "wechat", "email"] as GeoContactMethod[])
      .find((method) => method !== data.officialContact.primary.type) ?? "email"
    updateContact({
      ...data.officialContact,
      backup: { type, value: "" },
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

        <div className="border-t border-slate-100 pt-4 dark:border-white/10">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-medium text-slate-800 dark:text-slate-200">
                官方联系方式
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                只需联系人姓名和一种联系方式
              </p>
            </div>
            {!data.officialContact.backup && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-[11px] text-cyan-700"
                onClick={addBackup}
              >
                <Plus className="h-3 w-3" />
                添加备用联系方式
              </Button>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <Label htmlFor="geo-contact-name" className="text-[12px]">
                联系人姓名 <span className="text-red-500">*</span>
              </Label>
              <Input
                id="geo-contact-name"
                value={data.officialContact.contactName}
                onChange={(event) => updateContact({
                  ...data.officialContact,
                  contactName: event.target.value,
                })}
                placeholder="例：张经理"
                className="mt-1"
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? "geo-contact-name-error" : undefined}
              />
              {nameError && (
                <p id="geo-contact-name-error" className="mt-1 text-[11px] text-red-500">
                  {nameError}
                </p>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
              <Select
                value={data.officialContact.primary.type}
                onValueChange={(value) => setPrimaryType(value as GeoContactMethod)}
              >
                <SelectTrigger id="geo-contact-primary-type" className="mt-1 w-full" aria-label="首选联系方式">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">手机</SelectItem>
                  <SelectItem value="wechat">微信</SelectItem>
                  <SelectItem value="email">邮箱</SelectItem>
                </SelectContent>
              </Select>
              <div>
                <Label htmlFor="geo-contact-primary-value" className="sr-only">
                  {CONTACT_METHOD_LABELS[data.officialContact.primary.type]}
                </Label>
                <Input
                  id="geo-contact-primary-value"
                  value={data.officialContact.primary.value}
                  onChange={(event) => updateContact({
                    ...data.officialContact,
                    primary: {
                      ...data.officialContact.primary,
                      value: event.target.value,
                    },
                  })}
                  placeholder={`请输入${CONTACT_METHOD_LABELS[data.officialContact.primary.type]}`}
                  className="mt-1"
                  aria-invalid={Boolean(primaryError)}
                  aria-describedby={primaryError ? "geo-contact-primary-error" : undefined}
                />
                {primaryError && (
                  <p id="geo-contact-primary-error" className="mt-1 text-[11px] text-red-500">
                    {primaryError}
                  </p>
                )}
              </div>
            </div>

            {data.officialContact.backup && (
              <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-white/5 dark:bg-white/[0.02]">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-slate-500">备用联系方式（选填）</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-slate-400"
                    aria-label="移除备用联系方式"
                    onClick={() => {
                      const { backup: _backup, ...rest } = data.officialContact
                      updateContact(rest)
                    }}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-[120px_1fr]">
                  <div>
                    <Select
                      value={data.officialContact.backup.type}
                      onValueChange={(value) => updateContact({
                        ...data.officialContact,
                        backup: { type: value as GeoContactMethod, value: "" },
                      })}
                    >
                      <SelectTrigger
                        id="geo-contact-backup-type"
                        className="w-full"
                        aria-label="备用联系方式"
                        aria-invalid={Boolean(backupTypeError)}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["phone", "wechat", "email"] as GeoContactMethod[]).map((method) => (
                          <SelectItem
                            key={method}
                            value={method}
                            disabled={method === data.officialContact.primary.type}
                          >
                            {CONTACT_METHOD_LABELS[method]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {backupTypeError && (
                      <p className="mt-1 text-[11px] text-red-500">{backupTypeError}</p>
                    )}
                  </div>
                  <div>
                    <Input
                      id="geo-contact-backup-value"
                      value={data.officialContact.backup.value}
                      onChange={(event) => updateContact({
                        ...data.officialContact,
                        backup: {
                          ...data.officialContact.backup!,
                          value: event.target.value,
                        },
                      })}
                      placeholder={`请输入备用${CONTACT_METHOD_LABELS[data.officialContact.backup.type]}`}
                      aria-invalid={Boolean(backupValueError)}
                      aria-describedby={backupValueError ? "geo-contact-backup-error" : undefined}
                    />
                    {backupValueError && (
                      <p id="geo-contact-backup-error" className="mt-1 text-[11px] text-red-500">
                        {backupValueError}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          <p className="mt-3 text-[10px] leading-relaxed text-slate-400">
            联系方式会发送给所选大模型并保存在本地 Skill 中，仅在需要时用于内容创作。
          </p>
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

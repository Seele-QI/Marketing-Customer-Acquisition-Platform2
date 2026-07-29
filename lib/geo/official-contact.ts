import type {
  GeoContactChannel,
  GeoContactMethod,
  GeoOfficialContact,
} from "@/lib/geo/entity-types"

export type OfficialContactIssue = {
  fieldId: string
  message: string
}

export const CONTACT_METHOD_LABELS: Record<GeoContactMethod, string> = {
  phone: "手机",
  wechat: "微信",
  email: "邮箱",
}

export const EMPTY_OFFICIAL_CONTACT: GeoOfficialContact = {
  contactName: "",
  primary: { type: "phone", value: "" },
}

const CONTACT_METHODS = new Set<GeoContactMethod>(["phone", "wechat", "email"])

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {}
}

function sanitizeMethod(value: unknown): GeoContactMethod {
  const method = String(value ?? "") as GeoContactMethod
  return CONTACT_METHODS.has(method) ? method : "phone"
}

function maxValueLength(method: GeoContactMethod): number {
  if (method === "phone") return 24
  if (method === "wechat") return 40
  return 254
}

function sanitizeChannel(raw: unknown): GeoContactChannel {
  const channel = asRecord(raw)
  const type = sanitizeMethod(channel.type)
  return {
    type,
    value: String(channel.value ?? "").trim().slice(0, maxValueLength(type)),
  }
}

export function sanitizeOfficialContact(raw: unknown): GeoOfficialContact {
  const contact = asRecord(raw)
  const primary = sanitizeChannel(contact.primary)
  const backupRaw = asRecord(contact.backup)
  const hasBackup = Object.keys(backupRaw).length > 0

  return {
    contactName: String(contact.contactName ?? "").trim().slice(0, 30),
    primary,
    ...(hasBackup ? { backup: sanitizeChannel(backupRaw) } : {}),
  }
}

function channelIssue(
  channel: GeoContactChannel,
  fieldId: string,
  prefix = "",
): OfficialContactIssue | undefined {
  const value = channel.value.trim()
  const label = CONTACT_METHOD_LABELS[channel.type]

  if (!value) {
    return { fieldId, message: `请填写${prefix}${label}` }
  }

  if (channel.type === "phone") {
    const digits = value.replace(/\D/g, "")
    if (value.length < 6 || value.length > 24 || digits.length < 6 || !/^[+\d\s()\-]+$/.test(value)) {
      return { fieldId, message: "请输入有效的手机号" }
    }
  }

  if (channel.type === "wechat" && (value.length < 2 || value.length > 40)) {
    return { fieldId, message: "请输入有效的微信号" }
  }

  if (
    channel.type === "email" &&
    (value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
  ) {
    return { fieldId, message: "请输入有效的邮箱地址" }
  }
}

export function validateOfficialContact(contact: GeoOfficialContact): OfficialContactIssue[] {
  const issues: OfficialContactIssue[] = []
  const name = contact.contactName.trim()

  if (!name) {
    issues.push({ fieldId: "geo-contact-name", message: "请填写联系人姓名" })
  } else if (name.length < 2 || name.length > 30) {
    issues.push({ fieldId: "geo-contact-name", message: "联系人姓名需为 2–30 个字符" })
  }

  const primaryIssue = channelIssue(contact.primary, "geo-contact-primary-value")
  if (primaryIssue) issues.push(primaryIssue)

  if (contact.backup) {
    if (contact.backup.type === contact.primary.type) {
      issues.push({
        fieldId: "geo-contact-backup-type",
        message: "备用联系方式需选择其他类型",
      })
    }
    const backupIssue = channelIssue(contact.backup, "geo-contact-backup-value", "备用")
    if (backupIssue) issues.push(backupIssue)
  }

  return issues
}

export function firstOfficialContactIssue(
  contact: GeoOfficialContact,
): OfficialContactIssue | undefined {
  return validateOfficialContact(contact)[0]
}

export function formatOfficialContactBlock(contact: GeoOfficialContact): string {
  const lines = [
    `联系人：${contact.contactName}`,
    `${CONTACT_METHOD_LABELS[contact.primary.type]}：${contact.primary.value}`,
  ]
  if (contact.backup) {
    lines.push(`备用${CONTACT_METHOD_LABELS[contact.backup.type]}：${contact.backup.value}`)
  }
  lines.push(
    "使用边界：仅在用户明确要求联系、咨询、预约或购买时引用；不得主动插入普通内容。",
  )
  return lines.join("\n")
}

export function ensureOfficialContactSection(
  content: string,
  contact: GeoOfficialContact,
): string {
  const section = `## 官方联系方式\n\n${formatOfficialContactBlock(contact)}`
  const lines = content.trim().split(/\r?\n/)
  const start = lines.findIndex((line) => line.trim() === "## 官方联系方式")
  if (start < 0) return `${content.trim()}\n\n${section}\n`

  const relativeEnd = lines
    .slice(start + 1)
    .findIndex((line) => /^##\s+/.test(line.trim()))
  const end = relativeEnd < 0 ? lines.length : start + 1 + relativeEnd
  lines.splice(start, end - start, ...section.split("\n"))
  return `${lines.join("\n").trim()}\n`
}

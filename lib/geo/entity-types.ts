/** 企业知识库实体建模（客户端与 API 共享类型） */

export type GeoEntityFaq = {
  question: string
  answer: string
}

export type GeoContactMethod = "phone" | "wechat" | "email"

export type GeoContactChannel = {
  type: GeoContactMethod
  value: string
}

export type GeoOfficialContact = {
  contactName: string
  primary: GeoContactChannel
  backup?: GeoContactChannel
}

/** 权威链接抓取结果（与 authorityLinks 按 url 对齐） */
export type AuthorityPage = {
  url: string
  title: string
  content: string
  picture?: string
  fetchedAt?: string
  error?: string
}

export type GeoEntityData = {
  companyName: string
  industry: string
  coreProduct: string
  authorityLinks: string[]
  /** 已抓取的网页正文，按 url 索引 */
  authorityPages?: AuthorityPage[]
  faqs: GeoEntityFaq[]
  officialContact: GeoOfficialContact
}

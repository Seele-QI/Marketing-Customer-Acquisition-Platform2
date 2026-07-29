import assert from "node:assert/strict"
import test from "node:test"

import {
  EMPTY_OFFICIAL_CONTACT,
  ensureOfficialContactSection,
  firstOfficialContactIssue,
  formatOfficialContactBlock,
  sanitizeOfficialContact,
  validateOfficialContact,
} from "../lib/geo/official-contact.ts"

test("requires a contact name and one primary channel", () => {
  assert.deepEqual(firstOfficialContactIssue(EMPTY_OFFICIAL_CONTACT), {
    fieldId: "geo-contact-name",
    message: "请填写联系人姓名",
  })
})

test("accepts phone, wechat, and email primary contacts", () => {
  for (const primary of [
    { type: "phone" as const, value: "+86 138-0000-0000" },
    { type: "wechat" as const, value: "caifu-service" },
    { type: "email" as const, value: "service@example.com" },
  ]) {
    assert.deepEqual(
      validateOfficialContact({ contactName: "张三", primary }),
      [],
    )
  }
})

test("rejects malformed values and duplicate backup types", () => {
  const issues = validateOfficialContact({
    contactName: "张三",
    primary: { type: "email", value: "not-an-email" },
    backup: { type: "email", value: "service@example.com" },
  })
  assert.ok(issues.some((issue) => issue.message === "请输入有效的邮箱地址"))
  assert.ok(issues.some((issue) => issue.message === "备用联系方式需选择其他类型"))
})

test("sanitizes whitespace and caps input lengths", () => {
  assert.deepEqual(
    sanitizeOfficialContact({
      contactName: "  张三  ",
      primary: { type: "wechat", value: "  caifu-service  " },
    }),
    {
      contactName: "张三",
      primary: { type: "wechat", value: "caifu-service" },
    },
  )
})

const contact = {
  contactName: "张三",
  primary: { type: "phone" as const, value: "13800000000" },
  backup: { type: "email" as const, value: "service@example.com" },
}

test("formats exact official contact values", () => {
  assert.equal(
    formatOfficialContactBlock(contact),
    [
      "联系人：张三",
      "手机：13800000000",
      "备用邮箱：service@example.com",
      "使用边界：仅在用户明确要求联系、咨询、预约或购买时引用；不得主动插入普通内容。",
    ].join("\n"),
  )
})

test("replaces a model-edited contact section with exact input", () => {
  const repaired = ensureOfficialContactSection(
    "# 企业知识库\n\n## 官方联系方式\n\n联系人：李四\n手机：10086\n\n## FAQ\n\n内容",
    contact,
  )
  assert.match(repaired, /联系人：张三/)
  assert.match(repaired, /手机：13800000000/)
  assert.doesNotMatch(repaired, /李四|10086/)
  assert.equal((repaired.match(/^## 官方联系方式$/gm) ?? []).length, 1)
  assert.match(repaired, /## FAQ\n\n内容/)
})

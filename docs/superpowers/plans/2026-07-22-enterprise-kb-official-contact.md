# Enterprise Knowledge Base Official Contact Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a contact name plus one official phone, WeChat, or email when generating an enterprise knowledge-base Skill, while keeping the form compact and preventing unsolicited contact details from leaking into ordinary GEO content.

**Architecture:** Add a focused pure domain module for contact normalization, validation, prompt formatting, and deterministic Skill-section repair. Reuse that module in the client form, generation panel, API route, and enterprise Skill prompt so validation and output remain consistent. Keep storage in the existing local enterprise Skill body; do not add CRM or server-side contact persistence.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Radix Select, Node `node:test`, existing GEO LLM router and localStorage Skill store.

---

## File map

- Create `lib/geo/official-contact.ts`: contact constants, normalization, validation, field mapping, prompt block, and deterministic Skill section repair.
- Modify `lib/geo/entity-types.ts`: shared official-contact types and required `officialContact` entity field.
- Modify `components/geo/geo-entity-panel.tsx`: compact official-contact editor with one visible primary method and an optional backup method.
- Modify `components/geo-knowledge-base-view.tsx`: coordinate validation attempts between the entity panel and generator panel; include contact readiness in health status.
- Modify `components/geo/geo-skill-generator-panel.tsx`: block invalid generation, show the precise error, and focus the first invalid field.
- Modify `lib/geo/enterprise-skill-prompt.ts`: inject the official contact and its usage boundary into the model input and system contract.
- Modify `app/api/geo/enterprise-skill/generate/route.ts`: sanitize and validate contact before billing, then deterministically enforce the returned Skill section.
- Create `tests/geo-official-contact.test.ts`: pure validation and deterministic section tests.
- Create `tests/enterprise-skill-contact-prompt.test.ts`: prompt contract tests.
- Create `tests/enterprise-skill-contact-route.test.ts`: API source/order and sanitizer contract tests.
- Create `tests/geo-entity-contact-ui.test.ts`: compact UI and validation wiring source-contract tests.
- Modify `skills/geo/README.md`: describe the new minimal official-contact requirement in the tracked C-layer documentation.

## Task 1: Add the official-contact domain model and validation

**Files:**
- Create: `lib/geo/official-contact.ts`
- Modify: `lib/geo/entity-types.ts`
- Test: `tests/geo-official-contact.test.ts`

- [ ] **Step 1: Write the failing validation tests**

Create `tests/geo-official-contact.test.ts` with exact valid and invalid examples:

```ts
import assert from "node:assert/strict"
import test from "node:test"

import {
  EMPTY_OFFICIAL_CONTACT,
  firstOfficialContactIssue,
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
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/geo-official-contact.test.ts
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/geo/official-contact.ts`.

- [ ] **Step 3: Add shared types and the minimal pure implementation**

Add these types to `lib/geo/entity-types.ts` and add `officialContact` to `GeoEntityData`:

```ts
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

export type GeoEntityData = {
  companyName: string
  industry: string
  coreProduct: string
  authorityLinks: string[]
  authorityPages?: AuthorityPage[]
  faqs: GeoEntityFaq[]
  officialContact: GeoOfficialContact
}
```

Create `lib/geo/official-contact.ts` with these public contracts:

```ts
import type {
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

export function sanitizeOfficialContact(raw: unknown): GeoOfficialContact
export function validateOfficialContact(contact: GeoOfficialContact): OfficialContactIssue[]
export function firstOfficialContactIssue(
  contact: GeoOfficialContact,
): OfficialContactIssue | undefined
```

Implementation rules:

- Trim all values.
- Cap `contactName` at 30 characters, phone at 24, WeChat at 40, and email at 254.
- Accept phone characters matching `^[+\d\s()\-]+$` only when total length is 6–24 and there are at least 6 digits.
- Accept WeChat values with trimmed length 2–40 without a legacy account-name regex.
- Accept email with `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` and maximum length 254.
- Validate name before primary value, then backup type and value so `firstOfficialContactIssue` can drive focus deterministically.
- Map field IDs to `geo-contact-name`, `geo-contact-primary-value`, `geo-contact-backup-type`, and `geo-contact-backup-value`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the same command. Expected: 4 tests pass, 0 fail.

- [ ] **Step 5: Commit the domain layer**

```powershell
git add lib/geo/entity-types.ts lib/geo/official-contact.ts tests/geo-official-contact.test.ts
git commit -m "feat(geo): add official contact validation"
```

## Task 2: Put exact official contact data into the generated Skill

**Files:**
- Modify: `lib/geo/official-contact.ts`
- Modify: `lib/geo/enterprise-skill-prompt.ts`
- Test: `tests/geo-official-contact.test.ts`
- Test: `tests/enterprise-skill-contact-prompt.test.ts`

- [ ] **Step 1: Write failing prompt and deterministic-output tests**

Append to `tests/geo-official-contact.test.ts`:

```ts
import {
  ensureOfficialContactSection,
  formatOfficialContactBlock,
} from "../lib/geo/official-contact.ts"

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
```

Create `tests/enterprise-skill-contact-prompt.test.ts`:

```ts
import assert from "node:assert/strict"
import test from "node:test"

import {
  buildEnterpriseSkillSystemPrompt,
  buildEnterpriseSkillUserPrompt,
} from "../lib/geo/enterprise-skill-prompt.ts"

const entity = {
  companyName: "财赋财税",
  industry: "财税服务",
  coreProduct: "代理记账",
  authorityLinks: [],
  authorityPages: [],
  faqs: [],
  officialContact: {
    contactName: "张三",
    primary: { type: "wechat" as const, value: "caifu-service" },
  },
}

test("requires an official contact section without rewriting values", () => {
  const system = buildEnterpriseSkillSystemPrompt()
  assert.match(system, /官方联系方式/)
  assert.match(system, /逐字保留/)
  assert.match(system, /不得主动插入普通内容/)
})

test("injects only the sanitized official contact block", () => {
  const user = buildEnterpriseSkillUserPrompt("财赋财税 GEO 知识库", entity, [])
  assert.match(user, /联系人：张三/)
  assert.match(user, /微信：caifu-service/)
  assert.doesNotMatch(user, /CRM|客户线索/)
})
```

- [ ] **Step 2: Run both tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/geo-official-contact.test.ts tests/enterprise-skill-contact-prompt.test.ts
```

Expected: FAIL because the formatter, section repair, and prompt clauses do not exist.

- [ ] **Step 3: Add deterministic formatting and section repair**

Add to `lib/geo/official-contact.ts`:

```ts
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
  const relativeEnd = lines.slice(start + 1).findIndex((line) => /^##\s+/.test(line.trim()))
  const end = relativeEnd < 0 ? lines.length : start + 1 + relativeEnd
  lines.splice(start, end - start, ...section.split("\n"))
  return `${lines.join("\n").trim()}\n`
}
```

- [ ] **Step 4: Update the enterprise Skill prompt contract**

In `lib/geo/enterprise-skill-prompt.ts`:

- Import `formatOfficialContactBlock`.
- Add `## 官方联系方式` to the required system-prompt chapters.
- State that the model must preserve values exactly, must not infer roles, and must include the usage boundary once.
- Append this exact user-prompt block after entity information:

```ts
## 官方联系方式
${formatOfficialContactBlock(entity.officialContact)}
```

- [ ] **Step 5: Run the focused tests and verify GREEN**

Expected: all contact and prompt tests pass.

- [ ] **Step 6: Commit the Skill-output contract**

```powershell
git add lib/geo/official-contact.ts lib/geo/enterprise-skill-prompt.ts tests/geo-official-contact.test.ts tests/enterprise-skill-contact-prompt.test.ts
git commit -m "feat(geo): preserve official contacts in skills"
```

## Task 3: Enforce server-side validation before billing

**Files:**
- Modify: `app/api/geo/enterprise-skill/generate/route.ts`
- Test: `tests/enterprise-skill-contact-route.test.ts`

- [ ] **Step 1: Write failing API contract tests**

Create `tests/enterprise-skill-contact-route.test.ts`:

```ts
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import { sanitizeEntity } from "../app/api/geo/enterprise-skill/generate/route.ts"

test("sanitizes the official contact into the shared entity shape", () => {
  const entity = sanitizeEntity({
    companyName: " 财赋财税 ",
    officialContact: {
      contactName: " 张三 ",
      primary: { type: "email", value: " service@example.com " },
    },
  })
  assert.equal(entity.officialContact.contactName, "张三")
  assert.equal(entity.officialContact.primary.value, "service@example.com")
})

test("validates contact before charging or calling the model", async () => {
  const source = await readFile(
    new URL("../app/api/geo/enterprise-skill/generate/route.ts", import.meta.url),
    "utf8",
  )
  const validationIndex = source.indexOf("const contactIssue = validateOfficialContact")
  const billingIndex = source.indexOf("await chargeCredit")
  const completionIndex = source.indexOf("await completeText")
  assert.ok(validationIndex >= 0)
  assert.ok(validationIndex < billingIndex)
  assert.ok(validationIndex < completionIndex)
  assert.match(source, /status:\s*400/)
})

test("repairs the contact section before returning the skill", async () => {
  const source = await readFile(
    new URL("../app/api/geo/enterprise-skill/generate/route.ts", import.meta.url),
    "utf8",
  )
  assert.match(source, /ensureOfficialContactSection\(cleaned, entity\.officialContact\)/)
})
```

- [ ] **Step 2: Run the route tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/enterprise-skill-contact-route.test.ts
```

Expected: FAIL because `sanitizeEntity` is not exported and contact validation/repair is absent.

- [ ] **Step 3: Sanitize and validate before charging**

In `app/api/geo/enterprise-skill/generate/route.ts`:

- Import `ensureOfficialContactSection`, `sanitizeOfficialContact`, and `validateOfficialContact`.
- Export `sanitizeEntity` for focused tests.
- Populate `officialContact` using `sanitizeOfficialContact(e.officialContact)`.
- Immediately after the existing Skill-name and company/document checks, run:

```ts
const contactIssue = validateOfficialContact(entity.officialContact)[0]
if (contactIssue) {
  return NextResponse.json({ error: contactIssue.message }, { status: 400 })
}
```

- Keep this block before `refId` creation and `chargeCredit`.
- Never log the entity or the contact value.

- [ ] **Step 4: Repair the generated section deterministically**

Replace direct use of `cleaned` with:

```ts
const finalized = ensureOfficialContactSection(cleaned, entity.officialContact)
const description = extractSkillDescription(finalized)
```

Return `content: finalized`. This guarantees the saved Skill matches the validated input without a second model call.

- [ ] **Step 5: Run route and prompt tests**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/geo-official-contact.test.ts tests/enterprise-skill-contact-prompt.test.ts tests/enterprise-skill-contact-route.test.ts
```

Expected: all tests pass and no billing/model call appears before validation in the source contract.

- [ ] **Step 6: Commit the API enforcement**

```powershell
git add app/api/geo/enterprise-skill/generate/route.ts tests/enterprise-skill-contact-route.test.ts
git commit -m "feat(geo): require contact before skill billing"
```

## Task 4: Build the compact contact editor and focus-on-error flow

**Files:**
- Modify: `components/geo/geo-entity-panel.tsx`
- Modify: `components/geo-knowledge-base-view.tsx`
- Modify: `components/geo/geo-skill-generator-panel.tsx`
- Test: `tests/geo-entity-contact-ui.test.ts`

- [ ] **Step 1: Write failing compact-UI contract tests**

Create `tests/geo-entity-contact-ui.test.ts`:

```ts
import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const entityPanelUrl = new URL("../components/geo/geo-entity-panel.tsx", import.meta.url)
const generatorUrl = new URL("../components/geo/geo-skill-generator-panel.tsx", import.meta.url)
const viewUrl = new URL("../components/geo-knowledge-base-view.tsx", import.meta.url)

test("entity panel exposes one primary contact and an optional backup", async () => {
  const source = await readFile(entityPanelUrl, "utf8")
  assert.match(source, /官方联系方式/)
  assert.match(source, /添加备用联系方式/)
  assert.match(source, /仅在需要时用于内容创作/)
  assert.match(source, /geo-contact-name/)
  assert.match(source, /geo-contact-primary-value/)
})

test("generator validates and focuses the first contact error", async () => {
  const source = await readFile(generatorUrl, "utf8")
  assert.match(source, /firstOfficialContactIssue/)
  assert.match(source, /document\.getElementById\(contactIssue\.fieldId\)/)
  assert.match(source, /onContactValidationError/)
})

test("knowledge-base view coordinates validation attempts", async () => {
  const source = await readFile(viewUrl, "utf8")
  assert.match(source, /contactValidationAttempt/)
  assert.match(source, /onContactValidationError/)
  assert.match(source, /官方联系方式已完善/)
})
```

- [ ] **Step 2: Run the UI contract test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/geo-entity-contact-ui.test.ts
```

Expected: FAIL because the contact editor and validation wiring do not exist.

- [ ] **Step 3: Add the compact editor to `GeoEntityPanel`**

Update `DEFAULT_ENTITY` to use a fresh copy of `EMPTY_OFFICIAL_CONTACT`. Add a `validationAttempt?: number` prop and render validation messages only after that value is greater than zero.

Use the existing Radix Select components and these stable IDs:

```tsx
<Input id="geo-contact-name" ... />
<Select value={data.officialContact.primary.type} ...>
  <SelectItem value="phone">手机</SelectItem>
  <SelectItem value="wechat">微信</SelectItem>
  <SelectItem value="email">邮箱</SelectItem>
</Select>
<Input id="geo-contact-primary-value" ... />
```

Behavior requirements:

- Default primary type is `phone` so a customer only types a name and one value.
- Changing primary type clears `primary.value` and removes a backup of the same type.
- Backup UI is absent until “添加备用联系方式” is clicked.
- Backup select omits or disables the selected primary type.
- Removing backup deletes `officialContact.backup`.
- Show “联系方式会发送给所选大模型并保存在本地 Skill 中，仅在需要时用于内容创作。” below the section.
- After a validation attempt, render each issue beside its related field and set `aria-invalid`/`aria-describedby`.

- [ ] **Step 4: Coordinate validation in the page and generator**

In `components/geo-knowledge-base-view.tsx`:

```ts
const [contactValidationAttempt, setContactValidationAttempt] = React.useState(0)
```

Pass it to `GeoEntityPanel`. Pass this callback to `GeoSkillGeneratorPanel`:

```ts
onContactValidationError={(fieldId) => {
  setContactValidationAttempt((value) => value + 1)
  window.requestAnimationFrame(() => document.getElementById(fieldId)?.focus())
}}
```

Add a fourth health item named “官方联系方式已完善” using `validateOfficialContact(entity.officialContact).length === 0`. Change the health grid from `sm:grid-cols-3` to `sm:grid-cols-2 lg:grid-cols-4`.

In `components/geo/geo-skill-generator-panel.tsx`:

- Add `onContactValidationError?: (fieldId: string) => void` to props.
- Keep `canGenerate` limited to the existing Skill-name and company/document prerequisites. Do not disable the button for contact errors, because clicking the button is what reveals the precise error and focuses the field.
- At the beginning of `handleGenerate`, call `firstOfficialContactIssue(entity.officialContact)`.
- When invalid, show a destructive toast with the issue message, call `onContactValidationError(issue.fieldId)`, and return before setting `generating`.
- Ensure the fallback entity body includes `officialContact: EMPTY_OFFICIAL_CONTACT`.

- [ ] **Step 5: Run UI and domain tests**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/geo-official-contact.test.ts tests/geo-entity-contact-ui.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Run TypeScript checking before committing**

Run:

```powershell
npx tsc --noEmit --pretty false
```

Expected: exit code 0. Fix only contact-feature type errors; do not modify unrelated dirty files.

- [ ] **Step 7: Commit the compact UI**

```powershell
git add components/geo/geo-entity-panel.tsx components/geo-knowledge-base-view.tsx components/geo/geo-skill-generator-panel.tsx tests/geo-entity-contact-ui.test.ts
git commit -m "feat(geo): collect minimal official contact"
```

## Task 5: Update workflow documentation and run full verification

**Files:**
- Modify: `skills/geo/README.md`
- Test: `tests/geo-official-contact.test.ts`
- Test: `tests/enterprise-skill-contact-prompt.test.ts`
- Test: `tests/enterprise-skill-contact-route.test.ts`
- Test: `tests/geo-entity-contact-ui.test.ts`

- [ ] **Step 1: Update the enterprise knowledge-base tutorial step**

In `skills/geo/README.md`, extend “C 层（企业知识库）” to state:

```md
填写企业名称、行业和核心产品后，再填写联系人姓名，并在手机、微信、邮箱中任选一种作为官方联系方式。备用联系方式按需添加，不需要为了生成 Skill 补充非必要资料。

官方联系方式会写入企业知识库 Skill；普通内容默认不会主动展示，只有创作任务明确要求联系、咨询、预约或购买方式时才按需引用。
```

- [ ] **Step 2: Run all new contact tests**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/geo-official-contact.test.ts tests/enterprise-skill-contact-prompt.test.ts tests/enterprise-skill-contact-route.test.ts tests/geo-entity-contact-ui.test.ts
```

Expected: all tests pass, 0 fail.

- [ ] **Step 3: Run adjacent GEO regression tests**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-structure.test.ts tests/article-compliance.test.ts tests/article-format.test.ts tests/article-prompt.test.ts tests/article-generate.test.ts tests/article-batch-jobs.test.ts tests/article-export.test.ts tests/geo-article-billing.test.ts tests/geo-official-contact.test.ts tests/enterprise-skill-contact-prompt.test.ts tests/enterprise-skill-contact-route.test.ts tests/geo-entity-contact-ui.test.ts
```

Expected: all tests pass, 0 fail.

- [ ] **Step 4: Run final type and whitespace verification**

Run:

```powershell
npx tsc --noEmit --pretty false
git diff --check
```

Expected: TypeScript exits 0. If `git diff --check` reports unrelated pre-existing dirty files, rerun it against only the feature commit range and report the distinction explicitly.

- [ ] **Step 5: Commit documentation**

```powershell
git add skills/geo/README.md
git commit -m "docs(geo): explain official contact intake"
```

- [ ] **Step 6: Perform a final implementation review**

Verify the final diff against `docs/superpowers/specs/2026-07-22-enterprise-kb-official-contact-design.md`:

- No CRM/API persistence was added.
- No contact value is logged.
- Server validation occurs before billing.
- Model output is deterministically repaired.
- The UI requires only a name and one primary channel.
- Ordinary GEO article compliance remains unchanged.
- Existing unrelated working-tree changes remain untouched.

## Execution note

Implement in the current task with `superpowers:executing-plans`. The repository already contains many unrelated user changes, so every commit must stage exact paths only and verify the staged-file list before committing. Do not create or dispatch subagents unless the user explicitly changes that constraint.

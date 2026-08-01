# GEO Article Generation Safeguards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce structurally complete GEO articles around 900–1100 non-whitespace characters, reject successful output above 1200 characters, and apply common plus platform-specific compliance checks for all eight supported platforms.

**Architecture:** Add focused structure and compliance modules, then compose them into the existing prompt and generation pipeline. The first model result is normalized and validated; only invalid results receive one corrective rewrite, and a second invalid result becomes a failed article instead of being character-truncated.

**Tech Stack:** TypeScript, Node.js `node:test`, existing GEO LLM router, Next.js server modules.

---

## File map

- Create `lib/geo/article-structure.ts`: structure selection, prompt template lookup, section detection, and complete-article validation.
- Create `lib/geo/article-compliance.ts`: common risk rules, eight platform profiles, prompt guidance, and deterministic risk findings.
- Modify `lib/geo/article-format.ts`: use 900/1100/1200 constants, preserve pure-text cleanup and tags, remove character truncation.
- Modify `lib/geo/article-prompt.ts`: compose the selected structure and platform guidance; build corrective rewrite prompts.
- Modify `lib/geo/article-generate.ts`: validate the first result, rewrite once if necessary, validate again, and fail safely.
- Modify `skills/geo/creation-guidelines/deep-article-optimization/SKILL.md` and `output-template.md`: align human-readable product rules with runtime behavior.
- Create `tests/article-structure.test.ts`, `tests/article-compliance.test.ts`, `tests/article-prompt.test.ts`, and `tests/article-generate.test.ts`; update `tests/article-format.test.ts`.

### Task 1: Article structure selection and validation

**Files:**
- Create: `lib/geo/article-structure.ts`
- Create: `tests/article-structure.test.ts`

- [ ] **Step 1: Write failing structure tests**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import {
  selectArticleStructure,
  validateArticleStructure,
} from "../lib/geo/article-structure.ts"

test("selects the four approved case structures", () => {
  assert.equal(selectArticleStructure({ title: "新手入门步骤", brief: "必办清单" }), "beginner")
  assert.equal(selectArticleStructure({ title: "代账公司和个人会计哪个好", brief: "优缺点对比" }), "comparison")
  assert.equal(selectArticleStructure({ title: "常见的五个坑", brief: "避坑 FAQ" }), "faq")
  assert.equal(selectArticleStructure({ title: "创业经历复盘", brief: "真实案例分享" }), "case_story")
})

test("falls back to beginner and detects three explicit sections", () => {
  assert.equal(selectArticleStructure({ title: "普通主题", brief: "内容方向" }), "beginner")
  const result = validateArticleStructure("标题\n\n一、先确认范围\n内容。\n\n二、准备材料\n内容。\n\n三、完成核验\n内容。\n\n总结\n内容。")
  assert.equal(result.sectionCount, 3)
  assert.equal(result.missingEnding, false)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-structure.test.ts
```

Expected: FAIL because `lib/geo/article-structure.ts` does not exist.

- [ ] **Step 3: Implement the structure module**

Use these public types and functions:

```ts
export type ArticleStructureId = "beginner" | "comparison" | "faq" | "case_story"

export type ArticleStructureInput = {
  title: string
  brief: string
  format?: string | null
}

export type ArticleStructureCheck = {
  sectionCount: number
  missingEnding: boolean
}

export function selectArticleStructure(input: ArticleStructureInput): ArticleStructureId
export function getArticleStructurePrompt(id: ArticleStructureId): string
export function validateArticleStructure(text: string): ArticleStructureCheck
```

Selection precedence is `format`, then `title + brief`, using these intent groups:

```ts
const INTENTS = {
  comparison: /对比|比较|区别|优缺点|哪个好|怎么选|\bvs\b/i,
  faq: /避坑|踩坑|误区|风险|注意事项|常见问题|FAQ/i,
  case_story: /案例|经历|复盘|经验分享|真实体验|过来人|故事/i,
  beginner: /新手|入门|教程|步骤|清单|怎么办|必做|指南/i,
}
```

Count only explicit plain-text section headings such as `一、`、`第一项`、`坑一：`、`问题1：` and `Q：`; detect an ending heading containing `总结`、`最后`、`行动建议` or `常见问题`.

- [ ] **Step 4: Run the test and verify GREEN**

Run the Task 1 command. Expected: all Task 1 tests pass.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- lib/geo/article-structure.ts tests/article-structure.test.ts
git commit -m "feat(geo): add article structure profiles"
```

### Task 2: Common and platform-specific compliance

**Files:**
- Create: `lib/geo/article-compliance.ts`
- Create: `tests/article-compliance.test.ts`

- [ ] **Step 1: Write failing compliance tests**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import {
  findArticleRisks,
  getPlatformCompliancePrompt,
  PLATFORM_COMPLIANCE_IDS,
} from "../lib/geo/article-compliance.ts"

test("covers every supported GEO platform", () => {
  assert.deepEqual(PLATFORM_COMPLIANCE_IDS, [
    "xiaohongshu", "douyin", "weibo", "dianping",
    "zhihu", "ctrip", "netease", "sohu",
  ])
})

test("finds absolute promises but not normal ordinal wording", () => {
  assert.ok(findArticleRisks("保证通过，100%有效。", "zhihu").length >= 2)
  assert.equal(findArticleRisks("第一步先准备材料，这是我第一次办理。", "zhihu").length, 0)
})

test("adds platform guidance and falls back to common guidance", () => {
  assert.match(getPlatformCompliancePrompt("dianping"), /虚构消费经历/)
  assert.match(getPlatformCompliancePrompt("unknown"), /绝对化承诺/)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-compliance.test.ts
```

Expected: FAIL because `article-compliance.ts` does not exist.

- [ ] **Step 3: Implement compliance profiles and findings**

Expose:

```ts
export type ArticleRiskFinding = {
  id: string
  severity: "block"
  match: string
  guidance: string
}

export const PLATFORM_COMPLIANCE_IDS = [
  "xiaohongshu", "douyin", "weibo", "dianping",
  "zhihu", "ctrip", "netease", "sohu",
] as const

export function getPlatformCompliancePrompt(platformId: string): string
export function findArticleRisks(text: string, platformId: string): ArticleRiskFinding[]
export function summarizeRiskFindings(findings: ArticleRiskFinding[]): string
```

Common blocking patterns must cover unqualified `国家级|最高级|最佳|唯一|顶级|全网最低`, unconditional promises such as `保证通过|包过|稳赚不赔|零风险|根治|无副作用|100%有效`, fabricated-experience cues such as `编一个真实经历|虚构客户评价`, and direct off-platform diversion such as `加微信|加V|扫码联系|私信领取`. Use contextual patterns so `第一步` and `第一次` are not findings.

Platform prompts must encode the eight emphasis areas approved in the design. Unknown IDs return common guidance only.

- [ ] **Step 4: Run the test and verify GREEN**

Run the Task 2 command. Expected: all Task 2 tests pass.

- [ ] **Step 5: Commit Task 2**

```powershell
git add -- lib/geo/article-compliance.ts tests/article-compliance.test.ts
git commit -m "feat(geo): add platform article compliance rules"
```

### Task 3: Preserve complete articles during formatting

**Files:**
- Modify: `lib/geo/article-format.ts`
- Modify: `tests/article-format.test.ts`

- [ ] **Step 1: Replace the truncation test with failing completeness tests**

```ts
import {
  ARTICLE_HARD_MAX_CHARS,
  ARTICLE_TARGET_MAX_CHARS,
  ARTICLE_TARGET_MIN_CHARS,
} from "../lib/geo/article-format.ts"

it("uses the approved 900 1100 1200 limits", () => {
  assert.equal(ARTICLE_TARGET_MIN_CHARS, 900)
  assert.equal(ARTICLE_TARGET_MAX_CHARS, 1100)
  assert.equal(ARTICLE_HARD_MAX_CHARS, 1200)
})

it("normalizes without character-truncating the body", () => {
  const body = `标题\n\n${"完整句子。".repeat(300)}\n\n标签：#A #B #C`
  const out = enforceArticleFormat(body, { title: "标题", platformLabel: "知乎" })
  assert.match(out, /完整句子。\n\n标签：#A #B #C$/)
  assert.ok(countChars(out) > ARTICLE_HARD_MAX_CHARS)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-format.test.ts
```

Expected: FAIL because the new constants do not exist and the current formatter truncates.

- [ ] **Step 3: Implement non-destructive normalization**

Define:

```ts
export const ARTICLE_TARGET_MIN_CHARS = 900
export const ARTICLE_TARGET_MAX_CHARS = 1100
export const ARTICLE_HARD_MAX_CHARS = 1200
/** Compatibility alias for callers that only need the hard ceiling. */
export const ARTICLE_MAX_CHARS = ARTICLE_HARD_MAX_CHARS
```

Remove `SENTENCE_TERMINATORS`, `truncateToBudget`, and the body budget calculation. Keep `stripMarkdown`, tag extraction, fallback tags, and return the complete normalized body plus normalized tag line.

- [ ] **Step 4: Run the test and verify GREEN**

Run the Task 3 command. Expected: all article-format tests pass.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- lib/geo/article-format.ts tests/article-format.test.ts
git commit -m "fix(geo): stop truncating generated articles"
```

### Task 4: Compose structure, length, and compliance into prompts

**Files:**
- Modify: `lib/geo/article-prompt.ts`
- Create: `tests/article-prompt.test.ts`

- [ ] **Step 1: Write failing prompt tests**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import {
  buildArticleRewritePrompt,
  buildArticleUserPrompt,
} from "../lib/geo/article-prompt.ts"

const job = {
  jobId: "j1", mode: "direction" as const, platformId: "dianping",
  title: "代账公司和个人会计哪个好", brief: "优缺点对比",
}

test("article prompt includes target range selected structure and platform compliance", () => {
  const prompt = buildArticleUserPrompt(job, {})
  assert.match(prompt, /900[–-]1100/)
  assert.match(prompt, /1200/)
  assert.match(prompt, /对比问答/)
  assert.match(prompt, /虚构消费经历/)
})

test("rewrite prompt carries only the concrete validation failures", () => {
  const prompt = buildArticleRewritePrompt({
    job, original: "原文", structureId: "comparison",
    reasons: ["全文超过 1200 字", "存在无条件效果承诺"],
  })
  assert.match(prompt, /全文超过 1200 字/)
  assert.match(prompt, /存在无条件效果承诺/)
  assert.match(prompt, /不得新增无法验证的数据/)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-prompt.test.ts
```

Expected: FAIL because rewrite prompt construction is missing and the current prompt does not contain the approved rules.

- [ ] **Step 3: Update prompt construction**

Import the three length constants, `selectArticleStructure`, `getArticleStructurePrompt`, and `getPlatformCompliancePrompt`. The user prompt must identify exactly one selected structure and include its template, platform guidance, 900–1100 target, and 1200 hard limit. Add:

```ts
export function buildArticleRewritePrompt(input: {
  job: ArticleJob
  original: string
  structureId: ArticleStructureId
  reasons: string[]
}): string
```

The rewrite prompt must preserve the supplied title and facts, prohibit new data or experiences, request 900–1100 characters, require complete ending and tags, and include the concrete failure list.

- [ ] **Step 4: Run the test and verify GREEN**

Run the Task 4 command. Expected: all prompt tests pass.

- [ ] **Step 5: Commit Task 4**

```powershell
git add -- lib/geo/article-prompt.ts tests/article-prompt.test.ts
git commit -m "feat(geo): guide article structure and safe wording"
```

### Task 5: Conditional rewrite and safe failure

**Files:**
- Modify: `lib/geo/article-generate.ts`
- Create: `tests/article-generate.test.ts`

- [ ] **Step 1: Write failing generation-flow tests**

Create a `validArticle()` fixture with a title, three explicit sections, a `总结` heading, 900–1100 safe characters, and three tags. Test:

```ts
test("valid output uses one completion call", async () => {
  let calls = 0
  const article = await generateOneArticle(job, {
    provider: "deepseek", batchId: "b1",
    complete: async () => { calls++; return validArticle() },
  })
  assert.equal(article.status, "success")
  assert.equal(calls, 1)
})

test("over-limit output is rewritten once", async () => {
  const outputs = [`标题\n${"内容。".repeat(500)}\n标签：#A #B #C`, validArticle()]
  let calls = 0
  const article = await generateOneArticle(job, {
    provider: "deepseek", batchId: "b1",
    complete: async () => outputs[calls++]!,
  })
  assert.equal(article.status, "success")
  assert.equal(calls, 2)
})

test("second invalid output fails instead of truncating", async () => {
  let calls = 0
  const article = await generateOneArticle(job, {
    provider: "deepseek", batchId: "b1",
    complete: async () => { calls++; return "保证通过。" },
  })
  assert.equal(article.status, "failed")
  assert.equal(calls, 2)
  assert.match(article.error ?? "", /自动修订失败/)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-generate.test.ts
```

Expected: FAIL because dependency injection and conditional rewrite do not exist.

- [ ] **Step 3: Implement validation and one corrective call**

Add to `GenerateArticlesParams`:

```ts
complete?: (params: CompleteTextParams) => Promise<string>
```

Use `params.complete ?? completeText`. After normalization, combine:

```ts
const structure = validateArticleStructure(formatted)
const risks = findArticleRisks(formatted, job.platformId)
const charCount = countChars(formatted)
const tagValid = /^标签：(?:#[^\s#]+)(?:\s+#[^\s#]+){2,4}$/m.test(lastNonBlankLine)
const reasons = [
  ...(charCount > ARTICLE_HARD_MAX_CHARS ? ["全文超过 1200 字"] : []),
  ...(structure.sectionCount < 3 ? ["正文少于 3 个清晰小节"] : []),
  ...(structure.missingEnding ? ["缺少总结或常见问题结尾"] : []),
  ...(!tagValid ? ["文末标签格式不合格"] : []),
  ...risks.map((risk) => risk.guidance),
]
```

No reasons means success. Otherwise call the completion function once with `buildArticleRewritePrompt`, a rewrite billing suffix `:rewrite`, and the same provider. Normalize and validate again; if reasons remain, throw `文章未通过篇幅、结构或平台合规校验，自动修订失败：${reasons.join("；")}`. Empty first output fails immediately without rewrite.

- [ ] **Step 4: Run focused generation tests and GEO regression tests**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-generate.test.ts tests/article-format.test.ts tests/article-batch-jobs.test.ts tests/geo-article-billing.test.ts
```

Expected: all listed tests pass.

- [ ] **Step 5: Commit Task 5**

```powershell
git add -- lib/geo/article-generate.ts tests/article-generate.test.ts
git commit -m "feat(geo): rewrite invalid articles once"
```

### Task 6: Product rule synchronization and final verification

**Files:**
- Modify: `skills/geo/creation-guidelines/deep-article-optimization/SKILL.md`
- Modify: `skills/geo/creation-guidelines/deep-article-optimization/output-template.md`

- [ ] **Step 1: Update the written creation rules**

Replace the old `≤1000` rule with:

```md
- 目标篇幅：900–1100 个非空白字符
- 成功成稿硬上限：1200 个非空白字符
- 禁止依靠字符级截断压缩文章；异常成稿最多进行一次结构化重写
```

Document the four exclusive structure types and the common plus platform-specific compliance model. Keep the existing evidence, retrieval, plain-text, FAQ, and ethics rules.

- [ ] **Step 2: Update the output template**

The template must show one selected structure, 3–5 explicit plain-text section headings, a conclusion or FAQ ending, and a final `标签：#标签一 #标签二 #标签三` line. It must not require Markdown headings, emoji, tables, JSON-LD, contact details, or unverifiable first-person experience.

- [ ] **Step 3: Run all focused tests**

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-structure.test.ts tests/article-compliance.test.ts tests/article-format.test.ts tests/article-prompt.test.ts tests/article-generate.test.ts tests/article-batch-jobs.test.ts tests/article-export.test.ts tests/geo-article-billing.test.ts
```

Expected: all listed tests pass with zero failures.

- [ ] **Step 4: Run TypeScript verification**

```powershell
npx tsc --noEmit
```

Expected: exit code 0. If unrelated pre-existing errors remain, record the exact errors and also run `npx tsc --noEmit --pretty false` to confirm no error points at files changed by this plan.

- [ ] **Step 5: Audit the final diff and requirements**

```powershell
git diff --check
git status --short
git diff -- lib/geo/article-structure.ts lib/geo/article-compliance.ts lib/geo/article-format.ts lib/geo/article-prompt.ts lib/geo/article-generate.ts skills/geo/creation-guidelines/deep-article-optimization tests/article-structure.test.ts tests/article-compliance.test.ts tests/article-format.test.ts tests/article-prompt.test.ts tests/article-generate.test.ts
```

Expected: no whitespace errors; diff contains only the planned GEO article logic and tests, while unrelated user changes remain untouched.

- [ ] **Step 6: Commit documentation synchronization**

```powershell
git add -- skills/geo/creation-guidelines/deep-article-optimization/SKILL.md skills/geo/creation-guidelines/deep-article-optimization/output-template.md
git commit -m "docs(geo): align article creation guidelines"
```

# Enterprise Knowledge Base Quality Standard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every generated enterprise knowledge base structurally complete, evidence-aware, quality-gated, and safely reusable by all GEO creation modules without increasing required customer input.

**Architecture:** Expand the generation contract around a dedicated pure quality module, run one model repair pass when needed, then apply deterministic safe normalization. Add a section-aware context compressor so article, scoring, retrieval, and matrix prompts receive the most relevant parts of long enterprise skills instead of only their first characters.

**Tech Stack:** Next.js App Router, TypeScript, React, Node test runner, localStorage enterprise Skill registry, existing GEO LLM router.

---

### Task 1: Define and test the enterprise knowledge base quality contract

**Files:**
- Create: `lib/geo/enterprise-skill-quality.ts`
- Create: `tests/enterprise-skill-quality.test.ts`

- [ ] **Step 1: Write failing tests for the required structure**

Cover a complete synthetic Skill, a Skill missing sections, insufficient FAQ entries, fenced output, and unmarked high-risk facts. Assert a report with `score`, `passed`, `checks`, and actionable `issues`.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/enterprise-skill-quality.test.ts`

Expected: FAIL because `enterprise-skill-quality.ts` does not exist.

- [ ] **Step 3: Implement the pure quality module**

Define the canonical ordered heading list and implement:

```ts
export type EnterpriseSkillQualityReport = {
  score: number
  passed: boolean
  checks: string[]
  issues: string[]
  repaired?: boolean
}

export function inspectEnterpriseSkill(content: string): EnterpriseSkillQualityReport
export function normalizeEnterpriseSkill(content: string): string
export function ensureEnterpriseSkillSections(content: string): string
```

`normalizeEnterpriseSkill` removes outer code fences and marks un-attributed lines containing price, percentage, year, team size, qualifications, client results, or testimonial patterns with `【待核验】`. `ensureEnterpriseSkillSections` appends only safe missing sections with `待补充` content and generates safe FAQ placeholders until there are eight question headings.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2 and expect all cases to pass.

- [ ] **Step 5: Commit the quality contract**

Stage only the two task files and commit `feat(geo): add enterprise knowledge quality gate`.

### Task 2: Raise the generation prompt to the sample-or-better standard

**Files:**
- Modify: `lib/geo/enterprise-skill-prompt.ts`
- Modify: `tests/enterprise-skill-contact-prompt.test.ts`
- Create: `tests/enterprise-skill-quality-prompt.test.ts`

- [ ] **Step 1: Add failing prompt-contract tests**

Assert the system prompt contains all canonical headings, at least-eight-FAQ instruction, source-state rules, prompt-injection boundary, no-fabricated-pricing/team/cases rule, and concise high-density guidance. Assert the repair prompt includes the actual validation issues and treats prior output as data.

- [ ] **Step 2: Run prompt tests and verify RED**

Run both enterprise prompt test files with the Node test command and expect the new assertions to fail.

- [ ] **Step 3: Implement expanded prompts**

Update `buildEnterpriseSkillSystemPrompt()` to encode the full output contract and export:

```ts
export function buildEnterpriseSkillRepairPrompt(
  original: string,
  issues: string[],
): string
```

Preserve the exact-contact requirements. Delimit authority pages and uploaded documents as untrusted source data. Keep the result dense enough to stay below the existing 32KB browser storage limit.

- [ ] **Step 4: Run prompt tests and verify GREEN**

Run both prompt tests and the existing official-contact tests.

- [ ] **Step 5: Commit prompt changes**

Commit `feat(geo): strengthen enterprise knowledge prompt`.

### Task 3: Integrate repair, deterministic finalization, and quality metadata

**Files:**
- Modify: `app/api/geo/enterprise-skill/generate/route.ts`
- Modify: `lib/geo/enterprise-skills-store.ts`
- Modify: `lib/geo/skills-registry.ts`
- Modify: `tests/enterprise-skill-contact-route.test.ts`
- Create: `tests/enterprise-skill-generation-flow.test.ts`

- [ ] **Step 1: Add failing route-flow and compatibility tests**

Extract a testable generation finalizer or orchestrator. Verify one repair call occurs for an invalid first draft, no repair call occurs for a valid draft, deterministic contact replacement runs after repair, missing sections receive safe fallback content, `quality.repaired` is recorded, and legacy stored entries without `quality` still satisfy runtime guards.

- [ ] **Step 2: Run focused tests and verify RED**

Run the enterprise generation flow, route, and store tests; expect missing APIs and fields.

- [ ] **Step 3: Implement the generation flow**

Within the existing single billing transaction:

1. generate the first draft;
2. normalize and enforce exact contact;
3. inspect quality;
4. call `completeText` once with the repair prompt if needed;
5. normalize, enforce exact contact, and append safe missing sections;
6. inspect again and return the Skill with its final quality report.

Increase model token capacity only as needed for the denser output while retaining the 32KB storage contract. Add optional `quality` metadata to `EnterpriseSkill` and `GeoSkillEntry`; do not change the localStorage key or invalidate old entries.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run all enterprise Skill tests and ensure the existing pre-billing contact validation ordering remains intact.

- [ ] **Step 5: Commit generation integration**

Commit `feat(geo): enforce enterprise skill quality`.

### Task 4: Build section-aware cross-module context extraction

**Files:**
- Create: `lib/geo/enterprise-context.ts`
- Create: `tests/enterprise-context.test.ts`
- Modify: `lib/geo/build-skill-context.ts`
- Modify: `lib/geo/content-matrix-prompt.ts`
- Create or modify: `tests/geo-skill-context.test.ts`

- [ ] **Step 1: Write failing extraction tests**

Use a synthetic Skill longer than 8,000 characters whose official contact, boundaries, and source list appear at the end. Assert article context contains representative content from prioritized early and late sections within its budget. Assert matrix context excludes contact values but includes positioning, target scenarios, GEO questions, and boundaries. Assert malformed legacy text falls back without throwing.

- [ ] **Step 2: Run focused tests and verify RED**

Run the enterprise context and skill context test files; expect the new module to be absent and current raw `slice` behavior to fail.

- [ ] **Step 3: Implement section-aware compression**

Export:

```ts
export function buildEnterpriseContext(
  content: string,
  options: { maxChars: number; includeContact: boolean },
): string
```

Parse `##` sections, map legacy aliases, allocate bounded excerpts across prioritized sections, and always carry the relevant usage boundary. Replace `ent.slice(0, 4000)` and `ent.slice(0, 6000)` with this function; use `includeContact: true` for article/scoring/retrieval and `false` for content matrix planning.

- [ ] **Step 4: Add explicit contact-use constraints to article prompts**

State that official contact information may only appear if the title or brief explicitly requests contact, consultation, appointment, purchase, address, phone, WeChat, or email. This preserves the enterprise Skill’s contact contract across article generation and repair.

- [ ] **Step 5: Run tests and commit**

Run context, article prompt, score prompt, retrieval adapter, and matrix prompt tests. Commit `feat(geo): preserve enterprise context across modules`.

### Task 5: Expose quality status without adding customer workload

**Files:**
- Modify: `components/geo/geo-skill-generator-panel.tsx`
- Modify: `components/geo/geo-doc-upload-panel.tsx`
- Modify: `components/geo-knowledge-base-view.tsx`
- Create: `tests/enterprise-skill-quality-ui.test.ts`

- [ ] **Step 1: Add failing source-level UI contract tests**

Assert the generator renders the returned quality score, pass/fail label, repaired state, and remaining issue list. Assert upload copy explains automatic extraction and safe missing-value handling. Assert the page does not add new required team, price, case, or qualification inputs.

- [ ] **Step 2: Run the UI contract test and verify RED**

Run the new Node test and expect missing quality UI strings.

- [ ] **Step 3: Implement compact quality feedback**

Add a small quality panel above the preview text. Use green styling only when `quality.passed`; show that the system auto-repaired when applicable; display remaining issues as warnings. Update helper copy to emphasize document-first extraction. Keep all current required inputs unchanged.

- [ ] **Step 4: Run UI and store tests and verify GREEN**

Run the focused UI test plus existing official-contact UI/source tests.

- [ ] **Step 5: Commit UI changes**

Commit `feat(geo): show enterprise knowledge quality status`.

### Task 6: Full regression and integration verification

**Files:**
- Modify only if a test exposes an in-scope defect.

- [ ] **Step 1: Run all enterprise and GEO prompt tests**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/enterprise-skill*.test.ts tests/enterprise-context.test.ts tests/geo-official-contact.test.ts tests/geo-skill-context.test.ts tests/geo-article-*.test.ts tests/geo-content-matrix*.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 2: Run TypeScript validation**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Inspect the final diff and storage compatibility**

Confirm no unrelated dirty files are staged, the localStorage key remains `geo-enterprise-skills-v1`, contact validation still precedes billing, and context budgets are enforced.

- [ ] **Step 4: Commit any final in-scope fixes**

If verification required code changes, commit them as `fix(geo): complete enterprise knowledge regression` after rerunning the affected checks.

- [ ] **Step 5: Merge the isolated implementation branch**

Return to the user’s original branch, verify it has not changed unexpectedly, merge the implementation branch without touching unrelated working-tree changes, and rerun the focused tests and TypeScript check on the merged branch.

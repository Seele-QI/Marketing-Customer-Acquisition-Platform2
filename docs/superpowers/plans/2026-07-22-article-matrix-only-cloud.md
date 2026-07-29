# Article Matrix-Only Cloud Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the content matrix the only source for GEO article creation and route article generation, retry, and scoring exclusively through cloud-distributed models.

**Architecture:** The client submits only the selected matrix project, dates, and copies per cell. Server routes reload the project, derive all platforms and Skill context, and inject an ordered cloud completion boundary into the existing article generator. Legacy request fields remain ignored rather than trusted.

**Tech Stack:** Next.js App Router, React, TypeScript, SSE, Node test runner, existing matrix store and cloud copywriting router.

---

### Task 1: Lock the matrix-only UI contract

**Files:**
- Create: `tests/article-matrix-only-cloud.test.ts`
- Modify: `components/geo-article-editor-view.tsx`
- Modify: `components/geo/article/geo-article-batch-panel.tsx`

- [ ] **Step 1: Write a failing source contract test**

Assert the article view has no `GeoLlmProviderSelect`, provider localStorage, or editable `GeoSkillToolbar`. Assert the batch panel has no direction mode, direction textarea, platform toggle, `MATRIX_PLATFORMS`, or provider prop, and renders matrix project/date/copies controls plus cloud status.

- [ ] **Step 2: Run the test and verify RED**

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-matrix-only-cloud.test.ts
```

Expected: FAIL because the current page exposes all removed controls.

- [ ] **Step 3: Implement the matrix-only client**

Remove provider, direction, platform and manual Skill state. Derive platform ids from `selectedProject.matrix.platforms`; send `{ mode: "matrix", projectId, dates, copiesPerSlot }`. Render read-only project context using `modelSkillId`, mapped platform Skill count and `enterpriseSkillId`.

- [ ] **Step 4: Run the UI contract test**

Run the Step 2 command. Expected: PASS.

### Task 2: Enforce the matrix as server source of truth

**Files:**
- Modify: `lib/geo/article-types.ts`
- Modify: `lib/geo/article-batch-jobs.ts`
- Modify: `app/api/geo/articles/batch-generate/route.ts`
- Modify: `app/api/geo/articles/retry/route.ts`
- Test: `tests/article-batch-jobs.test.ts`
- Test: `tests/article-matrix-only-cloud.test.ts`

- [ ] **Step 1: Write failing tamper-resistance tests**

Assert `expandMatrixJobs` can derive all matrix platforms without a client platform list and that routes do not read `body.provider`, `body.platformIds`, `body.modelSkillId`, `body.viralSkillIds`, or `body.enterpriseSnapshot`.

- [ ] **Step 2: Run tests and verify RED**

Run the Task 1 command together with `tests/article-batch-jobs.test.ts`. Expected: FAIL on the current request contract.

- [ ] **Step 3: Implement server derivation**

Change matrix expansion to use `project.matrix.platforms.map(p => p.platformId)`. Batch and retry routes load the project and pass `project.modelSkillId`, `project.enterpriseSnapshot`, and `viralSkillIdsForPlatforms([job.platformId])` into generation. Reject direction jobs and missing projects before model calls.

- [ ] **Step 4: Run tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 3: Add cloud-only article completion with billing preservation

**Files:**
- Create: `lib/geo/article-cloud-completion.ts`
- Modify: `lib/geo/article-generate.ts`
- Modify: `lib/geo/llm/router.ts`
- Modify: `app/api/geo/articles/batch-generate/route.ts`
- Modify: `app/api/geo/articles/retry/route.ts`
- Modify: `app/api/geo/articles/score/route.ts`
- Test: `tests/article-matrix-only-cloud.test.ts`

- [ ] **Step 1: Write failing cloud failover tests**

Provide two cloud candidates where the first returns HTTP 500 and the second returns valid content. Assert the second result is used and the successful completion triggers exactly one billing settlement. For scoring, make the first response invalid JSON and the second valid JSON.

- [ ] **Step 2: Run the tests and verify RED**

Run the Task 1 command. Expected: FAIL because article routes still accept a user provider and call the environment router.

- [ ] **Step 3: Implement the cloud completion boundary**

Filter `listCopywritingProviderCandidates({ hasImages: false })` to `source === "cloud"`. Call `completeCloudCopywritingText` with ordered candidates and an optional validator. After successful article text, call the existing GEO article billing settlement once with the actual cloud model identifier. Return structured 503/502 errors when candidates are absent/exhausted.

- [ ] **Step 4: Run the cloud tests and verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 4: Regression verification

**Files:**
- Test: `tests/article-matrix-only-cloud.test.ts`
- Test: `tests/article-batch-jobs.test.ts`
- Test: `tests/article-format.test.ts`
- Test: `tests/article-prompt.test.ts`
- Test: `tests/article-structure.test.ts`

- [ ] **Step 1: Run focused tests**

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-matrix-only-cloud.test.ts tests/article-batch-jobs.test.ts tests/article-format.test.ts tests/article-prompt.test.ts tests/article-structure.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run type and production checks**

```powershell
npx tsc --noEmit
pnpm build
```

Expected: both commands exit 0.

- [ ] **Step 3: Review scoped diff**

Confirm no provider selector, manual platform picker, direction mode or client-controlled Skill field remains in the article workflow; confirm unrelated dirty-worktree changes were not staged.

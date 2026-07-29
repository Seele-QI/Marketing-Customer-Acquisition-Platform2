# Content Matrix Cloud UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved A layout for content-matrix configuration, remove client model selection, and route every matrix completion through cloud-distributed providers with ordered failover.

**Architecture:** The React view owns platforms and content-skill choices only. The generate route loads cloud candidates, injects a validated completion function into the matrix generator, and persists `cloud-managed` only as a legacy compatibility value. The generator rejects incomplete platform output instead of converting total provider failure into a successful placeholder matrix.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner, existing GEO prompt parsers, existing cloud provider synchronization.

---

### Task 1: Lock the approved UI and request contract with failing tests

**Files:**
- Create: `tests/content-matrix-cloud-ui.test.ts`
- Modify: `tests/matrix-api-timeout.test.ts`

- [ ] **Step 1: Write the UI source contract test**

Assert that `GeoMatrixConfigPanel` contains `云端智能调度`, `内容策略（按需选择）`, the dynamic expected-count expression, and no `GeoLlmProviderSelect`. Assert that `GeoContentMatrixView` has no `provider` state or generated request field.

- [ ] **Step 2: Write the API source contract test**

Assert that the generate route filters `candidate.source === "cloud"`, declares `CLOUD_MODEL_NOT_READY` and `CLOUD_MODEL_UNAVAILABLE`, never reads `body.provider`, and persists `provider: "cloud-managed"`.

- [ ] **Step 3: Run the tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/content-matrix-cloud-ui.test.ts
```

Expected: FAIL because the current UI still imports the model selector and the route still reads `body.provider`.

### Task 2: Add validated cloud failover and reject incomplete matrices

**Files:**
- Modify: `lib/geo/cloud-copywriting-completion.ts`
- Modify: `lib/geo/matrix-generate.ts`
- Create: `tests/matrix-cloud-generation.test.ts`

- [ ] **Step 1: Write a failing validator failover test**

Call `completeCloudCopywritingText` with two candidates and `validateText`. Return invalid JSON from the first candidate and valid JSON from the second; assert the second candidate is selected.

- [ ] **Step 2: Write a failing incomplete-matrix test**

Inject a completion function into `generateMatrixConcurrent` that always throws. Assert generation rejects instead of returning fourteen placeholder cells.

- [ ] **Step 3: Run the tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/matrix-cloud-generation.test.ts
```

Expected: FAIL because the cloud helper has no validator and the generator requires a client provider while swallowing failures.

- [ ] **Step 4: Implement the minimal completion boundary**

Add optional `validateText(text)` to `completeCloudCopywritingText`. A non-empty response that fails validation is recorded as a recoverable failure and the next cloud candidate is attempted.

Replace `GenerateMatrixParams.provider` with a required injected function:

```ts
export type MatrixTextCompletion = (input: {
  system: string
  user: string
  maxTokens: number
  validateText: (text: string) => boolean
}) => Promise<string>
```

Use prompt parsers as validators. After the main and fill calls, recompute missing dates; if any remain, throw the last completion error or `MATRIX_PLATFORM_INCOMPLETE`.

- [ ] **Step 5: Run the tests and verify GREEN**

Run the command from Step 3. Expected: all tests PASS.

### Task 3: Route matrix generation exclusively through cloud providers

**Files:**
- Modify: `app/api/geo/matrix-projects/[id]/generate/route.ts`
- Modify: `lib/geo/matrix-types.ts`
- Test: `tests/content-matrix-cloud-ui.test.ts`

- [ ] **Step 1: Load only cloud candidates before billing**

Use `listCopywritingProviderCandidates({ hasImages: false })` and filter `source === "cloud"`. Return a structured 503 response before charging if the list is empty.

- [ ] **Step 2: Inject ordered failover**

Build a completion function that calls `completeCloudCopywritingText` with the fixed cloud candidates and each call's parser validator. If all candidates fail, throw an error with `statusCode: 502`, `code: "CLOUD_MODEL_UNAVAILABLE"`, and sanitized failures.

- [ ] **Step 3: Remove the request provider contract**

Delete `GenerateMatrixRequest.provider`, ignore any legacy JSON field at runtime, and save `provider: "cloud-managed"` only for database compatibility.

- [ ] **Step 4: Run the API contract test**

Run the Task 1 command. Expected: API assertions PASS while UI assertions remain RED until Task 4.

### Task 4: Implement the approved A configuration panel

**Files:**
- Modify: `components/geo/matrix/geo-matrix-config-panel.tsx`
- Modify: `components/geo-content-matrix-view.tsx`
- Modify: `components/geo/matrix/geo-matrix-grid.tsx`
- Modify: `lib/geo/matrix-api.ts`
- Test: `tests/content-matrix-cloud-ui.test.ts`

- [ ] **Step 1: Remove model-selection state and props**

Delete `GeoLlmProviderSelect`, `LlmProviderId`, `provider`, `onProviderChange`, view state synchronization, autosave payloads, and generate payloads. Preserve the existing `data-tutorial-id="geo-matrix-view"` wrapper and `parseApiErrorResponse` change already present in the dirty worktree.

- [ ] **Step 2: Build the approved information hierarchy**

Render panel header plus non-interactive cloud status, platform chips, a responsive three-control strategy grid, dynamic readiness summary, full-width generate button, and `selectedPlatforms.length * 14` expected-topic copy.

- [ ] **Step 3: Update supporting copy**

Replace references to configuring an AI engine with content strategies and automatic cloud scheduling. Do not expose model names.

- [ ] **Step 4: Stop sending provider from shared API helpers**

Remove `provider: patch.provider` from project update JSON. Update the matrix timeout fixture to match the provider-free request type.

- [ ] **Step 5: Run UI and timeout tests**

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/content-matrix-cloud-ui.test.ts tests/matrix-api-timeout.test.ts
```

Expected: all tests PASS.

### Task 5: Regression and completion verification

**Files:**
- Test: `tests/content-matrix-cloud-ui.test.ts`
- Test: `tests/matrix-cloud-generation.test.ts`
- Test: `tests/content-matrix-prompt.test.ts`
- Test: `tests/matrix-api-timeout.test.ts`
- Test: `tests/enterprise-skill-cloud-model.test.ts`

- [ ] **Step 1: Run focused regression tests**

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/content-matrix-cloud-ui.test.ts tests/matrix-cloud-generation.test.ts tests/content-matrix-prompt.test.ts tests/matrix-api-timeout.test.ts tests/enterprise-skill-cloud-model.test.ts
```

Expected: zero failures.

- [ ] **Step 2: Run TypeScript verification**

```powershell
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 3: Check scoped diffs**

Run `git diff --check` for the files in Tasks 2 through 4 and confirm the pre-existing tutorial wrapper and API error parsing edits remain intact.

- [ ] **Step 4: Commit only safe scoped changes**

Do not stage unrelated dirty-worktree files. If a touched file already contains another owner's change and cannot be cleanly staged by hunk, leave the implementation uncommitted and report that fact rather than including unrelated work.

### Task 6: Relocate platform selection and auto-load platform Skills

**Files:**
- Modify: `lib/geo/matrix-platforms.ts`
- Modify: `lib/geo/skills-registry.ts`
- Modify: `components/geo/matrix/geo-matrix-config-panel.tsx`
- Test: `tests/content-matrix-prompt.test.ts`
- Test: `tests/content-matrix-cloud-ui.test.ts`

- [ ] **Step 1: Write failing mapping and UI contract tests**

Assert that an exact platform selection maps to only those platforms' registered `viralSkillId` values. Assert that the panel contains one relocated `发布平台（多选）` control, uses `目标优化模型`, defaults through a Doubao-specific registry helper, and no longer renders a manual `平台爆款策略列表`.

- [ ] **Step 2: Run the tests and verify RED**

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/content-matrix-prompt.test.ts tests/content-matrix-cloud-ui.test.ts
```

Expected: FAIL because exact platform mapping and the Doubao default helper do not exist, and the panel still renders the old top platform row and manual platform-viral selector.

- [ ] **Step 3: Implement exact mapping and Doubao default**

Add `viralSkillIdsForPlatforms(platforms)` to return the de-duplicated mapped B-layer Skill ids in platform order. Add `getDefaultMatrixModelWeightSkill()` that returns `model-doubao`, falling back to the general default only if that registered Skill is absent.

- [ ] **Step 4: Implement the three-column interaction**

Remove the top platform-chip section. Rename the first control to `目标优化模型`. Replace the second control with `发布平台（多选）`; its menu updates both `selectedPlatforms` and the exact mapped `viralSkillIds`. Add an effect that normalizes legacy project Skill ids after loading while preserving the rule that at least one platform remains selected.

- [ ] **Step 5: Run focused and type verification**

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/content-matrix-prompt.test.ts tests/content-matrix-cloud-ui.test.ts
npx tsc --noEmit
```

Expected: all tests pass and TypeScript exits with code 0.

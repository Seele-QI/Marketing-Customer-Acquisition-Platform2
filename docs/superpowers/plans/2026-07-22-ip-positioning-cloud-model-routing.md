# IP Positioning Cloud Model Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove identity-positioning model selection and route every analysis exclusively through the default cloud-synced provider order.

**Architecture:** The browser submits only intake data and files. The API obtains cloud-only candidates from the shared copywriting router and passes them to the positioning analyzer, which uses the existing cloud completion transport while validating each response as a positioning report. Legacy client model fields are ignored.

**Tech Stack:** Next.js App Router, React, TypeScript, Node test runner.

---

### Task 1: Lock the client contract with failing tests

**Files:**
- Create: `tests/ip-positioning-cloud-model-ui.test.ts`
- Modify: `tests/ip-positioning-store.test.ts`
- Test: `tests/ip-positioning-cloud-model-ui.test.ts`

- [ ] **Step 1: Write the failing UI and request contract test**

```ts
const wizard = readFileSync("components/ip-positioning/positioning-intake-wizard.tsx", "utf8")
const page = readFileSync("components/account-positioning.tsx", "utf8")
assert.equal(wizard.includes("AiModelPicker"), false)
assert.equal(wizard.includes("useAiModels"), false)
assert.equal(page.includes("modelId:"), false)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/ip-positioning-cloud-model-ui.test.ts`

Expected: FAIL because the picker and `modelId` request field still exist.

- [ ] **Step 3: Update the store test to expect no persisted model field**

```ts
assert.equal("modelId" in defaultIpPositioningSession(), false)
```

- [ ] **Step 4: Run the focused store test to verify it fails**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/ip-positioning-store.test.ts`

Expected: FAIL because the current session still defines `modelId`.

### Task 2: Remove the browser model contract

**Files:**
- Modify: `components/ip-positioning/positioning-intake-wizard.tsx`
- Modify: `components/account-positioning.tsx`
- Modify: `lib/ip-positioning-store.ts`
- Test: `tests/ip-positioning-cloud-model-ui.test.ts`
- Test: `tests/ip-positioning-store.test.ts`

- [ ] **Step 1: Remove picker state and rendering**

Delete the `AiModelPicker`/`useAiModels` import, model filtering/effects, picker JSX, and `modelId` from `onSubmit`.

- [ ] **Step 2: Remove `modelId` from the page request**

```ts
body: JSON.stringify({ intake: payload.intake, files: payload.files })
```

- [ ] **Step 3: Remove `modelId` from the persisted session type and defaults**

Keep the storage parser structurally tolerant so old JSON remains readable, but return only current session fields.

- [ ] **Step 4: Run both client contract tests**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/ip-positioning-cloud-model-ui.test.ts tests/ip-positioning-store.test.ts`

Expected: PASS.

### Task 3: Lock cloud-only server routing with failing tests

**Files:**
- Modify: `tests/ip-positioning-route.test.ts`
- Test: `tests/ip-positioning-route.test.ts`

- [ ] **Step 1: Replace fixed-model tests with cloud routing contracts**

Verify the route source filters candidates using `candidate.source === "cloud"`, never calls `resolveIpPositioningModel(body.modelId)`, and passes no requested model to the analyzer.

- [ ] **Step 2: Add analyzer behavior tests**

Inject two candidates and a completion function. Assert that an invalid first response advances to the second response and reports the second provider model; assert an empty candidate list returns `CLOUD_MODEL_NOT_READY`.

- [ ] **Step 3: Run the focused route test to verify it fails**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/ip-positioning-route.test.ts`

Expected: FAIL because the route and analyzer still require a fixed `modelId`.

### Task 4: Implement cloud-only analysis

**Files:**
- Modify: `app/api/ai/ip-positioning/route.ts`
- Modify: `lib/ip-positioning-analyze.ts`
- Modify: `lib/ip-positioning-schema.ts`
- Test: `tests/ip-positioning-route.test.ts`

- [ ] **Step 1: Build the cloud-only candidate list in the route**

```ts
const cloudProviders = listCopywritingProviderCandidates({ hasImages: false })
  .filter((candidate) => candidate.source === "cloud")
```

Return `503` with `CLOUD_MODEL_NOT_READY` when the list is empty.

- [ ] **Step 2: Change the analyzer input boundary**

```ts
runIpPositioningAnalysis({ intake, documents, providers: cloudProviders })
```

Remove the fixed registry, DeepSeek, Ark, and Sonetto selection branches. Use the shared cloud completion transport for each provider candidate and validate returned JSON before accepting it.

- [ ] **Step 3: Remove fixed positioning model resolvers**

Delete `resolveIpPositioningModel`, `listIpPositioningFailoverModels`, and their environment/model-registry dependencies from `lib/ip-positioning-schema.ts`.

- [ ] **Step 4: Run the focused route test**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/ip-positioning-route.test.ts`

Expected: PASS.

### Task 5: Verify the complete change

**Files:**
- Test: `tests/ip-positioning-cloud-model-ui.test.ts`
- Test: `tests/ip-positioning-store.test.ts`
- Test: `tests/ip-positioning-route.test.ts`

- [ ] **Step 1: Run focused tests**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/ip-positioning-cloud-model-ui.test.ts tests/ip-positioning-store.test.ts tests/ip-positioning-route.test.ts`

Expected: all focused tests pass.

- [ ] **Step 2: Run TypeScript validation**

Run: `npx tsc --noEmit`

Expected: exit code 0.

- [ ] **Step 3: Inspect the scoped diff**

Run: `git diff --check -- components/account-positioning.tsx components/ip-positioning/positioning-intake-wizard.tsx app/api/ai/ip-positioning/route.ts lib/ip-positioning-analyze.ts lib/ip-positioning-schema.ts lib/ip-positioning-store.ts tests/ip-positioning-cloud-model-ui.test.ts tests/ip-positioning-route.test.ts tests/ip-positioning-store.test.ts`

Expected: no whitespace errors.


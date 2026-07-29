# Image Workbench Output Count Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow each image workbench mode to generate 1–4 images, charge 20 credits per requested image, and render the returned candidates cleanly.

**Architecture:** Extend the shared request contract with an `ImageOutputCount` type, pass the selected count through both panels and the prompt composer, and validate it again in Next.js and FastAPI. Move image generation charging from fixed-scene charging to the existing server-authoritative billing registry so one atomic event charges `count × 20`.

**Tech Stack:** Next.js App Router, React, TypeScript, FastAPI, Pydantic, Python asyncio, Node test runner, pytest.

---

### Task 1: Shared count contract and client request

**Files:**
- Modify: `lib/image-workbench/types.ts`
- Modify: `lib/image-workbench/api.ts`
- Test: `tests/image-workbench-types.test.ts`
- Test: `tests/image-workbench-api.test.ts`

- [ ] **Step 1: Write failing parser and request tests**

Add assertions that `count` accepts the integers 1–4, rejects 0, 5, 1.5 and `"2"`, and that `submitImageWorkbenchTask({ count: 4 })` serializes `"count":4`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-types.test.ts tests/image-workbench-api.test.ts
```

Expected: failures show that the type/parser and client still force `count: 2`.

- [ ] **Step 3: Implement the minimal shared contract**

Add:

```ts
export const IMAGE_OUTPUT_COUNTS = [1, 2, 3, 4] as const
export type ImageOutputCount = (typeof IMAGE_OUTPUT_COUNTS)[number]
```

Change the request and submit input count fields to `ImageOutputCount`, validate with `Number.isInteger` plus the allowlist, return the parsed value, and serialize `input.count`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests pass.

### Task 2: Atomic count-based billing

**Files:**
- Modify: `lib/credit-pricing/registry.ts`
- Modify: `lib/credit_pricing.py`
- Modify: `app/api/image-workbench/generate/route.ts`
- Test: `tests/credit-pricing.test.ts`
- Test: `tests/test_credit_pricing.py`
- Test: `tests/image-workbench-route.test.ts`

- [ ] **Step 1: Write failing billing tests**

Add tests for:

```ts
resolveBillingCost("image.poster_output", { count: 4 }).cost === 80
resolveBillingCost("image.creation_output", { count: 3 }).cost === 60
```

Mirror the same cases in Python and assert both registries reject count 0, 5, a fractional number, and a string. Update the route contract test to require `chargeBillingEvent`, the selected billing key, and `{ count: parsed.count }`.

- [ ] **Step 2: Run billing tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/credit-pricing.test.ts tests/image-workbench-route.test.ts
python -m pytest tests/test_credit_pricing.py -q
```

Expected: unknown billing keys and old fixed charging cause failures.

- [ ] **Step 3: Implement server-authoritative pricing**

Add the billing keys `image.poster_output` and `image.creation_output`. Resolve each to the existing scenes `poster_image` and `image_creation`, validate count as an integer from 1–4, and return `20 * count`. Update the Next.js route to call:

```ts
await chargeBillingEvent({
  cookieHeader,
  billingKey,
  params: { count: parsed.count },
  refId,
})
```

Keep `chargeErrorResponse` and the independent scene consistency guard.

- [ ] **Step 4: Run billing tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests pass.

### Task 3: FastAPI generation count and partial success

**Files:**
- Modify: `main.py`
- Test: `tests/test_image_workbench.py`

- [ ] **Step 1: Write failing API and pipeline tests**

Add request tests for counts 1 and 4, rejection tests for 0 and 5, a pipeline assertion that count 3 submits three candidate jobs, and a partial result assertion containing `已生成 2/3 张`.

- [ ] **Step 2: Run the focused Python test and verify RED**

Run:

```powershell
python -m pytest tests/test_image_workbench.py -q
```

Expected: requests other than 2 are rejected and stage/warning copy remains fixed.

- [ ] **Step 3: Implement dynamic pipeline behavior**

Validate `1 <= req.count <= 4`, store `req.count`, generate `range(1, count + 1)`, and set:

```py
stored["stage_label"] = f"正在生成 {stored['count']} 张候选图"
warning = f"已生成 {len(image_urls)}/{stored['count']} 张，其余图片生成失败，可重新生成。"
```

Do not expose upstream provider messages.

- [ ] **Step 4: Run the focused Python test and verify GREEN**

Run the command from Step 2. Expected: all selected tests pass.

### Task 4: Count selector, per-mode state, price display, and responsive results

**Files:**
- Create: `components/image-workbench/image-output-count-selector.tsx`
- Modify: `components/image-workbench/panel-contract.ts`
- Modify: `components/image-workbench/poster-creation-panel.tsx`
- Modify: `components/image-workbench/image-creation-panel.tsx`
- Modify: `components/image-workbench/image-workbench.tsx`
- Modify: `components/image-workbench/image-prompt-composer.tsx`
- Modify: `components/image-workbench/image-result-canvas.tsx`
- Test: `tests/image-workbench-ui.test.ts`
- Test: `tests/image-workbench-professional-ui.test.ts`

- [ ] **Step 1: Write failing UI contract tests**

Require a shared selector with all four options, both panel drafts to carry `count`, the composer to render dynamic `生成 {count} 张` and `{count * 20} 积分`, dynamic progress copy, and result-grid classes that support one to four images.

- [ ] **Step 2: Run UI tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-ui.test.ts tests/image-workbench-professional-ui.test.ts
```

Expected: failures identify fixed two-image strings and missing selector/state.

- [ ] **Step 3: Implement the selector and state flow**

Create a compact segmented selector using `IMAGE_OUTPUT_COUNTS`. Add independent `count` state initialized to 2 inside each panel; include it in `SubmitImageWorkbenchInput` and the panel draft. Pass count into the composer and calculate:

```ts
const totalCost = count * 20
```

Use the requested count in progress and empty-state copy. Render one result as a centered single image and two to four results in a two-column desktop grid with a single mobile column.

- [ ] **Step 4: Run UI tests and verify GREEN**

Run the command from Step 2. Expected: all selected tests pass.

### Task 5: Integrated verification and delivery

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update the operational contract**

Document that both image modes support 1–4 outputs and charge 20 credits per output through count-based billing.

- [ ] **Step 2: Run the complete related verification**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-types.test.ts tests/image-workbench-api.test.ts tests/image-workbench-route.test.ts tests/image-workbench-ui.test.ts tests/image-workbench-professional-ui.test.ts tests/credit-pricing.test.ts tests/with-auth-service-errors.test.ts
python -m pytest tests/test_image_workbench.py tests/test_credit_pricing.py tests/test_api_auth.py -q --disable-warnings
npx tsc --noEmit
```

Expected: all commands exit 0.

- [ ] **Step 3: Perform browser layout verification**

Start the local application and verify desktop and mobile widths. Confirm the selected count remains isolated per mode, button quantity/price updates, 1–4 result layouts remain usable, no provider name is visible, and no real generation request is submitted.

- [ ] **Step 4: Commit the implementation**

```powershell
git add -- AGENTS.md main.py app/api/image-workbench/generate/route.ts components/image-workbench lib/image-workbench lib/credit-pricing/registry.ts lib/credit_pricing.py tests/image-workbench-api.test.ts tests/image-workbench-professional-ui.test.ts tests/image-workbench-route.test.ts tests/image-workbench-types.test.ts tests/image-workbench-ui.test.ts tests/credit-pricing.test.ts tests/test_credit_pricing.py tests/test_image_workbench.py
git commit -m "feat: customize image generation count"
```


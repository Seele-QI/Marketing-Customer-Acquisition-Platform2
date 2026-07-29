# Business Task Credit Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace user-visible per-call credit rows with accurate task-level bills for digital-human video and GEO generation while retaining every raw ledger row for balance, idempotency, and audit.

**Architecture:** Extend each raw `credit_ledger` row with an optional validated business-task context. Keep raw ledger APIs internal, derive display entries by grouping supported task rows at read time, and pass one stable task ID through video/GEO billing calls. The UI consumes only the derived display ledger.

**Tech Stack:** FastAPI, Python 3, SQLite, Next.js App Router, TypeScript, React, pytest, node:test.

---

## File structure

- `lib/credit.py`: schema migration, raw-row writes, task-ledger aggregation.
- `lib/api_auth.py`: validate and propagate task billing context through fixed and registry pricing.
- `lib/cloud_client.py`, `main.py`, `lib/api/with-auth.ts`, `lib/api/charge-billing.ts`: transport optional task context across Next/FastAPI/cloud boundaries.
- `routes/dh_video_v2_routes.py`, `routes/dh_video_economy_routes.py`: attach video task and stage metadata.
- `lib/dh-video-v2/types.ts`, `components/dh-video-v2-workflow.tsx`, `lib/dh-video-economy/api.ts`: create and forward stable client workflow IDs where a plan call precedes video submission.
- `lib/geo/llm/router.ts`, `lib/geo/article-generate.ts`, GEO route handlers: attach batch/run IDs to complete GEO jobs.
- `lib/credit-types.ts`, `components/credit-recharge-view.tsx`: render task bills and stage breakdowns.
- `tests/test_credit.py`, `tests/test_api_auth.py`, TypeScript route/UI tests: regression coverage.

### Task 1: Add task-aware raw ledger fields and display aggregation

**Files:**
- Modify: `lib/credit.py`
- Modify: `resources/scripts/init_credit_db.py`
- Modify: `main.py`
- Test: `tests/test_credit.py`

- [ ] **Step 1: Write failing aggregation and migration tests**

Add tests that create two task rows and one hidden chat row, then assert only one aggregated task bill is returned:

```python
credit.consume(uid, 20, ref_id="plan", note="口播文案", business_task_id="video-1", business_type="video_digital_human", billing_stage="script")
credit.consume(uid, 900, ref_id="video", note="视频生成", business_task_id="video-1", business_type="video_digital_human", billing_stage="video_generation")
credit.consume(uid, 3, ref_id="chat", note="聊天")
items = credit.list_display_ledger(uid, 20)
assert len([item for item in items if item["entry_kind"] == "business_task"]) == 1
assert items[0]["delta"] == -920
assert items[0]["breakdown"] == [
    {"stage": "script", "label": "口播文案", "amount": 20},
    {"stage": "video_generation", "label": "视频生成", "amount": 900},
]
```

Also test different task IDs stay separate, visible recharge/refund rows survive, old ungrouped consumes are hidden, and a database without the three new columns is migrated idempotently.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `python -m pytest tests/test_credit.py -q`

Expected: FAIL because `consume` does not accept task context and `list_display_ledger` does not exist.

- [ ] **Step 3: Implement schema migration and raw writes**

Add constants and validated task fields:

```python
BUSINESS_TYPE_LABELS = {
    "video_digital_human": "数字人视频创作",
    "geo_article_batch": "GEO 文章批量生成",
    "geo_matrix": "GEO 内容矩阵生成",
    "geo_enterprise_skill": "GEO 企业知识技能生成",
}
BILLING_STAGE_LABELS = {
    "script": "口播文案",
    "voice_clone": "音色克隆",
    "video_generation": "视频生成",
    "video_retry": "视频重试",
    "llm_generation": "内容生成",
}
```

`ensure_credit_schema()` and `migrate()` must add nullable `business_task_id`, `business_type`, and `billing_stage` columns when absent and create `idx_ledger_user_business_task` on `(user_id, business_type, business_task_id, created_at)`.

Extend `consume()` with keyword-only task context and insert all three values in the same transaction as the debit.

- [ ] **Step 4: Implement read-time aggregation**

Create `list_display_ledger(user_id, limit)` that scans raw rows newest-first in bounded batches, groups supported task rows by `(business_type, business_task_id)`, hides ungrouped consumes, preserves non-consume rows, nets task refunds, assigns the last row balance, and returns at most `limit` display entries. Business rows use a stable synthetic string ID such as `task:video_digital_human:video-1` and expose `entry_kind`, `breakdown`, `business_type`, and `business_task_id`.

- [ ] **Step 5: Wire the public endpoint and verify GREEN**

Change `/api/credit/ledger` to call `list_display_ledger`. Run:

`python -m pytest tests/test_credit.py tests/test_api_auth.py -q`

Expected: PASS.

### Task 2: Carry validated task context through all billing transports

**Files:**
- Modify: `lib/api_auth.py`
- Modify: `lib/cloud_client.py`
- Modify: `main.py`
- Modify: `lib/api/with-auth.ts`
- Modify: `lib/api/charge-billing.ts`
- Test: `tests/test_api_auth.py`
- Test: `tests/with-auth-service-errors.test.ts`

- [ ] **Step 1: Write failing validation and propagation tests**

Assert supported contexts reach raw rows, blank context remains backward compatible, unsupported business types/stages return HTTP 400, and Next helpers serialize:

```json
{
  "business_task_id": "video-1",
  "business_type": "video_digital_human",
  "billing_stage": "script"
}
```

- [ ] **Step 2: Run tests and verify RED**

Run: `python -m pytest tests/test_api_auth.py -q`

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/with-auth-service-errors.test.ts`

Expected: FAIL because task context parameters are not accepted or serialized.

- [ ] **Step 3: Implement the server contract**

Define an optional context shape on `CreditConsumeRequest`, `CreditBillingRequest`, and `CreditMeteredRequest`. Add a validator in `lib/api_auth.py` that enforces a 1-120 character task ID plus the controlled type/stage sets, then propagate it through `consume_with_idempotency`, `consume_billing_event`, `consume_ai_llm`, video helpers, local `consume`, and hybrid `consume_remote`.

- [ ] **Step 4: Implement the Next transport contract**

Add this reusable TypeScript type and optional property to fixed, registry, and metered helpers:

```ts
export type BusinessTaskBilling = {
  businessTaskId: string
  businessType: "video_digital_human" | "geo_article_batch" | "geo_matrix" | "geo_enterprise_skill"
  billingStage: "script" | "voice_clone" | "video_generation" | "video_retry" | "llm_generation"
}
```

Map camelCase helper fields to the server snake_case JSON fields.

- [ ] **Step 5: Run focused suites and verify GREEN**

Run both commands from Step 2. Expected: PASS.

### Task 3: Group digital-human video billing

**Files:**
- Modify: `app/api/dh-video-v2/plan-script/route.ts`
- Modify: `lib/dh-video-v2/types.ts`
- Modify: `components/dh-video-v2-workflow.tsx`
- Modify: `routes/dh_video_v2_routes.py`
- Modify: `routes/dh_video_economy_routes.py`
- Modify: `lib/dh-video-economy/api.ts`
- Modify: `components/dh-video-economy-workflow.tsx`
- Test: `tests/dh-v2-plan-script-ai.test.ts`
- Test: `tests/test_api_auth.py`
- Test: `tests/test_dh_video_economy_routes.py`

- [ ] **Step 1: Write failing video grouping tests**

Require `business_task_id` on v2 plan requests, assert plan billing uses stage `script`, submit billing uses `video_generation`, retries use `video_retry`, and economy clone/segments/retries all use the server task ID with `voice_clone`, `video_generation`, and `video_retry`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/dh-v2-plan-script-ai.test.ts`

Run: `python -m pytest tests/test_dh_video_economy_routes.py tests/test_api_auth.py -q`

Expected: FAIL on missing context.

- [ ] **Step 3: Implement v2 stable workflow IDs**

Create one client workflow ID before plan generation, store it in component state/draft for the current creation, send it as `business_task_id` in `DhV2PlanScriptRequest`, and reuse it as `client_task_id` in `DhVideoV2SubmitPayload`. The FastAPI route uses `client_task_id` when present, otherwise its new server task ID, for all segment and retry billing.

- [ ] **Step 4: Implement economy grouping**

The economy server already creates its task before charging. Attach the same `task_id` and `video_digital_human` type to clone, segment, and retry debits. No client-generated ID is needed unless submission gains a separately billed pre-step.

- [ ] **Step 5: Verify GREEN**

Run both commands from Step 2. Expected: PASS.

### Task 4: Group GEO billing by complete generation job

**Files:**
- Modify: `lib/geo/llm/router.ts`
- Modify: `lib/geo/article-generate.ts`
- Modify: `app/api/geo/matrix-projects/[id]/generate/route.ts`
- Modify: `app/api/geo/enterprise-skill/generate/route.ts`
- Test: `tests/matrix-cloud-generation.test.ts`
- Test: `tests/enterprise-skill-cloud-model.test.ts`
- Test: `tests/enterprise-skill-contact-route.test.ts`
- Create: `tests/credit-business-task-routing.test.ts`

- [ ] **Step 1: Write failing source-contract tests**

Assert article billing carries `geo_article_batch` with the batch ID, a matrix request creates one run ID and uses `geo_matrix`, and an enterprise-skill request creates one run ID and uses `geo_enterprise_skill`; all use stage `llm_generation`.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/credit-business-task-routing.test.ts tests/matrix-cloud-generation.test.ts tests/enterprise-skill-cloud-model.test.ts`

Expected: FAIL because task billing context is absent.

- [ ] **Step 3: Implement GEO context propagation**

Extend `CompleteTextBilling` with `businessTask`; make `billingFor()` use `batchId` as the task ID; pass the context into `chargeBillingEvent`. Matrix and enterprise-skill routes generate a UUID once per request, use it in their idempotency ref, and pass the matching business type and `llm_generation` stage.

- [ ] **Step 4: Verify GREEN**

Run the Step 2 command. Expected: PASS.

### Task 5: Render task bills and complete verification

**Files:**
- Modify: `lib/credit-types.ts`
- Modify: `components/credit-recharge-view.tsx`
- Create: `tests/credit-recharge-task-ledger.test.ts`

- [ ] **Step 1: Write the failing presentation test**

Assert the component source uses “最近任务账单”, explains that complete tasks are aggregated and small model calls are hidden, maps the four business type labels, and renders `breakdown` without exposing `ref_id` for task rows.

- [ ] **Step 2: Run the test and verify RED**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/credit-recharge-task-ledger.test.ts`

Expected: FAIL on the old “最近积分流水” copy and missing task fields.

- [ ] **Step 3: Implement types and UI**

Extend `LedgerItem` with:

```ts
entry_kind?: "ledger" | "business_task"
business_type?: string
business_task_id?: string
breakdown?: Array<{ stage: string; label: string; amount: number }>
```

Render task names through a controlled label map, show the net delta and ending balance, and join breakdown entries as `口播文案 20 + 视频生成 900，共 920 积分`. Keep existing inflow/refund rows unchanged.

- [ ] **Step 4: Run focused and full verification**

Run:

```powershell
python -m pytest tests/test_credit.py tests/test_api_auth.py tests/test_dh_video_economy_routes.py -q
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/credit-recharge-task-ledger.test.ts tests/credit-business-task-routing.test.ts tests/with-auth-service-errors.test.ts tests/dh-v2-plan-script-ai.test.ts tests/matrix-cloud-generation.test.ts tests/enterprise-skill-cloud-model.test.ts
npx tsc --noEmit
git diff --check
```

Expected: all tests pass, TypeScript exits 0, and `git diff --check` reports no errors.

- [ ] **Step 5: Browser-level acceptance**

Start the available local services, open the recharge page with seeded grouped and hidden ledger rows, and verify one video task row, one GEO task row, visible recharge, hidden chat/extract rows, readable breakdown, and correct ending balances. If a real external video/GEO task is not executed, report browser verification as seeded-data UI validation rather than production end-to-end validation.

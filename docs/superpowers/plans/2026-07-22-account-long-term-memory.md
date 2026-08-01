# Account-Level Long-Term Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an account-scoped cloud long-term memory system that continuously learns non-sensitive user facts and preferences, retrieves only task-relevant memories, and gives users full visibility and control.

**Architecture:** FastAPI and the shared account SQLite database own an atomic memory ledger, observation queue, consolidation rules, retrieval, and account isolation. Next.js orchestrates cloud-model extraction and injects server-retrieved memory into chat; the browser only observes user turns, renders sync state, and keeps a non-authoritative cache. The first release uses structured keys and lightweight full-text scoring, not a vector database.

**Tech Stack:** Next.js App Router, React, TypeScript, FastAPI, Python, SQLite/WAL, OpenAI-compatible cloud providers, SSE, node:test, pytest, Playwright.

**Design baseline:** `docs/superpowers/specs/2026-07-22-account-long-term-memory-design.md`

---

### Task 1: Atomic memory ledger and observation storage

**Files:**
- Create: `lib/user_memory_store.py`
- Create: `tests/test_user_memory_store.py`

- [ ] **Step 1: Write failing schema, isolation, and idempotency tests**

Create tests using a temporary `CREDIT_DB_OVERRIDE` database. Assert that:

```python
claim = store.observe_user_message(
    user_id=1,
    scope="copywriting",
    session_id="session-a",
    message_id="message-a",
    text="我是做装修设计的",
)
duplicate = store.observe_user_message(
    user_id=1,
    scope="copywriting",
    session_id="session-a",
    message_id="message-a",
    text="我是做装修设计的",
)
assert claim.observation_id == duplicate.observation_id
assert store.list_items(user_id=2) == []
```

Also assert partial uniqueness for one active `(user_id, scope, category, memory_key)`, append-only events, optimistic `revision` checks, and deleted-item exclusion.

- [ ] **Step 2: Run the store tests and verify RED**

Run:

```powershell
python -m pytest tests/test_user_memory_store.py -q
```

Expected: failure because `lib.user_memory_store` does not exist.

- [ ] **Step 3: Implement schema creation and store APIs**

Implement `ensure_memory_schema()` with `CREATE TABLE IF NOT EXISTS` for:

```text
user_memory_items
user_memory_events
user_memory_observations
user_memory_settings
```

Expose typed store operations:

```python
observe_user_message(...)
claim_observation_batch(...)
complete_observations(...)
fail_observations(...)
get_active_item(...)
insert_item(...)
reinforce_item(...)
supersede_item(...)
list_items(...)
get_summary(...)
update_item(...)
set_item_status(...)
clear_items(...)
list_events(...)
get_settings(...)
update_settings(...)
mark_legacy_imported(...)
```

All queries must include `user_id`; mutations use `BEGIN IMMEDIATE`; `update_item` requires the caller's expected `revision` and raises a typed conflict when stale.

- [ ] **Step 4: Run the store tests and verify GREEN**

Run `python -m pytest tests/test_user_memory_store.py -q`.

Expected: all store tests pass.

- [ ] **Step 5: Commit the isolated store task**

```powershell
git add -- lib/user_memory_store.py tests/test_user_memory_store.py
git commit -m "feat(memory): add account-scoped memory ledger"
```

### Task 2: Consolidation, sensitive filtering, conflict resolution, and retrieval

**Files:**
- Create: `lib/user_memory_service.py`
- Create: `tests/test_user_memory_service.py`

- [ ] **Step 1: Write failing business-rule tests**

Cover these exact behaviors:

```python
service.consolidate(user_id=1, candidates=[industry_candidate("装修设计")])
service.consolidate(user_id=1, candidates=[industry_candidate("装修设计")])
assert active_item.strength > initial_strength

service.consolidate(user_id=1, candidates=[industry_candidate("家装培训")])
assert current.value_json == "家装培训"
assert old.status == "superseded"
```

Add tests that manual edits resist low-confidence replacement, phone numbers/API keys are rejected before persistence, temporary requests return `ignore`, preferences decay without deletion, global and current-module scopes are retrieved, other modules are excluded, constraints rank above preferences, and output respects maximum item/character budgets.

- [ ] **Step 2: Run the service tests and verify RED**

Run `python -m pytest tests/test_user_memory_service.py -q`.

Expected: failure because `lib.user_memory_service` does not exist.

- [ ] **Step 3: Implement deterministic service rules**

Define validated candidate operations:

```python
@dataclass(frozen=True)
class MemoryCandidate:
    operation: Literal["create", "reinforce", "supersede", "ignore"]
    scope: str
    category: str
    memory_key: str
    value: object
    confidence: float
    stable: bool
    evidence: str
```

Implement:

```python
sanitize_sensitive_text(text) -> SanitizationResult
normalize_memory_value(category, key, value) -> str
consolidate_candidates(user_id, observation_ids, candidates) -> ConsolidationResult
retrieve_relevant_memories(user_id, scope, query, max_items=12, max_chars=3000)
build_memory_context(items) -> str
```

Reject secrets and full contact/payment/identity values before writing content or excerpts. Use structured category/key matching plus normalized token overlap, manual priority, constraint priority, strength, and confirmation recency. Never return non-active rows.

- [ ] **Step 4: Run the service tests and verify GREEN**

Run `python -m pytest tests/test_user_memory_service.py -q`.

Expected: all service tests pass.

- [ ] **Step 5: Commit the service task**

```powershell
git add -- lib/user_memory_service.py tests/test_user_memory_service.py
git commit -m "feat(memory): add consolidation and relevant retrieval"
```

### Task 3: Authenticated FastAPI memory API

**Files:**
- Create: `routes/user_memory_routes.py`
- Modify: `main.py`
- Create: `tests/test_user_memory_routes.py`

- [ ] **Step 1: Write failing route tests**

Using the existing authenticated test setup, cover:

```text
POST   /api/memory/observe
POST   /api/memory/consolidate
POST   /api/memory/retrieve
GET    /api/memory/summary
GET    /api/memory/items
PATCH  /api/memory/items/{id}
POST   /api/memory/items/{id}/disable
POST   /api/memory/items/{id}/restore
DELETE /api/memory/items/{id}
POST   /api/memory/clear
GET    /api/memory/events
GET    /api/memory/settings
PATCH  /api/memory/settings
POST   /api/memory/import-legacy
```

Assert 401 for no session, no `user_id` request field, cross-account IDs return 404, stale revisions return `409 MEMORY_REVISION_CONFLICT`, duplicate legacy imports are no-ops, and error payloads never contain memory text.

- [ ] **Step 2: Run route tests and verify RED**

Run `python -m pytest tests/test_user_memory_routes.py -q`.

Expected: route-not-found failures.

- [ ] **Step 3: Implement the router and mount it**

Use `get_current_user(request)` for every public route. Define Pydantic request models with explicit length, enum, list-size, and numeric bounds. Keep consolidation and retrieval server-only by requiring the existing internal metered key header in addition to the authenticated user context, while browser-facing CRUD relies on the session cookie.

Mount with:

```python
from routes.user_memory_routes import router as user_memory_router
app.include_router(user_memory_router)
```

- [ ] **Step 4: Run route, auth, and store tests**

Run:

```powershell
python -m pytest tests/test_user_memory_routes.py tests/test_user_memory_store.py tests/test_user_memory_service.py tests/test_api_auth.py -q
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit the FastAPI API task**

```powershell
git add -- routes/user_memory_routes.py main.py tests/test_user_memory_routes.py
git commit -m "feat(memory): expose authenticated cloud memory API"
```

### Task 4: Cloud-model extraction orchestration without user billing

**Files:**
- Create: `lib/llm/memory-extractor.ts`
- Modify: `app/api/ai/memory-extract/route.ts`
- Create: `tests/memory-extract-route.test.ts`

- [ ] **Step 1: Write failing extraction tests**

Test that the route:

- sends only user-authored text to extraction;
- accepts the cloud observation claim before calling the LLM;
- skips the model when the server returns no claimed observations;
- uses synced cloud providers in priority order and fails over before a response;
- requires strict JSON operations and rejects unknown fields;
- posts validated candidates to `/api/memory/consolidate`;
- records a retryable failure without exposing model output;
- never calls the credit consume endpoint.

- [ ] **Step 2: Run extraction tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/memory-extract-route.test.ts
```

Expected: failures against the legacy DeepSeek-only, user-billed route.

- [ ] **Step 3: Implement the structured extractor**

`lib/llm/memory-extractor.ts` must reuse `listCopywritingProviderCandidates({ hasImages: false })`, issue non-streaming OpenAI-compatible requests with pre-response failover, and validate this response shape:

```ts
type ExtractedMemoryOperation = {
  operation: "create" | "reinforce" | "supersede" | "ignore"
  scope: "global" | "copywriting" | "positioning" | "geo"
  category: "identity" | "business" | "goal" | "preference" | "constraint" | "fact"
  memoryKey: string
  value: string | string[]
  confidence: number
  stable: boolean
  evidence: string
}
```

Rewrite the route to call observe -> extract only claimed observations -> consolidate. Remove `chargeCredit`; return `queued`, `updated`, or a retryable status without blocking the user's main chat.

- [ ] **Step 4: Run extraction and provider tests**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/memory-extract-route.test.ts tests/copywriting-model-router.test.ts tests/ark-synced-providers.test.ts
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit the extraction task**

```powershell
git add -- lib/llm/memory-extractor.ts app/api/ai/memory-extract/route.ts tests/memory-extract-route.test.ts
git commit -m "feat(memory): extract cloud memory without user billing"
```

### Task 5: Server-side chat retrieval and memory SSE metadata

**Files:**
- Create: `lib/memory/server.ts`
- Modify: `app/api/ai/chat-stream/route.ts`
- Modify: `lib/credit/balance-sync.ts`
- Modify: `tests/chat-stream-route.test.ts`
- Create: `tests/memory-sse.test.ts`

- [ ] **Step 1: Write failing retrieval and SSE tests**

Assert that `chat-stream` calls `/api/memory/retrieve` with the authenticated cookie, `scope="copywriting"`, current agent, and user text; injects only the returned context; ignores a forged client `memoryContext`; continues when retrieval fails; and emits:

```text
event: memory
data: {"status":"loaded","count":2,"items":[...]}
```

before upstream model deltas. Add parser tests proving `memory`, `billing`, `billing_error`, ordinary deltas, and `[DONE]` coexist.

- [ ] **Step 2: Run tests and verify RED**

Run the two named node test files. Expected: forged context is still used and no memory event is surfaced.

- [ ] **Step 3: Implement trusted retrieval and compatible SSE parsing**

`lib/memory/server.ts` exposes:

```ts
retrieveServerMemory({ cookieHeader, scope, agentName, query }): Promise<MemoryRetrievalResult>
```

Change `chat-stream` so `body.memoryContext` remains in the compatibility type but is never read. Build the system prompt from server retrieval. Extend the SSE wrapper to emit sanitized memory metadata and extend `consumeBillingAwareSseStream` with an optional `onMemory` callback without changing existing callers.

- [ ] **Step 4: Run chat, SSE, billing, and type tests**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/chat-stream-route.test.ts tests/memory-sse.test.ts tests/credit-pricing.test.ts
npx tsc --noEmit
```

Expected: all tests and type checking pass.

- [ ] **Step 5: Commit the chat integration task**

```powershell
git add -- lib/memory/server.ts app/api/ai/chat-stream/route.ts lib/credit/balance-sync.ts tests/chat-stream-route.test.ts tests/memory-sse.test.ts
git commit -m "feat(memory): inject trusted relevant memory into chat"
```

### Task 6: Browser API, cache, and one-time legacy migration

**Files:**
- Create: `lib/memory/types.ts`
- Create: `lib/memory/client.ts`
- Create: `lib/memory/api-proxy.ts`
- Create: `hooks/use-user-memory.ts`
- Modify: `lib/user-memory.ts`
- Create: `app/api/memory/route.ts`
- Create: `app/api/memory/summary/route.ts`
- Create: `app/api/memory/items/[id]/route.ts`
- Create: `app/api/memory/items/[id]/status/route.ts`
- Create: `app/api/memory/settings/route.ts`
- Create: `app/api/memory/events/route.ts`
- Create: `app/api/memory/clear/route.ts`
- Create: `app/api/memory/import-legacy/route.ts`
- Create: `tests/user-memory-client.test.ts`

- [ ] **Step 1: Write failing client and migration tests**

Cover list/summary/edit/status/delete/clear APIs, refresh event delivery, stale-cache labeling, legacy `copywriting-user-memory-v1` conversion, successful import marking, duplicate import suppression, and failure preserving the legacy source for retry.

- [ ] **Step 2: Run client tests and verify RED**

Run the named node test file. Expected: modules and routes do not exist.

- [ ] **Step 3: Implement typed client and narrow proxy routes**

All proxy routes forward the session cookie to FastAPI and never accept a target `user_id`. `lib/user-memory.ts` becomes a legacy read/delete adapter only; new runtime reads come from `useUserMemory`. Store cache under `account-user-memory-cache-v1` with `syncedAt` and explicit `stale` status.

The hook exposes:

```ts
summary
items
settings
syncStatus
refresh()
updateItem(id, revision, patch)
setItemStatus(id, revision, status)
deleteItem(id, revision)
clearAll()
observeUserTurn(input)
```

- [ ] **Step 4: Run client tests and typecheck**

Run the named test and `npx tsc --noEmit`. Expected: pass.

- [ ] **Step 5: Commit the client task**

Stage only the files listed above and commit with `feat(memory): add synced memory client and legacy migration`.

### Task 7: Conversation memory indicator and full memory center

**Files:**
- Create: `components/memory/memory-indicator.tsx`
- Create: `components/memory/memory-center-dialog.tsx`
- Create: `components/memory/memory-item-row.tsx`
- Create: `components/memory/memory-settings-card.tsx`
- Modify: `components/copywriting-chat-workspace.tsx`
- Modify: `components/settings-view.tsx`
- Create: `tests/memory-ui-contract.test.ts`

- [ ] **Step 1: Write failing UI contract tests**

Assert that the copywriting workspace no longer imports local `buildMemoryContext`, observes only the user turn, renders sync states and last-used memory count, opens the memory center, and keeps the composer fixed. Assert settings renders the same memory center entry and account/module toggles.

- [ ] **Step 2: Run UI contract tests and verify RED**

Run the named node test. Expected: old local memory indicator and context submission remain.

- [ ] **Step 3: Implement the UI components**

The indicator must show `syncing`, `synced`, `stale`, `error`, and `disabled`; the expanded view has “本次使用” and “长期档案”. The dialog filters by scope/status and supports edit, pin, disable, restore, delete, and clear-all confirmation. Reuse existing dialog/button/input components and use internal `overflow-y-auto` with `min-h-0`; do not alter non-copywriting page scroll behavior.

In `handleSend`, after login and before/alongside chat, call `observeUserTurn` with `keepalive: true`; do not submit `memoryContext` to chat.

- [ ] **Step 4: Run UI tests and typecheck**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/memory-ui-contract.test.ts tests/copywriting-workspace-layout.test.ts
npx tsc --noEmit
```

Expected: all selected checks pass.

- [ ] **Step 5: Commit the UI task**

Stage only the four new memory components, the two modified views, and the UI contract test. Commit with `feat(memory): add memory center and synced indicator`.

### Task 8: Regression, builds, and real UAT

**Files:**
- Modify only if a verified defect is found by this task.

- [ ] **Step 1: Run complete memory and copywriting tests**

```powershell
python -m pytest tests/test_user_memory_store.py tests/test_user_memory_service.py tests/test_user_memory_routes.py tests/test_api_auth.py -q
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/memory-extract-route.test.ts tests/chat-stream-route.test.ts tests/memory-sse.test.ts tests/user-memory-client.test.ts tests/memory-ui-contract.test.ts tests/copywriting-model-router.test.ts tests/copywriting-workspace-layout.test.ts tests/credit-pricing.test.ts tests/sonetto-client.test.ts tests/ark-synced-providers.test.ts
npx tsc --noEmit
pnpm electron:build
pnpm build
```

Expected: zero failures and successful production/Electron builds.

- [ ] **Step 2: Run two-account API isolation UAT**

Create two disposable authenticated test users against an isolated database. Write and retrieve memories for each account, attempt cross-account item IDs, and verify 404/no leakage. Inspect logs for absence of memory text and sensitive samples.

- [ ] **Step 3: Run visible Playwright UI UAT**

At 1920×900 and 1366×768, verify:

- long conversation and long memory lists scroll internally;
- document `scrollTop` remains zero in copywriting;
- composer coordinates do not change when messages or history scroll;
- indicator states, “本次使用”, edit, disable, restore, delete, and clear-all work;
- memory center opens from both the indicator and settings;
- offline/cloud-failure state says cached/not-synced instead of success.

- [ ] **Step 4: Run cross-device synchronization UAT**

Use two browser contexts signed into the same disposable account. Create a memory from context A, refresh context B, verify the same revision appears, edit in B, and verify A refreshes to the new value. Repeat with a second account to confirm isolation.

- [ ] **Step 5: Inspect final diff and preserve unrelated work**

Run `git status --short`, `git diff --check`, and targeted diffs for every file in this plan. Do not stage or modify unrelated dirty files.

---

## Plan self-review

- Spec coverage: cloud account scope, layered scopes, extraction, filtering, conflict history, decay, retrieval, trusted injection, UI management, migration, errors, isolation, and UAT each map to an explicit task.
- Scope control: chat-history synchronization and vector search remain excluded.
- Type consistency: scopes, categories, statuses, operations, revision handling, and SSE `memory` metadata use the same names across Python, TypeScript, API, and UI tasks.
- Placeholder scan: no unresolved implementation choices remain; commands and expected outcomes are explicit.


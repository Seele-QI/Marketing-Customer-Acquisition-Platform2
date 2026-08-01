# Enterprise Department Agent Team Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing celebrity advisor cards with a production-oriented 15-role company team (one coordinator, ten departments, four industry experts) backed by cloud-routed models, scoped skills, attachments, collaboration, knowledge controls, approvals, and honest execution states.

**Architecture:** Keep the existing Next.js/FastAPI/Electron split. Add a focused TypeScript Agent Runtime for registry, prompts, routing, orchestration, and UI; add a FastAPI/SQLite store for durable runs, knowledge documents, events, and approvals. Reuse the current synced-provider failover, auth, billing, document parsing, memory, publishing, and proxy infrastructure.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.7, Zod, Node test runner, FastAPI, Pydantic, SQLite, pytest/unittest, existing cloud OpenAI-compatible providers, Sharp-generated image assets.

---

## File structure

New focused modules:

- `lib/agents/types.ts` — shared Agent Runtime contracts.
- `lib/agents/registry.ts` — 15 immutable role definitions and lookup helpers.
- `lib/agents/skills.ts` — versioned Skill catalog and role-to-Skill mapping.
- `lib/agents/prompts.ts` — role, Skill, evidence, attachment, and collaboration prompt composition.
- `lib/agents/model-router.ts` — cloud provider selection and non-stream completion.
- `lib/agents/orchestrator.ts` — deterministic task routing, bounded co-signing, synthesis, and partial-state rules.
- `lib/agents/client.ts` — browser request/response helpers.
- `lib/agents/attachments.ts` — browser attachment lifecycle and parsing helpers.
- `lib/agents/tool-registry.ts` — T0–T3 tool capability and availability registry.
- `app/api/agents/route.ts` — authenticated public role catalog.
- `app/api/agents/run/route.ts` — authenticated run endpoint.
- `app/api/agents/tools/route.ts` — safe tool availability metadata.
- `components/agents/team-agent-center.tsx` — grouped team center.
- `components/agents/collaboration-panel.tsx` — main/co-sign status and approval panel.
- `components/agents/attachment-strip.tsx` — images/documents and scope controls.
- `lib/agent_team_store.py` — durable SQLite store.
- `routes/agent_team_routes.py` — authenticated run, knowledge, event, and approval API.
- `lib/agents/api-proxy.ts` plus `app/api/agent-team/**` — Next-to-FastAPI proxy boundary.
- `public/agents/company/*.png` — generated enterprise editorial portraits.

Existing files changed in place:

- `lib/team-agents.ts` becomes a compatibility export over `lib/agents/registry.ts`.
- `components/agent-center.tsx`, `components/agent-card.tsx`, `components/dashboard-view.tsx`, `components/chat-workspace.tsx`, and `app/page.tsx` adopt the new contracts and UI.
- `lib/server/document-extract.ts` and `lib/ip-positioning-upload.ts` add XLSX/PPTX/CSV parsing support.
- `app/api/ai/chat-stream/route.ts` keeps copywriting behavior but rejects unknown team roles and no longer trusts a client model ID.
- `main.py` mounts `agent_team_router`.
- `.env.example` and `AGENTS.md` document attachment/agent limits only when a new runtime setting is introduced.

The worktree is already dirty. Before every commit, stage only task-owned paths and inspect `git diff --cached --name-only` plus `git diff --cached`; do not commit unrelated pre-existing changes.

---

### Task 1: Agent contracts and professional registry

**Files:**
- Create: `lib/agents/types.ts`
- Create: `lib/agents/registry.ts`
- Modify: `lib/team-agents.ts`
- Test: `tests/agent-registry.test.ts`

- [ ] **Step 1: Write the failing registry test**

```ts
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { AGENT_DEFINITIONS, getAgentById, getAgentByName } from "../lib/agents/registry.ts"

describe("enterprise agent registry", () => {
  it("contains one coordinator, ten departments, and four industry experts", () => {
    assert.equal(AGENT_DEFINITIONS.length, 15)
    assert.equal(AGENT_DEFINITIONS.filter((a) => a.kind === "coordinator").length, 1)
    assert.equal(AGENT_DEFINITIONS.filter((a) => a.kind === "department").length, 10)
    assert.equal(AGENT_DEFINITIONS.filter((a) => a.kind === "industry_expert").length, 4)
  })

  it("uses unique stable ids, serious names, and non-decorative availability", () => {
    assert.equal(new Set(AGENT_DEFINITIONS.map((a) => a.id)).size, 15)
    assert.equal(getAgentById("legal-compliance")?.name, "顾正")
    assert.equal(getAgentByName("纪衡")?.kind, "coordinator")
    assert.ok(AGENT_DEFINITIONS.every((a) => ["available", "needs_configuration", "unavailable", "paused"].includes(a.availability)))
    assert.ok(AGENT_DEFINITIONS.every((a) => !/芒格|巴菲特|德鲁克|纳瓦尔/.test(a.name)))
  })
})
```

- [ ] **Step 2: Run the test and confirm it fails**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/agent-registry.test.ts
```

Expected: FAIL because `lib/agents/registry.ts` does not exist.

- [ ] **Step 3: Implement typed role definitions**

Define the following stable contract in `lib/agents/types.ts`:

```ts
export type AgentKind = "coordinator" | "department" | "industry_expert"
export type AgentLevel = "O4" | "P3" | "P4"
export type AgentAvailability = "available" | "needs_configuration" | "unavailable" | "paused"
export type ToolPermission = "T0" | "T1" | "T2" | "T3"

export type AgentDefinition = {
  id: string
  version: string
  name: string
  title: string
  department: string
  group: "coordination" | "governance" | "product_technology" | "market_growth" | "delivery" | "industry"
  kind: AgentKind
  level: AgentLevel
  description: string
  avatar: string
  themeColor: string
  availability: AgentAvailability
  tags: string[]
  quickPrompts: Array<{ text: string; iconKey: string }>
  skillIds: string[]
  knowledgeScopes: string[]
  toolPermissions: Record<string, ToolPermission>
  languageStyle: string[]
  outputContract: string[]
  prohibitedActions: string[]
}
```

Populate `AGENT_DEFINITIONS` with the approved names and roles. Make `TEAM_AGENTS` a mapped compatibility export so existing page wiring compiles while consumers migrate.

- [ ] **Step 4: Run the focused test**

Expected: 2 tests pass.

- [ ] **Step 5: Stage only registry files after inspecting the diff**

```powershell
git diff -- lib/agents/types.ts lib/agents/registry.ts lib/team-agents.ts tests/agent-registry.test.ts
```

Do not commit `lib/team-agents.ts` if its staged diff includes pre-existing unrelated work; keep the implementation unstaged until final handoff.

---

### Task 2: Versioned Skill catalog and prompt contracts

**Files:**
- Create: `lib/agents/skills.ts`
- Create: `lib/agents/prompts.ts`
- Test: `tests/agent-skills.test.ts`
- Test: `tests/agent-prompts.test.ts`

- [ ] **Step 1: Write failing tests for progressive disclosure and prompt boundaries**

```ts
it("loads only skills assigned to the active role", () => {
  const legal = getSkillCatalogForAgent("legal-compliance")
  assert.deepEqual(legal.map((s) => s.id), [
    "cn-legal-research", "contract-review-cn", "privacy-impact", "ip-content-compliance",
  ])
  assert.ok(legal.every((s) => s.instructions.length > 100))
})

it("keeps legal and finance disclaimers in the system layer", () => {
  const prompt = buildAgentSystemPrompt({ agentId: "legal-compliance", activeSkillIds: ["contract-review-cn"] })
  assert.match(prompt, /工作底稿/)
  assert.match(prompt, /人工复核/)
  assert.doesNotMatch(prompt, /巴菲特|芒格/)
})
```

- [ ] **Step 2: Run both tests and confirm missing-module failures**

Run the two files with the repository Node test command.

- [ ] **Step 3: Implement the Skill catalog**

Each `SkillDefinition` must include:

```ts
type SkillDefinition = {
  id: string
  version: string
  name: string
  description: string
  instructions: string
  riskLevel: "low" | "medium" | "high"
  sourceType: "official" | "reference" | "company"
  sourceLinks: string[]
  allowedAgentIds: string[]
  requiredTools: string[]
}
```

Implement all approved role Skill IDs. Instructions must specify inputs, ordered method, output schema, evidence rules, failure behavior, and escalation boundary. Legal sources must point to official Chinese government sources; finance sources must include Ministry of Finance/internal control materials; imported public examples remain reference-only.

- [ ] **Step 4: Implement prompt composition**

`buildAgentSystemPrompt()` must combine the immutable role contract, only the active Skill instructions, explicit attachment trust boundaries, output format, and tool restrictions. Client-supplied text must never enter the system layer.

- [ ] **Step 5: Run the tests and verify pass**

Expected: exact Skill mapping, source metadata, and role boundaries pass.

---

### Task 3: Hidden cloud model routing and bounded completion

**Files:**
- Create: `lib/agents/model-router.ts`
- Modify: `lib/llm/copywriting-router.ts`
- Test: `tests/agent-model-router.test.ts`
- Update: `tests/copywriting-model-router.test.ts`

- [ ] **Step 1: Write failing tests**

Test that routing ignores a client model ID, uses cloud priority order, filters image tasks to providers that accept the request through failover, sanitizes secrets, returns a route snapshot, and stops after the configured attempt budget.

```ts
const result = await completeAgentTurn({
  messages: [{ role: "system", content: "role" }, { role: "user", content: "task" }],
  hasImages: false,
  maxAttempts: 2,
  fetchImpl,
})
assert.equal(result.ok, true)
if (result.ok) {
  assert.equal(result.route.providerName, "cloud-second")
  assert.equal(result.route.model, "model-second")
  assert.equal(result.route.source, "cloud")
}
```

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement non-stream completion over existing candidates**

Use `listCopywritingProviderCandidates()` as the only provider source. Send OpenAI-compatible `stream: false` requests with per-provider timeout and caller cancellation. Return either:

```ts
type AgentCompletionResult =
  | { ok: true; text: string; route: ModelRouteSnapshot; failures: ProviderFailure[] }
  | { ok: false; code: "MODEL_NOT_CONFIGURED" | "CLOUD_MODEL_UNAVAILABLE" | "CANCELLED"; failures: ProviderFailure[] }
```

Never return keys, raw upstream bodies, or URLs containing credentials.

- [ ] **Step 4: Run router tests**

Expected: cloud priority, failover, cancellation, attempt budget, and sanitization pass.

---

### Task 4: Real main-role and co-sign orchestration

**Files:**
- Create: `lib/agents/orchestrator.ts`
- Test: `tests/agent-orchestrator.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Cover direct legal tasks, coordinator routing, bounded co-sign count, failed co-sign partial state, and genuine conflict preservation.

```ts
const plan = planAgentCollaboration({ selectedAgentId: "chief-coordinator", prompt: "评估合作预算并审阅合同" })
assert.equal(plan.primaryAgentId, "strategy-management")
assert.deepEqual(plan.cosignerAgentIds, ["finance-control", "legal-compliance"])
assert.ok(plan.cosignerAgentIds.length <= 3)
```

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement deterministic planning and concurrent execution**

Use a reviewed keyword/risk routing table, not an unconstrained model-generated agent ID. Run primary and co-signers with `Promise.allSettled`; give each only the task summary and explicitly allowed attachment text. For multi-role work, perform one coordinator synthesis call over structured outputs.

Return:

```ts
type AgentRunResult = {
  status: "completed" | "partial" | "failed" | "cancelled"
  primary: AgentMemberResult
  cosigners: AgentMemberResult[]
  finalText: string
  conflicts: string[]
  routeSnapshots: ModelRouteSnapshot[]
  activeSkillIds: string[]
  warnings: string[]
}
```

- [ ] **Step 4: Verify error and partial-state tests pass**

No successful model call plus no usable result is `failed`; one failed required co-signer is `partial`; ordinary single-role success is `completed`.

---

### Task 5: Authenticated Agent APIs and honest billing

**Files:**
- Create: `app/api/agents/route.ts`
- Create: `app/api/agents/run/route.ts`
- Create: `lib/agents/client.ts`
- Modify: `app/api/ai/chat-stream/route.ts`
- Test: `tests/agent-run-route.test.ts`

- [ ] **Step 1: Write failing route tests**

Test missing agent, forged model ID ignored, unknown role rejected, cloud not ready, partial co-sign result, and no charge when all providers fail.

- [ ] **Step 2: Run the failing route file**

- [ ] **Step 3: Implement `GET /api/agents`**

Return only public role data: ID, name, title, department, group, level, description, avatar, availability, tags, quick prompts, Skill summaries, and tool availability. Do not return system instructions or sensitive knowledge scopes.

- [ ] **Step 4: Implement `POST /api/agents/run`**

Validate with Zod-equivalent explicit checks: `agentId`, prompt length, history count, images, extracted documents, collaboration flag, and request ID. Resolve roles and model server-side. Check estimated worst-case credits before execution, then charge only successful model calls with unique references.

- [ ] **Step 5: Keep copywriting compatibility safe**

The existing chat-stream route remains for copywriting agents. Team agents use the new run route. Unknown team names cannot silently fall back to a generic copywriting prompt.

- [ ] **Step 6: Run route and existing chat-stream tests**

Expected: new tests pass and existing copywriting routing remains green.

---

### Task 6: Images and PDF/DOCX/XLSX/PPTX/TXT/MD/CSV attachments

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `lib/ip-positioning-upload.ts`
- Modify: `lib/server/document-extract.ts`
- Create: `lib/agents/attachments.ts`
- Create: `components/agents/attachment-strip.tsx`
- Test: `tests/document-extract.test.ts`
- Test: `tests/agent-attachments.test.ts`

- [ ] **Step 1: Add direct JSZip dependency**

Run:

```powershell
pnpm add jszip@3.10.1
```

Expected: `jszip` becomes a direct dependency without changing its resolved version.

- [ ] **Step 2: Extend failing extraction tests**

Create minimal in-memory XLSX and PPTX ZIP fixtures with JSZip and assert extracted cell/slide text. Assert CSV works as UTF-8 text and `.doc` remains rejected.

- [ ] **Step 3: Implement OOXML extraction**

For XLSX, parse shared strings plus worksheet XML in sheet order and emit tab-separated rows. For PPTX, read `ppt/slides/slide*.xml` in numeric order and extract `<a:t>` text. Decode XML entities, strip control characters, cap per-file and total text, and retain the existing PDF/DOCX behavior.

- [ ] **Step 4: Implement browser attachment state**

Support six images and five documents, 20 MB per file, explicit `temporary | company | department` scope, per-file `preparing | ready | failed`, preview, removal, and abort cleanup. Only `ready` extracted text enters the request.

- [ ] **Step 5: Run extraction and attachment tests**

Expected: all supported types parse; unsupported, oversized, and corrupt files fail independently.

---

### Task 7: Durable run, knowledge, event, and approval store

**Files:**
- Create: `lib/agent_team_store.py`
- Create: `routes/agent_team_routes.py`
- Modify: `main.py`
- Test: `tests/test_agent_team_store.py`
- Test: `tests/test_agent_team_routes.py`

- [ ] **Step 1: Write failing store tests**

Tests create two users and assert strict isolation for runs, knowledge documents, events, and approvals. Test task/department/company knowledge filters, revision conflicts, expired approval, parameter-hash mismatch, and immutable execution evidence.

- [ ] **Step 2: Run focused Python tests and confirm failure**

```powershell
python -m pytest tests/test_agent_team_store.py tests/test_agent_team_routes.py -v
```

- [ ] **Step 3: Implement SQLite schema and store methods**

Create the seven tables from the design with `CREATE TABLE IF NOT EXISTS`, indexes on user/status/updated time, JSON serialization, explicit transactions, and user-scoped queries. Use FTS5 for knowledge chunks when available and a bounded `LIKE` fallback otherwise.

- [ ] **Step 4: Implement authenticated FastAPI routes**

Use `require_user(request)` for every public operation. Internal retrieval and run-event append require `X-Metered-Key`. Provide create/update/get/list for runs, knowledge import/search, event append, approval create/decide/execute-evidence, and cancellation.

- [ ] **Step 5: Mount the router and run tests**

Expected: all isolation, revision, expiry, and API-auth tests pass.

---

### Task 8: Next proxy, scoped retrieval, and resumable approvals

**Files:**
- Create: `lib/agents/api-proxy.ts`
- Create: `lib/agents/server-store.ts`
- Create: `app/api/agent-team/runs/route.ts`
- Create: `app/api/agent-team/runs/[id]/route.ts`
- Create: `app/api/agent-team/knowledge/route.ts`
- Create: `app/api/agent-team/approvals/[id]/route.ts`
- Modify: `app/api/agents/run/route.ts`
- Test: `tests/agent-team-proxy.test.ts`
- Test: `tests/agent-knowledge-retrieval.test.ts`

- [ ] **Step 1: Write failing proxy and ACL tests**

Assert cookie forwarding, internal key use only server-side, query preservation, sanitized failures, department-scope retrieval, and unavailable-store fallback.

- [ ] **Step 2: Implement proxy routes**

Follow `lib/memory/api-proxy.ts`: browser-facing routes forward cookies to the configured cloud API. Internal retrieval uses the metered key, a five-second timeout, and sanitized bounded results.

- [ ] **Step 3: Integrate knowledge into runs**

Retrieve only scopes allowed by the active primary/co-sign role and the attachment promotion decision. Add retrieved snippets as untrusted evidence blocks, never as system instructions. Persist role, Skill, model, attachment, retrieval, billing, and result events.

- [ ] **Step 4: Run proxy, retrieval, and route tests**

Expected: FastAPI outage produces an explicit `knowledge_unavailable` warning without leaking credentials.

---

### Task 9: Tool registry and approval-gated external execution

**Files:**
- Create: `lib/agents/tool-registry.ts`
- Create: `app/api/agents/tools/route.ts`
- Create: `app/api/agent-team/approvals/[id]/execute/route.ts`
- Test: `tests/agent-tool-registry.test.ts`
- Test: `tests/agent-approval-execution.test.ts`

- [ ] **Step 1: Write failing capability tests**

Assert T0/T1 automatic tools, T2 approval tools, T3 blocked tools, and honest availability states. Publishing may be `available` only when the existing service and verified account requirements can be checked; email/calendar/CRM default to `needs_configuration` until connectors exist.

- [ ] **Step 2: Implement registry and safe metadata API**

Expose labels, permission level, availability, reason, approval requirement, and supported roles. Never expose credentials or internal connector configuration.

- [ ] **Step 3: Implement approval execution boundary**

Re-fetch the durable approval, verify user, status, expiry, action type, current parameter hash, and idempotency key. Dispatch only allowlisted adapters. Record `submitted`, then require adapter-specific evidence before `completed`; otherwise persist `partial` or `failed`.

- [ ] **Step 4: Wire existing publishing behind the boundary**

Reuse the current `/api/publish` proxy only after approval. Do not create live email/calendar/CRM implementations without configured connectors; return `TOOL_NEEDS_CONFIGURATION` and keep the task non-completed.

- [ ] **Step 5: Run tool and approval tests with mocked external calls**

No real platform action is performed in automated tests.

---

### Task 10: Enterprise team center and conversation workspace

**Files:**
- Create: `components/agents/team-agent-center.tsx`
- Create: `components/agents/collaboration-panel.tsx`
- Modify: `components/agent-center.tsx`
- Modify: `components/agent-card.tsx`
- Modify: `components/dashboard-view.tsx`
- Modify: `components/chat-workspace.tsx`
- Modify: `app/page.tsx`
- Test: `tests/agent-team-ui.test.ts`
- Test: `tests/copywriting-workspace-layout.test.ts`

- [ ] **Step 1: Write failing source-level UI contract tests**

Assert the coordinator CTA, five group filters, service availability labels, hidden team model picker, file input types, collaboration panel, partial badge, and approval controls. Keep existing copywriting workspace expectations intact.

- [ ] **Step 2: Implement the team center**

Render the coordinator hero, grouped filter chips, search over roles/skills/tasks, and responsive cards. Cards show portrait, name, department/title, level, three Skill tags, and real availability. Preserve the existing callback contract into `app/page.tsx`.

- [ ] **Step 3: Implement team chat behavior**

For team roles, call `runEnterpriseAgent()` instead of the copywriting stream endpoint. Keep conversation history, attachments, primary/co-sign result, citations/warnings, model-hidden badge, cost, and task status. Copywriting mode continues using SSE and its model UI as currently required.

- [ ] **Step 4: Add collaboration and approval panels**

Show primary/co-sign status and failures. Render approval action, target, diff/parameters, expiry, reject, approve, and execution evidence. Never render an unverified external action as completed.

- [ ] **Step 5: Run UI and TypeScript tests**

Run focused Node tests and `npx tsc --noEmit`.

---

### Task 11: Generate and integrate original enterprise portraits

**Files:**
- Create: `public/agents/company/chief-coordinator.png`
- Create: `public/agents/company/strategy-management.png`
- Create: `public/agents/company/legal-compliance.png`
- Create: `public/agents/company/finance-control.png`
- Create: `public/agents/company/people-operations.png`
- Create: `public/agents/company/product-management.png`
- Create: `public/agents/company/technology-data.png`
- Create: `public/agents/company/brand-marketing.png`
- Create: `public/agents/company/sales-business.png`
- Create: `public/agents/company/public-affairs.png`
- Create: `public/agents/company/operations-service.png`
- Create: `public/agents/company/content-strategy.png`
- Create: `public/agents/company/video-production.png`
- Create: `public/agents/company/geo-growth.png`
- Create: `public/agents/company/channel-distribution.png`
- Test: `tests/agent-portrait-assets.test.ts`

- [ ] **Step 1: Generate an original 5×3 enterprise editorial portrait sheet with the image model**

Prompt constraints: fictional professionals; no public figures; consistent 1:1 bust composition; soft studio light; neutral low-saturation backgrounds; natural age/gender diversity; no text, badges, logos, extra hands, or watermarks; each cell separated by a clean gutter.

- [ ] **Step 2: Inspect the generated sheet at original resolution**

Reject and regenerate if faces repeat, any portrait resembles a public figure, grid boundaries are inconsistent, or artifacts/text appear.

- [ ] **Step 3: Crop mechanically into 15 square assets**

Use Sharp only for deterministic grid cropping and PNG export; do not synthesize or alter content outside the image model.

- [ ] **Step 4: Add asset tests**

Assert every registry avatar exists, is PNG, is square, is at least 256×256, and no legacy celebrity path remains.

---

### Task 12: Documentation, full verification, and honest UAT report

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/agent-team-operations.md`
- Create: `tests/agent-team-evals.test.ts`
- Create: `tests/test_agent_team_security.py`

- [ ] **Step 1: Add role evaluation fixtures**

For each role cover normal work, missing evidence, privilege escalation, and attachment prompt injection. Legal/finance/technology also cover stale sources, incorrect numbers, and non-reproducible claims.

- [ ] **Step 2: Add security tests**

Cover cross-user access, cross-department retrieval, malformed MIME/extension pairs, oversized XML/ZIP input, approval hash mismatch, expired approvals, replay, and secret redaction.

- [ ] **Step 3: Document operations**

Explain role/Skill/version updates, cloud routing, attachment limits, knowledge scopes, approval lifecycle, connector availability, audit lookup, and the difference between `partial` and `completed`.

- [ ] **Step 4: Run the complete relevant test suite**

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/
python -m pytest tests/ -v
npx tsc --noEmit
```

If the full repository suite contains unrelated pre-existing failures, rerun every changed-area test explicitly and report both sets separately.

- [ ] **Step 5: Run browser UAT**

Start Next.js and FastAPI, then verify: team center, every role card, coordinator task, direct role task, image upload, each document type, one failed attachment, one partial co-sign, approval reject, approval resume, cancel, history reload, mobile layout, and dark mode.

- [ ] **Step 6: Run only safe external UAT**

Query connector availability and verified publishing accounts. Do not send email, create meetings, modify CRM, or publish content unless a configured low-impact test account and explicit approval exist. Report those capabilities as `needs_configuration` or `not_uat_verified` when evidence is unavailable.

- [ ] **Step 7: Inspect final diff and status**

```powershell
git status --short
git diff --check
```

List task-owned files, unrelated pre-existing changes, test evidence, browser evidence, and every capability that remains partial or unverified.

---

## Plan self-review

- Spec coverage: all approved roles, Skill/knowledge/tool separation, model hiding, files/images, collaboration, permissions, UI, portraits, states, tests, and three delivery phases map to Tasks 1–12.
- Placeholder scan: no implementation placeholders or unspecified “handle errors” steps remain.
- Type consistency: the same agent IDs, statuses, permission levels, run result, and route snapshot contracts are used throughout.
- Scope: stages are dependent slices of one Agent Runtime and can be executed sequentially in this plan.
- Dirty-worktree safety: commits are optional when task-owned diffs cannot be separated from existing user changes; verification and final handoff remain mandatory.

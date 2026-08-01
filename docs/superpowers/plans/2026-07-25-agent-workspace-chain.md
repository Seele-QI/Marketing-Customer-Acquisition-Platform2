# Enterprise Agent Embedded Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embed the enterprise-agent workspace in the existing AI middle-platform shell, route it only through a dedicated cloud-delivered DeepSeek fast channel, and show a truthful Codex-style operational task chain.

**Architecture:** Keep the existing page shell and authenticated agent run API. Add a dedicated provider selector and a pure public task-trace builder; add a lightweight planning endpoint so the browser can display real routing before the long-running execution completes. Refactor only the team-agent workspace path, leaving copywriting-agent behavior unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Node test runner, existing cloud provider synchronization, existing FastAPI run store.

---

### Task 1: Dedicated cloud DeepSeek fast routing

**Files:**
- Modify: `lib/agents/model-router.ts`
- Modify: `lib/llm/synced-providers.ts`
- Modify: `tests/agent-model-router.test.ts`

- [ ] Write failing tests proving ordinary synced providers are rejected, only `purpose=enterprise_agent` plus `performance_tier=fast` DeepSeek providers are selected, and image requests require `supports_images=true`.
- [ ] Run `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/agent-model-router.test.ts` and confirm the new assertions fail.
- [ ] Add `listSyncedEnterpriseAgentFastProviders()` and map only those providers to agent candidates.
- [ ] Re-run the focused test and confirm all cases pass.

### Task 2: Public operational task trace

**Files:**
- Create: `lib/agents/task-trace.ts`
- Modify: `lib/agents/public.ts`
- Modify: `app/api/agents/run/route.ts`
- Create: `tests/agent-task-trace.test.ts`

- [ ] Write failing tests for planned, completed, partial, failed-cosigner, synthesis-failure and no-cosigner traces.
- [ ] Run the focused test and confirm the module is missing.
- [ ] Implement typed trace steps without provider data or private reasoning.
- [ ] Attach the completed trace to successful public run responses.
- [ ] Re-run trace and public serialization tests.

### Task 3: Authenticated planning endpoint

**Files:**
- Create: `app/api/agents/plan/route.ts`
- Modify: `lib/agents/client.ts`
- Create: `tests/agent-plan-route.test.ts`

- [ ] Write failing source/contract tests for authentication, request sanitization, deterministic planning, no billing call and public trace output.
- [ ] Run the test and confirm failure.
- [ ] Implement `POST /api/agents/plan` with `withAuth`, `sanitizeAgentRunRequest`, `planAgentCollaboration` and the planned trace builder.
- [ ] Add `planEnterpriseAgentTask()` to the browser client.
- [ ] Re-run the focused test.

### Task 4: Embed the workspace in the AI middle-platform shell

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/agents/team-chat-workspace.tsx`
- Create: `components/agents/agent-task-trace.tsx`
- Modify: `tests/agent-team-ui.test.ts`

- [ ] Write failing UI contract tests that require the global shell to remain visible, prohibit a full-screen team overlay, require the task trace, and preserve the full-screen copywriting path.
- [ ] Run the UI test and confirm failure.
- [ ] Render team chat inside the main content container while keeping `DashboardSidebar` and `TopHeader`.
- [ ] Replace the internal department sidebar with a compact toolbar and two-column content/inspector layout.
- [ ] Integrate the planning request, active trace, final trace, cancellation and partial-state rendering.
- [ ] Re-run UI tests and `npx tsc --noEmit`.

### Task 5: Operations contract and verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/agent-team-operations.md`

- [ ] Document the cloud provider `extra` fields, fail-closed behavior and public trace boundary.
- [ ] Run all agent-focused TypeScript tests.
- [ ] Run all Python tests.
- [ ] Run `pnpm build`.
- [ ] Run visible browser UAT for sidebar persistence, coordinator planning, partial chain, cancellation, mobile and dark mode.
- [ ] Run `git diff --check` and report unrelated existing worktree changes separately.


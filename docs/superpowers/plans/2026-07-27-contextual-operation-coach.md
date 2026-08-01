# Contextual Operation Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the floating video/GEO assistant into a project-optional operation coach that explains the current page, highlights real controls, advances through deterministic steps, and degrades safely when project APIs fail.

**Architecture:** Add a pure operation-guide registry derived from existing tutorial/business workflow knowledge, then make the root provider resolve the active guide independently of durable projects. Replace the project-gated drawer with guide-first tabs and a reusable non-blocking spotlight. Durable project and AI chat remain optional secondary capabilities.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS, existing tutorial/task-runtime infrastructure, node:test, Playwright visual verification.

---

## File map

### New files

- `lib/business-assistant/operation-guides.ts` — supported page guides, steps, issues, and resolver.
- `lib/business-assistant/guide-progress.ts` — local guide cursor persistence and safe parsing.
- `components/business-assistant-spotlight.tsx` — scroll/highlight controller that never blocks page interaction.
- `tests/business-assistant-operation-guides.test.ts` — guide coverage and unsupported-page behavior.
- `tests/business-assistant-guide-progress.test.ts` — cursor persistence and invalid-state recovery.
- `tests/business-assistant-coach-ui.test.ts` — source contract for guide-first UI and error containment.

### Modified files

- `lib/business-assistant/types.ts` — operation guide contracts and richer page context.
- `lib/business-assistant/context.tsx` — guide resolution, cursor, optional project loading, and contained errors.
- `components/business-assistant-shell.tsx` — guide-first interface with 操作指南/问助理/我的进度.
- `app/page.tsx` — mount shared spotlight alongside the persistent shell.
- `components/dh-video-v2-workflow.tsx` — add stable tutorial anchors.
- `components/image-video-workflow.tsx` — add stable tutorial anchors.
- `components/mashup-video-workflow.tsx` — add stable tutorial anchors.
- `components/promo-video-workflow.tsx` — add stable tutorial anchors.
- `components/geo/knowledge/geo-knowledge-wizard.tsx` — add stable tutorial anchors.
- `components/geo/matrix/geo-matrix-config-panel.tsx` — add stable tutorial anchors.
- `components/geo/article/geo-article-batch-panel.tsx` — add stable tutorial anchors.
- `tests/business-assistant-ui.test.ts` — update legacy tab expectations.

## Task 1: Deterministic operation guide registry

**Files:**
- Create: `tests/business-assistant-operation-guides.test.ts`
- Create: `lib/business-assistant/operation-guides.ts`
- Modify: `lib/business-assistant/types.ts`

- [ ] **Step 1: Write the failing registry test**

Test that every `VIDEO_VIEWS` and `GEO_VIEWS` value resolves to the correct enabled assistant, contains preparation, ordered steps, completion criteria, and at least one real highlight target. Assert identity, poster, dashboard, and Douyin return no guide.

- [ ] **Step 2: Verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/business-assistant-operation-guides.test.ts
```

Expected: module-not-found for `operation-guides.ts`.

- [ ] **Step 3: Implement minimal guide contracts and registry**

Define `OperationGuide`, `OperationGuideStep`, `OperationGuideIssue`, `resolveOperationGuide(view)`, and `listOperationGuides()`. Use fixed strings and existing view constants; do not call APIs or read DOM in this module.

- [ ] **Step 4: Verify GREEN**

Run the focused test and expect all assertions to pass.

## Task 2: Local guide progress independent of projects

**Files:**
- Create: `tests/business-assistant-guide-progress.test.ts`
- Create: `lib/business-assistant/guide-progress.ts`
- Modify: `lib/business-assistant/context.tsx`

- [ ] **Step 1: Write failing progress tests**

Cover clamping invalid cursors, per-view cursor isolation, malformed JSON recovery, and completion state without a project ID.

- [ ] **Step 2: Verify RED**

Run the focused Node test and expect module-not-found.

- [ ] **Step 3: Implement safe progress helpers**

Expose pure `parseGuideProgress`, `getGuideCursor`, and `setGuideCursor` functions. Persist only `{ version, cursors }` under `agenthub-operation-guide-v1`.

- [ ] **Step 4: Refactor provider**

Resolve `activeGuide` from `activeView` immediately. Expose `guideStepIndex`, `setGuideStepIndex`, `nextGuideStep`, `previousGuideStep`, `projectError`, and `clearProjectError`. Project list/create/read errors must be caught and converted into inline state; they must never reject from click handlers.

- [ ] **Step 5: Verify GREEN**

Run progress, registry, client, and type-check tests.

## Task 3: Guide-first floating coach

**Files:**
- Create: `tests/business-assistant-coach-ui.test.ts`
- Modify: `components/business-assistant-shell.tsx`
- Modify: `tests/business-assistant-ui.test.ts`

- [ ] **Step 1: Write failing UI contract tests**

Assert the default tabs are `操作指南 / 问助理 / 我的进度`, the guide renders without `activeProject`, opening the shell does not call `createProject`, unsupported pages show an explicit limitation, and all async project actions are awaited inside `try/catch`.

- [ ] **Step 2: Verify RED**

Run both assistant UI tests and confirm the legacy project-gated shell fails the new assertions.

- [ ] **Step 3: Replace the shell information architecture**

Implement:

- compact current-page header;
- purpose, preparation, ordered steps, completion criteria, and common-issue cards;
- `定位到当前操作`, previous, next, and `我已完成`;
- AI chat available without a project through a local current-page help mode;
- durable chat enabled only when a project exists;
- optional `建立长期项目` inside `我的进度`;
- inline 401/404/409/503 error copy.

- [ ] **Step 4: Verify GREEN**

Run focused UI tests and `npx tsc --noEmit`.

## Task 4: Non-blocking real-control spotlight

**Files:**
- Create: `components/business-assistant-spotlight.tsx`
- Modify: `lib/business-assistant/context.tsx`
- Modify: `app/page.tsx`
- Modify: video/GEO workflow files listed in the file map.

- [ ] **Step 1: Extend the failing UI contract**

Assert the provider exposes `highlightTarget`, the spotlight queries `[data-tutorial-id]`, calls `scrollIntoView`, renders with `pointer-events-none`, and clears itself when the view or step changes.

- [ ] **Step 2: Verify RED**

Run the focused UI contract test and confirm missing spotlight behavior.

- [ ] **Step 3: Implement the spotlight**

Use `CSS.escape`, `getBoundingClientRect`, scroll/resize listeners, a short pulse timeout, and a recoverable `targetMissing` callback. Do not render a full-page overlay and do not synthesize clicks.

- [ ] **Step 4: Add stable anchors**

Add one or more `data-tutorial-id` attributes for each registered guide target. Anchors must sit on visible form/step containers rather than decorative wrappers.

- [ ] **Step 5: Verify GREEN**

Run UI tests and TypeScript checks.

## Task 5: Regression and real browser verification

**Files:**
- Modify: `docs/agent-team-operations.md`
- Modify: `.planning/quick/20260725-business-assistant-workbench/VERIFICATION.md`

- [ ] **Step 1: Document the revised boundary**

Record that page guidance is local and project-optional, project APIs are secondary, AI chat is contextual, and generation/publish actions remain user-confirmed.

- [ ] **Step 2: Run focused Node tests**

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/business-assistant-operation-guides.test.ts tests/business-assistant-guide-progress.test.ts tests/business-assistant-coach-ui.test.ts tests/business-assistant-ui.test.ts tests/business-assistant-actions.test.ts tests/business-assistant-client.test.ts tests/business-assistant-registry.test.ts tests/task-runtime.test.ts
```

Expected: zero failures.

- [ ] **Step 3: Run backend regression**

```powershell
& '.\resources\python\python.exe' -m unittest discover -s tests -p 'test_business_assistant_*.py' -v
```

Expected: zero failures.

- [ ] **Step 4: Run compiler and production build**

```powershell
npx tsc --noEmit
pnpm build
```

Expected: both commands exit 0 and business-assistant routes appear in the build route table.

- [ ] **Step 5: Browser UAT**

At 1366×768 verify:

1. Open a video page with no project and immediately see page instructions.
2. `定位到当前操作` scrolls to and highlights a real control without blocking it.
3. Switch to a GEO page and see the guide/assistant switch.
4. Switch to identity and poster and see no fake dedicated assistant.
5. Simulate project 404 and confirm an inline fallback instead of the Next.js error overlay.
6. Confirm opening the shell sends no create-project request.

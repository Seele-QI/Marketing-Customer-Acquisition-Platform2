# Functional Workbench and Business Assistants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the display-only dashboard with a functional business launcher and add persistent, account-scoped video and GEO assistants that can plan work, read real page/task context, and survive navigation.

**Architecture:** Keep the existing Next.js/FastAPI split. FastAPI owns durable account-scoped business projects, steps, and assistant messages; Next.js owns the root-mounted assistant shell, page-context bridge, safe action execution, model routing, and homepage. Reuse the existing long-term memory, agent registry, task runtime, credit, and image-generation boundaries.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind CSS, FastAPI, Pydantic, SQLite, node:test, Python unittest/pytest.

---

## File map

### New files

- `lib/business-assistant/types.ts` — public TypeScript contracts.
- `lib/business-assistant/registry.ts` — enabled and reserved assistant definitions.
- `lib/business-assistant/client.ts` — browser project and assistant API client.
- `lib/business-assistant/server.ts` — authenticated server-to-server project loading.
- `lib/business-assistant/context.tsx` — root provider and page-context publication.
- `lib/business-assistant/actions.ts` — allow-listed client action validation.
- `lib/business_assistant_store.py` — SQLite project, step, and message persistence.
- `routes/business_assistant_routes.py` — authenticated FastAPI project APIs.
- `app/api/business-assistant/projects/route.ts` — project list/create proxy.
- `app/api/business-assistant/projects/[id]/route.ts` — project read/update proxy.
- `app/api/business-assistant/projects/[id]/steps/route.ts` — step replacement/update proxy.
- `app/api/business-assistant/chat/route.ts` — fixed-agent chat, memory, plan, billing, and structured suggestions.
- `components/business-assistant/business-assistant-shell.tsx` — floating orb and persistent drawer.
- `components/business-assistant/assistant-chat-tab.tsx` — chat UI.
- `components/business-assistant/assistant-plan-tab.tsx` — project plan UI.
- `components/business-assistant/assistant-memory-tab.tsx` — used-memory UI.
- `components/dashboard-business-directions.tsx` — five major business entries.
- `components/dashboard-project-continuation.tsx` — current/recent project section.
- `components/poster-creation-view.tsx` — non-assistant poster generator.
- `tests/business-assistant-registry.test.ts`
- `tests/business-assistant-actions.test.ts`
- `tests/business-assistant-ui.test.ts`
- `tests/business-assistant-chat-route.test.ts`
- `tests/test_business_assistant_store.py`
- `tests/test_business_assistant_routes.py`

### Existing files to modify

- `main.py` — include the new FastAPI router.
- `lib/memory/types.ts` — add `video` memory scope.
- `lib/memory/server.ts` — retrieve `video` memories.
- `lib/user_memory_service.py` — allow `video` scope.
- `routes/user_memory_routes.py` — accept `video` observe/retrieve/consolidate scope.
- `app/page.tsx` — mount provider/shell once and route poster view.
- `components/dashboard-view.tsx` — retain `TopBanner`, replace old dashboard blocks.
- `components/dashboard-sidebar.tsx` — add poster route and reserved interception entry where appropriate.
- `components/video/video-workspace.tsx` — publish video page context.
- `components/geo/geo-workspace.tsx` — publish GEO page context.
- `lib/global-search.ts` — add the major business destinations.
- `.env.example` and `AGENTS.md` — document no new secrets and the new module boundaries.

## Task 1: Assistant contracts and registry

**Files:**
- Create: `lib/business-assistant/types.ts`
- Create: `lib/business-assistant/registry.ts`
- Test: `tests/business-assistant-registry.test.ts`

- [ ] **Step 1: Write the failing registry test**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import {
  getBusinessAssistant,
  listEnabledBusinessAssistants,
  resolveAssistantForView,
} from "../lib/business-assistant/registry.ts"

test("only video and GEO assistants are enabled", () => {
  assert.deepEqual(
    listEnabledBusinessAssistants().map((item) => item.id),
    ["video-creation", "geo-growth"],
  )
  assert.equal(getBusinessAssistant("douyin-interception")?.availability, "reserved")
})

test("view routing never invents an unsupported assistant", () => {
  assert.equal(resolveAssistantForView("数字人视频创作（新）")?.id, "video-creation")
  assert.equal(resolveAssistantForView("企业知识库搭建")?.id, "geo-growth")
  assert.equal(resolveAssistantForView("海报图创作"), undefined)
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/business-assistant-registry.test.ts
```

Expected: FAIL because `lib/business-assistant/registry.ts` does not exist.

- [ ] **Step 3: Implement the contracts and fixed registry**

Define:

```ts
export type EnabledBusinessAssistantId = "video-creation" | "geo-growth"
export type BusinessProjectKind = "video" | "geo"
export type BusinessAssistantAvailability = "enabled" | "reserved"

export type BusinessAssistantDefinition = {
  id: EnabledBusinessAssistantId | "douyin-interception"
  agentId: "video-production" | "geo-growth" | "channel-distribution"
  name: string
  projectKind?: BusinessProjectKind
  availability: BusinessAssistantAvailability
  supportedViews: readonly string[]
}
```

Register video and GEO as `enabled`. Register Douyin interception as `reserved` with no public selector exposure. Map views using `VIDEO_VIEWS` and `GEO_VIEWS`; identity, poster, distribution, settings, and dashboard resolve to no assistant.

- [ ] **Step 4: Run the focused test**

Expected: 2 tests pass.

- [ ] **Step 5: Commit only the task files if the index is clean**

```bash
git add lib/business-assistant/types.ts lib/business-assistant/registry.ts tests/business-assistant-registry.test.ts
git commit -m "feat(assistant): define supported business assistants"
```

## Task 2: Durable business project store

**Files:**
- Create: `lib/business_assistant_store.py`
- Create: `routes/business_assistant_routes.py`
- Modify: `main.py`
- Test: `tests/test_business_assistant_store.py`
- Test: `tests/test_business_assistant_routes.py`

- [ ] **Step 1: Write failing store tests**

Cover:

```python
def test_projects_are_user_scoped(tmp_path):
    store = BusinessAssistantStore(tmp_path / "assistant.db")
    project = store.create_project(user_id=1, kind="video", title="首批口播", goal="生成三条成片")
    assert store.get_project(user_id=1, project_id=project.id) is not None
    assert store.get_project(user_id=2, project_id=project.id) is None

def test_project_revision_conflict(tmp_path):
    store = BusinessAssistantStore(tmp_path / "assistant.db")
    project = store.create_project(user_id=1, kind="geo", title="GEO 基建", goal="完成知识库")
    store.update_project(user_id=1, project_id=project.id, revision=project.revision, title="新版标题")
    with pytest.raises(BusinessAssistantStore.RevisionConflict):
        store.update_project(user_id=1, project_id=project.id, revision=project.revision, title="过期写入")

def test_only_evidence_can_complete_step(tmp_path):
    store = BusinessAssistantStore(tmp_path / "assistant.db")
    project = store.create_project(user_id=1, kind="video", title="成片", goal="生成视频")
    step = store.replace_steps(
        user_id=1,
        project_id=project.id,
        revision=project.revision,
        steps=[{
            "stage": "generate",
            "title": "生成首条成片",
            "status": "active",
            "order_index": 0,
            "linked_view": "数字人视频创作（新）",
        }],
    )[0]
    with pytest.raises(BusinessAssistantStore.InvalidTransition):
        store.update_step(user_id=1, step_id=step.id, revision=step.revision, status="completed")
```

- [ ] **Step 2: Run the focused Python tests**

Run:

```bash
python -m pytest tests/test_business_assistant_store.py tests/test_business_assistant_routes.py -v
```

Expected: import failures.

- [ ] **Step 3: Implement the SQLite store**

Create the three tables from the design. Implement these exact methods:

- `create_project(*, user_id: int, kind: str, title: str, goal: str, assistant_id: str) -> BusinessProject`
- `list_projects(*, user_id: int, kind: str | None = None, limit: int = 30) -> list[BusinessProject]`
- `get_project(*, user_id: int, project_id: str) -> BusinessProject | None`
- `update_project(*, user_id: int, project_id: str, revision: int, **patch: object) -> BusinessProject`
- `replace_steps(*, user_id: int, project_id: str, revision: int, steps: list[dict[str, object]]) -> list[BusinessProjectStep]`
- `update_step(*, user_id: int, step_id: str, revision: int, status: str, evidence: dict[str, object] | None = None) -> BusinessProjectStep`
- `append_message(*, user_id: int, project_id: str, assistant_id: str, role: str, content: str) -> BusinessAssistantMessage`
- `list_messages(*, user_id: int, project_id: str, limit: int = 30) -> list[BusinessAssistantMessage]`

Define `RevisionConflict`, `ProjectNotFound`, and `InvalidTransition` as distinct `RuntimeError` subclasses.

Require `evidence` with a recognized source (`draft_saved`, `runtime_terminal`, `geo_score`) before accepting `completed`. Use transactions and `WHERE user_id=? AND revision=?`.

- [ ] **Step 4: Implement authenticated routes**

Expose:

- `GET/POST /api/business-assistant/projects`
- `GET/PATCH /api/business-assistant/projects/{id}`
- `PUT /api/business-assistant/projects/{id}/steps`
- `PATCH /api/business-assistant/steps/{id}`
- `GET/POST /api/business-assistant/projects/{id}/messages`

Use `require_user(request)`. Return 404 for cross-user access, 409 for revision conflicts, and 422 for invalid transitions.

- [ ] **Step 5: Include the router in `main.py`**

Import and call `app.include_router(business_assistant_router)` alongside memory and agent-team routers.

- [ ] **Step 6: Run focused tests**

Expected: all store and route tests pass.

- [ ] **Step 7: Commit only task-owned changes when safe**

```bash
git add lib/business_assistant_store.py routes/business_assistant_routes.py main.py tests/test_business_assistant_store.py tests/test_business_assistant_routes.py
git commit -m "feat(assistant): persist account business projects"
```

## Task 3: Project proxy and browser client

**Files:**
- Create: `lib/business-assistant/client.ts`
- Create: `lib/business-assistant/server.ts`
- Create: `app/api/business-assistant/projects/route.ts`
- Create: `app/api/business-assistant/projects/[id]/route.ts`
- Create: `app/api/business-assistant/projects/[id]/steps/route.ts`
- Test: `tests/business-assistant-client.test.ts`

- [ ] **Step 1: Write failing client tests**

Test credentials, JSON bodies, 409 parsing, and stable project/step camelCase conversion.

- [ ] **Step 2: Run the test and verify missing modules fail**

Use the project Node test command.

- [ ] **Step 3: Implement proxy routes**

Follow `lib/agents/api-proxy.ts` and `lib/memory/api-proxy.ts`. Forward the current cookie to FastAPI and never accept a client-supplied `user_id`.

- [ ] **Step 4: Implement browser and server clients**

The browser client exposes:

```ts
listProjects(kind?: BusinessProjectKind)
createProject(input)
getProject(id)
updateProject(id, revision, patch)
replaceSteps(id, revision, steps)
sendAssistantMessage(input)
```

The server helper loads a project by ID using the authenticated cookie and returns `unavailable` instead of inventing a project.

- [ ] **Step 5: Run focused tests**

Expected: pass.

## Task 4: Extend memory scope for video

**Files:**
- Modify: `lib/memory/types.ts`
- Modify: `lib/memory/server.ts`
- Modify: `lib/user_memory_service.py`
- Modify: `routes/user_memory_routes.py`
- Test: `tests/user-memory-client.test.ts`
- Test: `tests/test_user_memory_service.py`
- Test: `tests/test_user_memory_routes.py`

- [ ] **Step 1: Add failing video-scope tests**

Assert that video retrieval includes `global`, `positioning`, and `video`, while GEO includes `global`, `positioning`, and `geo`; neither receives the other professional scope.

- [ ] **Step 2: Run focused tests and confirm literal/schema failures**

- [ ] **Step 3: Extend the scope union and backend literals**

Add `"video"` to TypeScript `MemoryScope`, Python `MemoryScope`, Pydantic observe/consolidate/retrieve literals, defaults, and scope settings. Preserve existing behavior for copywriting, positioning, and GEO.

- [ ] **Step 4: Make assistant retrieval explicit**

Allow `retrieveServerMemory` to accept `scope: "video" | "geo"` alongside its existing named arguments. The memory service must always consider `global` and `positioning` as shared bases for these two scopes.

- [ ] **Step 5: Run all memory tests**

Expected: existing and new memory tests pass.

## Task 5: Assistant chat route and safe actions

**Files:**
- Create: `lib/business-assistant/actions.ts`
- Create: `app/api/business-assistant/chat/route.ts`
- Test: `tests/business-assistant-actions.test.ts`
- Test: `tests/business-assistant-chat-route.test.ts`

- [ ] **Step 1: Write failing validation tests**

Cover enabled assistants, reserved assistant rejection, project-kind mismatch, unknown action rejection, `navigate` view allow-listing, `prefill_draft` size limits, and confirmation-required generation.

- [ ] **Step 2: Run tests and verify failure**

- [ ] **Step 3: Implement action schemas**

Allow only:

```ts
type AssistantSuggestedAction =
  | { type: "navigate"; view: string }
  | { type: "open_project"; projectId: string }
  | { type: "update_plan"; projectId: string; expectedRevision: number; steps: StepPatch[] }
  | { type: "prefill_draft"; target: string; value: string }
  | { type: "request_generation_confirmation"; target: string; summary: string; idempotencyKey: string }
```

Reject unrecognized targets and cap all strings/arrays.

- [ ] **Step 4: Implement authenticated chat**

The route must:

1. Authenticate with `withAuth`.
2. Resolve the assistant from the server registry.
3. Return `ASSISTANT_NOT_AVAILABLE` for reserved/unknown IDs.
4. Load the project server-side and verify its kind.
5. Retrieve `video` or `geo` memory.
6. Build a system prompt from `video-production` or `geo-growth` plus the fixed workflow contract.
7. Send only sanitized page context and recent project messages.
8. Parse a JSON envelope `{ text, suggestedActions }`; fall back to text with no actions on parse failure.
9. Charge the existing `copywriting.llm_call` key using an idempotent run reference.
10. Append messages only after a valid response.
11. Return memory status/items, project revision, billing, and warnings.

- [ ] **Step 5: Run route and action tests**

Expected: pass, including memory unavailable and model failure cases that do not mutate progress.

## Task 6: Persistent React provider and floating assistant shell

**Files:**
- Create: `lib/business-assistant/context.tsx`
- Create: `components/business-assistant/business-assistant-shell.tsx`
- Create: `components/business-assistant/assistant-chat-tab.tsx`
- Create: `components/business-assistant/assistant-plan-tab.tsx`
- Create: `components/business-assistant/assistant-memory-tab.tsx`
- Modify: `app/page.tsx`
- Test: `tests/business-assistant-ui.test.ts`

- [ ] **Step 1: Write failing UI contract tests**

Assert:

- Provider and shell are mounted outside `ContentArea`.
- Shell receives `activeView` changes without a changing `key`.
- Tabs are 对话/计划/记忆.
- Only video and GEO appear in the switcher.
- The drawer renders memory failure and unsupported-page states.
- Generation suggestions render a confirmation control, not a direct executor.

- [ ] **Step 2: Run the UI contract test and verify failure**

- [ ] **Step 3: Implement the provider**

Store:

```ts
{
  isOpen,
  selectedAssistantId,
  pinnedAssistantId,
  currentProject,
  pageContext,
  conversationDraft,
  usedMemories,
  memoryStatus,
}
```

Persist only UI preference and selected project ID locally; fetch account projects from the server. Expose `publishPageContext`, `openAssistant`, `selectProject`, and `executeSuggestedAction`.

- [ ] **Step 4: Implement the shell**

Desktop: fixed right drawer with content inset via a root data attribute/class. Mobile: bottom sheet. Keep the orb draggable within viewport bounds and keyboard accessible. Never render a poster, identity, or Douyin assistant.

- [ ] **Step 5: Mount once in `app/page.tsx`**

Place the provider around the persistent app content and render the shell as a sibling of the changing `ContentArea`. Do not key the shell by `activeView`.

- [ ] **Step 6: Run focused tests**

Expected: pass.

## Task 7: Video and GEO page context

**Files:**
- Modify: `components/video/video-workspace.tsx`
- Modify: `components/geo/geo-workspace.tsx`
- Modify: `lib/task-runtime/types.ts` only if a read-only projection helper needs a type export
- Create: `lib/business-assistant/page-context.ts`
- Test: `tests/business-assistant-context.test.ts`

- [ ] **Step 1: Write failing context tests**

Verify video views publish only video assistant context and matching runtime task summaries; GEO views publish only GEO context. Verify unsupported views return `{ supported: false }`. Verify secrets and raw attachment data are dropped.

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement context sanitization**

Build a pure sanitizer with a hard allow-list and length limits. Include only view, workflow, step labels, draft/project IDs, completion flags, and runtime status/progress.

- [ ] **Step 4: Publish from workspace roots**

Use an effect in `VideoWorkspace` and `GeoWorkspace` to publish on active view and real task changes. Clear the previous module context on unmount. Do not pass whole component state objects.

- [ ] **Step 5: Run focused tests**

Expected: pass.

## Task 8: Functional homepage

**Files:**
- Create: `components/dashboard-business-directions.tsx`
- Create: `components/dashboard-project-continuation.tsx`
- Modify: `components/dashboard-view.tsx`
- Modify: `lib/global-search.ts`
- Test: `tests/business-assistant-ui.test.ts`

- [ ] **Step 1: Extend the failing UI contract**

Assert:

- `TopBanner` remains rendered.
- Old `DashboardQuickActions`, `DashboardAIInsights`, and agent grid are not rendered.
- Five business directions exist.
- Video routes to `DEFAULT_VIDEO_VIEW`.
- GEO routes to `GEO_VIEWS.KNOWLEDGE_BASE`.
- Identity routes to `身份定位`.
- Poster routes to `海报图创作`.
- Douyin interception is visibly reserved and does not navigate to a fake working page.
- Current/recent projects come from the real project client, not constants.

- [ ] **Step 2: Implement the project continuation strip**

Load active projects, sort by `updatedAt`, show the latest as the primary continuation, and show at most two recent projects. Show explicit loading, signed-out, empty, and unavailable states.

- [ ] **Step 3: Implement five major direction cards**

Use large semantic cards with one purpose, one description, one destination, and capability status. Do not expose small templates.

- [ ] **Step 4: Replace dashboard body while retaining `TopBanner`**

Keep `ModuleTutorialButton` and `TutorialWelcomeCard` only if they do not dominate the new hierarchy.

- [ ] **Step 5: Run focused tests**

Expected: pass.

## Task 9: Non-assistant poster workspace

**Files:**
- Create: `components/poster-creation-view.tsx`
- Modify: `app/page.tsx`
- Modify: `components/dashboard-sidebar.tsx`
- Modify: `lib/global-search.ts`
- Test: `tests/poster-creation-view.test.ts`

- [ ] **Step 1: Write the failing contract test**

Assert a poster view exists, uses `generateArkImages`, accepts purpose/copy/style/aspect ratio, renders results and download controls, and contains no business-assistant registration.

- [ ] **Step 2: Run and confirm failure**

- [ ] **Step 3: Implement the focused poster UI**

Use the existing image client. Require purpose and core copy, build a bounded prompt from user-visible fields, show the configured point cost before submission, and preserve error details without leaking provider secrets.

- [ ] **Step 4: Route homepage/sidebar/search**

Add `海报图创作` as a normal `MainView`. Do not add a poster assistant ID.

- [ ] **Step 5: Run focused tests**

Expected: pass.

## Task 10: Integration, documentation, and verification

**Files:**
- Modify: `.env.example`
- Modify: `AGENTS.md`
- Modify: `docs/agent-team-operations.md`
- Test: all files above

- [ ] **Step 1: Document boundaries**

Record the new project store, two enabled assistants, reserved Douyin assistant, root shell, memory scopes, and confirmation rules. State explicitly that no new environment variable is required.

- [ ] **Step 2: Run TypeScript tests**

```bash
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test \
  tests/business-assistant-registry.test.ts \
  tests/business-assistant-actions.test.ts \
  tests/business-assistant-client.test.ts \
  tests/business-assistant-chat-route.test.ts \
  tests/business-assistant-context.test.ts \
  tests/business-assistant-ui.test.ts \
  tests/poster-creation-view.test.ts \
  tests/user-memory-client.test.ts
```

Expected: all pass.

- [ ] **Step 3: Run Python tests**

```bash
python -m pytest \
  tests/test_business_assistant_store.py \
  tests/test_business_assistant_routes.py \
  tests/test_user_memory_service.py \
  tests/test_user_memory_routes.py -v
```

Expected: all pass.

- [ ] **Step 4: Run regression checks**

```bash
npx tsc --noEmit
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/task-runtime.test.ts tests/agent-registry.test.ts tests/agent-skills.test.ts
```

Expected: no new failures. Existing unrelated packaged-artifact errors, if still present, must be reported separately and not attributed to this work.

- [ ] **Step 5: Desktop visual verification**

Run `pnpm dev:all` and verify at 1920×900 and 1366×768:

1. Existing Banner is unchanged.
2. Five major directions and project continuation are visible.
3. Orb remains through dashboard → video → GEO → identity → poster navigation.
4. Drawer does not cover critical video/GEO controls.
5. Unsupported pages show an explicit context limitation.

- [ ] **Step 6: Real UAT**

With an authenticated account and configured models:

1. Create and resume one video project.
2. Ask the video assistant for the next step and complete a real video generation.
3. Create and resume one GEO project.
4. Ask the GEO assistant to interpret a real score result.
5. Restart the app and verify both plans restore.
6. Confirm Douyin interception cannot be invoked.

Do not mark external generation, scoring, or persistence successful without the corresponding service response and saved project evidence.

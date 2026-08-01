# GEO Article Auto-Illustrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional 0–5 auto-illustration setting to GEO matrix article creation, generate one final RunningHub-sourced image per planned article position concurrently, and insert successful images into the correct project-scoped Markdown article without exposing provider or model controls.

**Architecture:** Extend the existing GEO article batch config and article model with illustration state. The authenticated Next.js route validates project ownership, plans safe section anchors and server-side prompts, charges once per planned image with stable idempotency references, and submits one article-level task to a dedicated FastAPI illustration pipeline. FastAPI reuses the current RunningHub text-image primitive, applies a process-wide concurrency semaphore and bounded retries, stores one final result per anchor, and returns product-safe status. The client persists the article task ID, resumes polling after navigation, and idempotently inserts completed Markdown image blocks into the latest article text.

**Tech Stack:** Next.js App Router, React 19, TypeScript, FastAPI, Pydantic, Python asyncio, RunningHub OpenAPI v2, localStorage project scoping, node:test, pytest.

---

## Delivery constraints

- UI position is fixed: under the matrix/date/inheritance block and immediately before the generation summary/button, in a two-column parameter row beside “每组合篇数”.
- `illustrationsPerArticle` is an integer from `0` to `5`, defaults to `0`, and is restored per matrix project.
- One anchor produces exactly one final image. There is no candidate gallery, model picker, workflow picker, provider name, or retry dialog during normal batch creation.
- Images start only after their article succeeds. Article generation failure must not create or charge image tasks.
- Safe anchors exclude the title/opening, official contact information, summary/conclusion, disclaimer, FAQ, tags, and positions adjacent to an existing image.
- Platform ratios are fixed server-side: 小红书/微博 `3:4`; 抖音 `9:16`; 大众点评/携程 `4:3`; 知乎/网易/搜狐 `16:9`; unknown platform `4:3`; resolution is `1k`.
- Provider concurrency is globally capped at `6`; each image gets at most `2` retries after the initial attempt.
- Article text success is preserved if any image fails. Successful images insert immediately; failed images leave a non-blocking per-article status and a targeted “重试插图” action.
- All cache, task, and local state keys are bound to `userId + projectId + articleId`; changing matrix projects must never display or mutate another project’s illustration tasks.
- Static image URLs and public errors must use product language such as “图片生成引擎” and must never reveal RunningHub, workflow IDs, model product names, API keys, or raw upstream errors.
- Existing manual “插图” upload remains available in the editor and must coexist with generated illustration markers.

## File map

### Create

- `lib/geo/article-illustration-types.ts`: client/server contracts, parser, status normalization, count clamp, and platform ratio mapping.
- `lib/geo/article-illustration-planner.ts`: safe Markdown section selection, prompt construction, stable illustration IDs, and idempotent Markdown insertion.
- `lib/geo/article-illustration-api.ts`: authenticated submit/status client and resilient polling.
- `app/api/geo/article-illustrations/generate/route.ts`: ownership validation, plan creation, idempotent charging, and FastAPI submission.
- `app/api/geo/article-illustrations/status/route.ts`: ownership validation and task status proxy.
- `app/api/geo/article-illustrations/retry/route.ts`: ownership validation and failed-item-only retry proxy.
- `tests/article-illustration-types.test.ts`
- `tests/article-illustration-planner.test.ts`
- `tests/article-illustration-api.test.ts`
- `tests/article-illustration-route.test.ts`
- `tests/article-illustration-ui.test.ts`
- `tests/article-illustration-editor.test.ts`
- `tests/test_article_illustrations.py`

### Modify

- `lib/geo/article-types.ts`: attach requested count, task snapshot, and generated illustration metadata to `GeneratedArticle`.
- `lib/geo/article-batch-store.ts`: persist count and project-scoped resumable illustration task state.
- `components/geo/article/geo-article-batch-panel.tsx`: add the approved 0–5 selector and pass the value with completed article callbacks.
- `components/geo-article-editor-view.tsx`: submit illustration tasks, poll/resume them, insert results, persist progress, and expose non-blocking retry.
- `components/geo/article/geo-article-doc-grid.tsx`: show per-article illustration progress/failure without replacing article success.
- `main.py`: add dedicated article-illustration models, static cache mount, task store, semaphore, runner, and endpoints while reusing the existing image-generation primitive.
- `AGENTS.md`: document the GEO article illustration operational contract and cache path.

### Preserve unchanged

- `lib/image-workbench/types.ts` and `lib/image-workbench/api.ts` keep their two-candidate public workbench contract.
- `app/api/image-workbench/*` remains the image workbench route; GEO article illustrations use their own one-final-image contract.
- Existing article SSE generation stays text-only; illustration work is a resumable second stage.

## Working-tree safety

The repository already contains unrelated local modifications, including `main.py`, `package.json`, image-workbench files, Electron files, and browser profiles.

- Never run `git reset --hard`, `git clean`, or broad checkout commands.
- Before each task, record `git diff -- <touched-file>`.
- Stage only exact new files and reviewed hunks with `git add -p`.
- Do not stage anything below `data/profiles/`, `release-new/`, or `release-run/`.
- If pre-existing and feature hunks cannot be separated safely, finish and verify the task but defer that commit rather than capturing unrelated work.

---

### Task 1: Define illustration contracts, count rules, and platform ratios

**Files:**
- Create: `lib/geo/article-illustration-types.ts`
- Create: `tests/article-illustration-types.test.ts`
- Modify: `lib/geo/article-types.ts`
- Modify: `lib/geo/article-batch-store.ts`
- Modify: `tests/article-batch-store.test.ts`

- [ ] **Step 1: Write failing count, ratio, and contract tests**

```ts
import assert from "node:assert/strict"
import test from "node:test"

import {
  clampIllustrationsPerArticle,
  parseArticleIllustrationGenerateRequest,
  resolveArticleIllustrationRatio,
} from "@/lib/geo/article-illustration-types"

test("clamps illustrations per article to 0..5", () => {
  assert.equal(clampIllustrationsPerArticle(-1), 0)
  assert.equal(clampIllustrationsPerArticle(3), 3)
  assert.equal(clampIllustrationsPerArticle(99), 5)
  assert.equal(clampIllustrationsPerArticle(Number.NaN), 0)
})

test("uses fixed platform ratios", () => {
  assert.equal(resolveArticleIllustrationRatio("xiaohongshu"), "3:4")
  assert.equal(resolveArticleIllustrationRatio("douyin"), "9:16")
  assert.equal(resolveArticleIllustrationRatio("dianping"), "4:3")
  assert.equal(resolveArticleIllustrationRatio("zhihu"), "16:9")
  assert.equal(resolveArticleIllustrationRatio("unknown"), "4:3")
})

test("rejects client-supplied provider controls", () => {
  assert.throws(
    () =>
      parseArticleIllustrationGenerateRequest({
        projectId: "p1",
        articleId: "a1",
        platformId: "zhihu",
        title: "标题",
        markdown: "## 正文\n内容",
        illustrationCount: 2,
        model: "client-choice",
      }),
    /不支持的请求字段/,
  )
})
```

Add store coverage:

```ts
store.saveBatchConfig({
  mode: "matrix",
  projectId: "project-a",
  dates: ["2026-07-30"],
  copiesPerSlot: 1,
  illustrationsPerArticle: 4,
})
assert.equal(
  store.loadArticleBatch("project-a").lastConfig?.illustrationsPerArticle,
  4,
)
assert.equal(
  store.loadArticleBatch("project-b").lastConfig?.illustrationsPerArticle,
  undefined,
)
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-illustration-types.test.ts tests/article-batch-store.test.ts
```

Expected: FAIL because the illustration domain and new config field do not exist.

- [ ] **Step 3: Implement strict shared types**

Define:

```ts
export const ARTICLE_ILLUSTRATIONS_MAX = 5
export type ArticleIllustrationStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"

export type ArticleIllustration = {
  illustrationId: string
  anchorHeading: string
  anchorOccurrence: number
  alt: string
  status: ArticleIllustrationStatus
  imageUrl?: string
  error?: string
}

export type ArticleIllustrationTaskSnapshot = {
  taskId: string
  projectId: string
  articleId: string
  requestedCount: number
  completedCount: number
  failedCount: number
  status: ArticleIllustrationStatus
  updatedAt: number
}
```

`parseArticleIllustrationGenerateRequest` must:

- accept only `projectId`, `articleId`, `platformId`, `title`, `markdown`, and `illustrationCount`;
- reject unknown fields rather than silently accepting a client model/workflow ID;
- require non-empty project/article/title/Markdown;
- clamp is for UI restoration only; API parsing must reject counts outside `1..5`;
- cap Markdown input at a documented safe size such as `80_000` UTF-16 code units.

- [ ] **Step 4: Extend article and store state**

Add to `GeneratedArticle`:

```ts
illustrationsPerArticle?: number
illustrationTask?: ArticleIllustrationTaskSnapshot
illustrations?: ArticleIllustration[]
```

Add to `ArticleBatchConfig`:

```ts
illustrationsPerArticle?: number
```

Keep `scopeStore`, `saveArticles`, `mergeArticles`, and `upsertArticle` project-filtered. Do not create a second unscoped localStorage key.

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-illustration-types.test.ts tests/article-batch-store.test.ts
```

Expected: 0 failures.

- [ ] **Step 6: Commit the isolated domain work**

```powershell
git add lib/geo/article-illustration-types.ts lib/geo/article-types.ts lib/geo/article-batch-store.ts tests/article-illustration-types.test.ts tests/article-batch-store.test.ts
git diff --cached --check
git commit -m "feat: define GEO article illustration state"
```

---

### Task 2: Plan safe anchors, prompts, and idempotent Markdown insertion

**Files:**
- Create: `lib/geo/article-illustration-planner.ts`
- Create: `tests/article-illustration-planner.test.ts`

- [ ] **Step 1: Write failing section-planning tests**

Use an article containing opening copy, ordinary H2 sections, contact details, FAQ, conclusion, tags, and an existing image.

```ts
test("chooses only safe body sections and spaces anchors", () => {
  const plan = planArticleIllustrations({
    projectId: "p1",
    articleId: "a1",
    platformId: "zhihu",
    title: "企业财税管理",
    markdown: SAMPLE_ARTICLE,
    count: 3,
  })

  assert.equal(plan.length, 3)
  assert.deepEqual(
    plan.map((item) => item.anchorHeading),
    ["风险识别", "处理步骤", "案例拆解"],
  )
  assert.ok(plan.every((item) => item.aspectRatio === "16:9"))
  assert.ok(plan.every((item) => item.resolution === "1k"))
  assert.ok(plan.every((item) => !/RunningHub|模型|workflow/i.test(item.prompt)))
})
```

Add explicit negative tests:

- `# 标题` and the first opening paragraph are never anchors.
- headings matching `联系方式|联系我们|咨询方式|总结|结语|免责声明|FAQ|常见问题|标签` are excluded;
- a section whose first meaningful block is already `![...](...)` is excluded;
- requested count is reduced when fewer safe sections exist;
- stable illustration IDs are identical for the same `projectId/articleId/heading occurrence`;
- duplicate heading names are distinguished by `anchorOccurrence`.

- [ ] **Step 2: Write failing insertion tests**

```ts
test("inserts successful images once and preserves manual images", () => {
  const once = applyArticleIllustrations(SAMPLE_ARTICLE, [
    {
      illustrationId: "ill-1",
      anchorHeading: "风险识别",
      anchorOccurrence: 1,
      alt: "企业财税风险识别示意图",
      status: "success",
      imageUrl: "/static/geo-article-illustrations/p1/a1/ill-1.png",
    },
  ])
  const twice = applyArticleIllustrations(once, [/* same result */])

  assert.match(once, /<!-- geo-article-illustration:ill-1 -->/)
  assert.equal(twice, once)
  assert.match(twice, /!\[人工上传\]\(data:image\/png;base64,/)
})
```

Also test:

- results are inserted after the selected heading’s section-opening paragraph, not directly under the H2;
- a missing heading falls back to the nearest remaining safe body heading;
- if no safe fallback exists, the result is returned as `unplaced` and Markdown stays unchanged;
- failed and running results never create Markdown blocks.

- [ ] **Step 3: Run planner tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-illustration-planner.test.ts
```

Expected: FAIL because planner and insertion functions are missing.

- [ ] **Step 4: Implement deterministic section parsing**

Implement a small Markdown block parser without adding a new dependency:

```ts
type MarkdownSection = {
  heading: string
  headingLevel: number
  occurrence: number
  startLine: number
  endLine: number
  bodyLines: string[]
}
```

Rules:

1. Only H2/H3 body sections are candidates.
2. Reject protected heading patterns and sections containing official contact fields.
3. Reject sections beginning or ending next to an image marker.
4. Score remaining sections by substantive length, concrete nouns/numbers, and distance from already selected anchors.
5. Select up to `count` with deterministic stable sorting.
6. Derive `illustrationId` from a SHA-256 hash of `projectId|articleId|heading|occurrence`, truncated to a URL-safe identifier.

- [ ] **Step 5: Implement server-side prompt construction**

Each planned item prompt must include:

- article title and platform;
- the anchor heading plus a bounded excerpt from that section;
- “single final editorial illustration, no text, no watermark, no logo, no QR code”;
- an instruction to avoid inventing corporate claims, contact information, data, certificates, or people;
- platform ratio and `1k` resolution;
- visual variety based on anchor order so a five-image article does not repeat the same composition.

Do not accept raw prompts from the browser.

- [ ] **Step 6: Implement idempotent insertion**

Use a stable marker:

```md
<!-- geo-article-illustration:ill-1 -->
![企业财税风险识别示意图](/static/geo-article-illustrations/p1/a1/ill-1.png)
```

Sanitize `alt` by removing Markdown delimiters and newlines. Accept only root-relative `/static/geo-article-illustrations/...` image URLs from status results.

- [ ] **Step 7: Run planner tests and verify GREEN**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-illustration-planner.test.ts
```

Expected: 0 failures.

- [ ] **Step 8: Commit planner work**

```powershell
git add lib/geo/article-illustration-planner.ts tests/article-illustration-planner.test.ts
git diff --cached --check
git commit -m "feat: plan and insert GEO article illustrations"
```

---

### Task 3: Add the dedicated FastAPI one-final-image pipeline

**Files:**
- Modify: `main.py`
- Create: `tests/test_article_illustrations.py`

- [ ] **Step 1: Write failing Python contract tests**

Cover:

```py
def test_article_illustration_generate_requires_one_to_five_items(client):
    response = client.post("/api/geo/article-illustrations/generate", json={
        "user_id": 7,
        "project_id": "p1",
        "article_id": "a1",
        "items": [],
    })
    assert response.status_code == 400

def test_article_illustration_status_is_scope_bound(client, submitted_task):
    response = client.get(
        "/api/geo/article-illustrations/status",
        params={
            "taskId": submitted_task,
            "userId": 8,
            "projectId": "p1",
            "articleId": "a1",
        },
    )
    assert response.status_code == 404
```

Add async unit coverage with a fake RunningHub client:

- three planned items launch through the shared semaphore;
- the fake observes no more than six simultaneous calls;
- a transient failure is retried twice and then succeeds;
- a permanent failure marks only that item failed;
- status is `success` when all items succeed and `failed` only when no item succeeds; mixed results return `success` plus `warning`;
- same scoped request/illustration IDs return the existing task rather than starting a duplicate upstream task;
- retry accepts only illustration IDs currently marked failed, resets only those items to queued, and leaves successful items untouched;
- raw upstream/provider text is mapped to “图片生成引擎暂时繁忙，请稍后重试。”

- [ ] **Step 2: Run Python tests and verify RED**

Run:

```powershell
python -m pytest tests/test_article_illustrations.py -q
```

Expected: FAIL because the models and endpoints do not exist.

- [ ] **Step 3: Add cache root, static mount, and Pydantic models**

Add:

```py
GEO_ARTICLE_ILLUSTRATION_CACHE_ROOT = os.path.join(
    _DATA_DIR, "video-cache", "geo-article-illustrations"
)
os.makedirs(GEO_ARTICLE_ILLUSTRATION_CACHE_ROOT, exist_ok=True)
app.mount(
    "/static/geo-article-illustrations",
    _HardenedStaticFiles(
        directory=GEO_ARTICLE_ILLUSTRATION_CACHE_ROOT,
        html=False,
    ),
    name="geo-article-illustrations",
)
```

Models must accept only trusted Next-generated items:

```py
class ArticleIllustrationItemInput(BaseModel):
    illustration_id: str
    anchor_heading: str
    anchor_occurrence: int = 1
    alt: str
    prompt: str
    aspect_ratio: str
    resolution: str = "1k"

class ArticleIllustrationGenerateRequest(BaseModel):
    user_id: int
    project_id: str
    article_id: str
    items: list[ArticleIllustrationItemInput]

class ArticleIllustrationRetryRequest(BaseModel):
    user_id: int
    project_id: str
    article_id: str
    task_id: str
    illustration_ids: list[str]
```

Validate identifier length/charset, item count `1..5`, ratios, `1k`, prompt size, and duplicate illustration IDs. Never use raw IDs directly as unchecked paths.

- [ ] **Step 4: Implement scoped task storage and deduplication**

Use:

```py
_article_illustration_task_store: dict[str, dict] = {}
_article_illustration_pipeline_tasks: dict[str, asyncio.Task] = {}
_article_illustration_request_index: dict[str, str] = {}
_article_illustration_semaphore = asyncio.Semaphore(6)
```

The request key is a hash of `user_id|project_id|article_id|sorted illustration_ids`. Store the full scope on every task and require exact scope equality in status lookup.

- [ ] **Step 5: Reuse the current RunningHub generation primitive**

Extract only the lowest useful behavior from `_generate_image_workbench_candidate` if necessary:

```py
async def _generate_text_image_to_path(
    rh: RunningHubClient,
    *,
    prompt: str,
    aspect_ratio: str,
    resolution: str,
    output_path: str,
) -> None:
    rh_task_id = await rh.submit_text_image(
        prompt=prompt,
        aspect_ratio=aspect_ratio,
        resolution=resolution,
    )
    result = await rh.wait_for_task(rh_task_id)
    remote_url = _pick_first_result_url(result)
    if not remote_url:
        raise RunningHubError("图片生成未返回结果")
    await download_to_path(
        remote_url,
        output_path,
        max_bytes=MAX_REMOTE_IMAGE_BYTES,
        timeout=120.0,
    )
```

Keep the image workbench’s fixed two-candidate behavior unchanged.

- [ ] **Step 6: Implement bounded concurrency and retries**

Each item:

1. enters `_article_illustration_semaphore`;
2. attempts initial generation plus at most two retries;
3. writes to `<cache-root>/<safe-project>/<safe-article>/<illustration-id>.png`;
4. publishes `/static/geo-article-illustrations/<safe-project>/<safe-article>/<illustration-id>.png`;
5. updates item status atomically in the in-memory task record.

Use `asyncio.gather(..., return_exceptions=True)` so one item cannot cancel siblings. Close the shared RunningHub client in `finally`.

Add `POST /api/geo/article-illustrations/retry`. It must:

1. verify the exact user/project/article/task scope;
2. reject IDs that are not part of the task;
3. filter the request to items currently marked `failed`;
4. return the current task unchanged when none remain failed;
5. queue only the filtered items through the same semaphore/retry runner;
6. never regenerate or overwrite successful item results.

- [ ] **Step 7: Run Python tests and verify GREEN**

Run:

```powershell
python -m pytest tests/test_article_illustrations.py -q
python -m pytest tests/test_video_cover.py -q
```

Expected: 0 failures; the existing image/video generation helper behavior remains intact.

- [ ] **Step 8: Commit only reviewed FastAPI hunks**

```powershell
git add -p main.py
git add tests/test_article_illustrations.py
git diff --cached --check
git commit -m "feat: add GEO article illustration pipeline"
```

Because `main.py` already has unrelated edits, inspect every staged hunk before committing.

---

### Task 4: Add authenticated Next.js generate/status/retry routes with stable billing

**Files:**
- Create: `app/api/geo/article-illustrations/generate/route.ts`
- Create: `app/api/geo/article-illustrations/status/route.ts`
- Create: `app/api/geo/article-illustrations/retry/route.ts`
- Create: `tests/article-illustration-route.test.ts`

- [ ] **Step 1: Write failing route contract tests**

Static route tests must verify:

```ts
test("generate validates and authorizes before charging", () => {
  const route = readFileSync(
    "app/api/geo/article-illustrations/generate/route.ts",
    "utf8",
  )
  assert.match(route, /withAuth/)
  assert.match(route, /parseArticleIllustrationGenerateRequest/)
  assert.match(route, /fetchProject/)
  assert.ok(route.indexOf("fetchProject") < route.indexOf("chargeCredit"))
  assert.match(route, /planArticleIllustrations/)
  assert.match(route, /scene:\s*"image_creation"/)
  assert.doesNotMatch(route, /RunningHub|workflowId|modelId/)
})

test("status verifies project ownership and does not charge", () => {
  const route = readFileSync(
    "app/api/geo/article-illustrations/status/route.ts",
    "utf8",
  )
  assert.match(route, /withAuth/)
  assert.match(route, /fetchProject/)
  assert.doesNotMatch(route, /chargeCredit/)
})

test("retry is scoped and reuses stable per-image billing refs", () => {
  const route = readFileSync(
    "app/api/geo/article-illustrations/retry/route.ts",
    "utf8",
  )
  assert.match(route, /withAuth/)
  assert.match(route, /fetchProject/)
  assert.match(route, /failedIllustrationIds/)
  assert.match(route, /geo-article-illustration/)
  assert.doesNotMatch(route, /randomBytes|randomUUID/)
})
```

Add behavioral tests by exporting pure handler factories or injectable helpers:

- nonexistent/unowned project returns `404` before billing;
- zero safe anchors returns `{ taskId: null, items: [] }` without billing or FastAPI submission;
- two planned anchors create exactly two charge calls;
- ref IDs are stable across an identical retry;
- proxy payload contains `user_id` from auth, not the browser;
- a partial prior billing retry does not double-charge successful illustration IDs.
- retry rejects IDs that do not belong to the authenticated task/article and proxies only failed IDs.

- [ ] **Step 2: Run route tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-illustration-route.test.ts
```

Expected: FAIL because the routes are missing.

- [ ] **Step 3: Implement shared project ownership lookup**

Mirror the authenticated project fetch already used by `app/api/geo/articles/batch-generate/route.ts`. If duplication becomes non-trivial, extract:

```ts
export async function fetchOwnedMatrixProject(
  projectId: string,
  cookieHeader: string,
): Promise<MatrixProject | null>
```

to `lib/geo/server-project.ts` and update both routes in the same task with tests. Do not trust `projectId` merely because it exists in article localStorage.

- [ ] **Step 4: Implement generate planning and stable billing**

Flow:

1. parse the strict browser request;
2. fetch the owned matrix project;
3. call `planArticleIllustrations`;
4. if no safe anchors, return a completed empty plan;
5. charge each planned item using:

```ts
refId: [
  "geo-article-illustration",
  userId,
  projectId,
  articleId,
  item.illustrationId,
].join(":")
```

6. submit one FastAPI article task containing all successfully billed planned items;
7. return task ID and normalized planned item metadata.

Do not generate random billing ref IDs. Stable refs are required for navigation/retry idempotency.

- [ ] **Step 5: Implement status scope validation**

Require query parameters `taskId`, `projectId`, and `articleId`. Fetch the owned project before proxying. Pass trusted `userId` plus all scope fields to FastAPI. Normalize all errors through product-safe messages and never forward raw provider output.

- [ ] **Step 6: Implement failed-item-only retry**

The retry route body contains `projectId`, `articleId`, `taskId`, and `failedIllustrationIds`. It must:

1. fetch and authorize the project;
2. query current scoped status;
3. intersect requested IDs with items currently marked `failed`;
4. return current status immediately when the intersection is empty;
5. call `chargeCredit` for each remaining failed ID using the exact same stable ref ID used during initial generation;
6. proxy the filtered list to FastAPI `/api/geo/article-illustrations/retry`.

Do not accept a new prompt, ratio, resolution, model, or workflow from the browser.

- [ ] **Step 7: Run route tests and verify GREEN**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-illustration-route.test.ts
```

Expected: 0 failures.

- [ ] **Step 8: Commit route work**

```powershell
git add app/api/geo/article-illustrations/generate/route.ts app/api/geo/article-illustrations/status/route.ts app/api/geo/article-illustrations/retry/route.ts tests/article-illustration-route.test.ts
git diff --cached --check
git commit -m "feat: proxy and bill GEO article illustrations"
```

---

### Task 5: Build the resilient client API and resume behavior

**Files:**
- Create: `lib/geo/article-illustration-api.ts`
- Create: `tests/article-illustration-api.test.ts`

- [ ] **Step 1: Write failing client tests**

Cover submit serialization:

```ts
assert.deepEqual(JSON.parse(String(captured.body)), {
  projectId: "p1",
  articleId: "a1",
  platformId: "zhihu",
  title: "标题",
  markdown: "## 风险识别\n正文",
  illustrationCount: 2,
})
```

Cover polling:

- `queued -> running -> mixed terminal` returns all successful and failed items;
- network `TypeError`, `502`, `503`, and `504` are retried with bounded backoff;
- `404` is terminal and is not retried;
- timeout throws a resumable timeout type containing `taskId`, `projectId`, and `articleId`;
- an `AbortSignal` stops local polling without cancelling the backend task;
- `onUpdate` receives every normalized snapshot for persistence/UI;
- provider/model fields in an unexpected response are discarded.

- [ ] **Step 2: Run client tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-illustration-api.test.ts
```

Expected: FAIL because the client module is missing.

- [ ] **Step 3: Implement submit and status calls**

Expose:

```ts
submitArticleIllustrationTask(input, fetcher?)
queryArticleIllustrationStatus(scope, fetcher?)
retryFailedArticleIllustrations(scope, failedIllustrationIds, fetcher?)
waitForArticleIllustrationResult(scope, options?)
```

All calls use `credentials: "include"`. Status query includes all scope fields. Parse status with the shared normalizer, only allow expected product fields, and reject non-root-relative illustration URLs.

- [ ] **Step 4: Implement resumable polling**

Use a default interval around two seconds and an upper timeout that is shorter than the UI’s stale-task threshold. Transient status errors retry without mutating backend state. A local timeout must retain the task snapshot so re-entering the page resumes status lookup instead of creating another task.

`retryFailedArticleIllustrations` sends only project/article/task scope and failed IDs. It then resumes polling the same task ID; it never resubmits article Markdown or completed illustration items.

- [ ] **Step 5: Run client tests and verify GREEN**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-illustration-api.test.ts
```

Expected: 0 failures.

- [ ] **Step 6: Commit client API**

```powershell
git add lib/geo/article-illustration-api.ts tests/article-illustration-api.test.ts
git diff --cached --check
git commit -m "feat: add resumable GEO illustration client"
```

---

### Task 6: Add the approved UI control and batch calculation

**Files:**
- Modify: `components/geo/article/geo-article-batch-panel.tsx`
- Create or modify: `tests/article-illustration-ui.test.ts`

- [ ] **Step 1: Write failing UI source tests**

Verify:

- label text contains `每篇插图`;
- input has min `0`, max `ARTICLE_ILLUSTRATIONS_MAX`, and an accessible label;
- state defaults to `0`;
- restored config is clamped;
- config passed to `onBatchComplete` includes `illustrationsPerArticle`;
- article callback can see the selected count;
- no model/provider/workflow selector or supplier name is introduced.

Use source-level tests consistent with the project’s current UI test style unless a React DOM harness already exists.

- [ ] **Step 2: Run UI test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-illustration-ui.test.ts
```

Expected: FAIL because the approved control is absent.

- [ ] **Step 3: Add the two-column parameter layout**

Replace the single count block with:

```tsx
<div className="mb-3 grid gap-3 sm:grid-cols-2">
  <NumberStepper
    label="每组合篇数"
    min={1}
    max={ARTICLE_BATCH_COPIES_PER_SLOT_MAX}
    value={copiesPerSlot}
    disabled={generating}
    onChange={setCopiesPerSlot}
  />
  <NumberStepper
    label="每篇插图"
    hint="0–5 张，文章完成后自动生成并插入"
    min={0}
    max={ARTICLE_ILLUSTRATIONS_MAX}
    value={illustrationsPerArticle}
    disabled={generating}
    onChange={setIllustrationsPerArticle}
  />
</div>
```

Reuse existing visual tokens. If extracting a local `NumberStepper` component, keep it in the same file unless another page already has a shared production component.

- [ ] **Step 4: Restore and report the value**

When project/config changes:

```ts
setIllustrationsPerArticle(
  clampIllustrationsPerArticle(
    loadArticleBatch(projectId).lastConfig?.illustrationsPerArticle ?? 0,
  ),
)
```

Generation summary examples:

- `将生成 8 篇文章`
- `将生成 8 篇文章，并自动生成最多 24 张插图`

The button remains a single article creation action; do not add a separate image-generation confirmation.

- [ ] **Step 5: Pass count with successful articles**

Change the callback contract to:

```ts
onArticle: (
  article: GeneratedArticle,
  options: { illustrationsPerArticle: number },
) => void
```

Ensure `onArticle` fires only once per `job_done`. The current panel forwards the same article both from the SSE event handler and through `startBatchGenerate({ onArticle })`; remove the duplicate path while making this change.

- [ ] **Step 6: Run UI and existing batch tests**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-illustration-ui.test.ts tests/article-batch-api.test.ts tests/article-batch-jobs.test.ts
```

Expected: 0 failures.

- [ ] **Step 7: Commit UI control work**

```powershell
git add -p components/geo/article/geo-article-batch-panel.tsx
git add tests/article-illustration-ui.test.ts
git diff --cached --check
git commit -m "feat: add GEO article illustration count control"
```

---

### Task 7: Orchestrate generation, insertion, persistence, and retry in the editor

**Files:**
- Modify: `components/geo-article-editor-view.tsx`
- Modify: `components/geo/article/geo-article-doc-grid.tsx`
- Create: `tests/article-illustration-editor.test.ts`

- [ ] **Step 1: Write failing orchestration tests**

Extract pure orchestration helpers where needed and test:

- a successful article with count `0` never submits an illustration task;
- count `3` submits exactly one article-level task with count `3`;
- the returned task snapshot is persisted before polling starts;
- successful status items are inserted into the latest Markdown and stored once;
- switching to another matrix project aborts only local polling and prevents late results from mutating the visible project;
- returning to the original project resumes the existing task ID;
- article failure never calls the illustration API;
- retry sends only failed illustration IDs to the dedicated retry route; completed IDs are never included, billed again, regenerated, or overwritten.

- [ ] **Step 2: Run editor test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-illustration-editor.test.ts
```

Expected: FAIL because orchestration is not connected.

- [ ] **Step 3: Submit after each article success**

In `handleArticleDone`:

1. merge and persist the text article first;
2. return immediately when count is `0`;
3. add an initial task snapshot to the same article;
4. call `submitArticleIllustrationTask`;
5. persist the real `taskId` before beginning status polling.

Do not make the batch SSE wait for image completion. Text article cards should appear immediately.

- [ ] **Step 4: Track polling by project and task**

Use refs/maps:

```ts
const illustrationPollersRef = React.useRef<
  Map<string, AbortController>
>(new Map())
```

Key by `projectId:articleId:taskId`. On project change/unmount, abort local fetches. On project load, scan `loadArticleBatch(project.id).articles` for non-terminal task snapshots and resume them.

Before every state write, assert:

```ts
if (article.projectId !== selectedProjectIdRef.current) {
  persistOnly(article)
  return
}
```

This prevents a late task from another project repainting the active grid.

- [ ] **Step 5: Insert each successful update idempotently**

On every status snapshot:

1. load the newest stored article by ID;
2. call `applyArticleIllustrations(latest.markdown, snapshot.items)`;
3. merge `illustrations`, `illustrationTask`, and updated Markdown;
4. `upsertArticle` under its project ID;
5. update visible editor/grid only when that project is active.

This preserves user edits made while images were generating.

- [ ] **Step 6: Add non-blocking progress and retry UI**

Article card status examples:

- `插图 1/3 生成中`
- `插图 3/3 已插入`
- `2 张已插入，1 张待重试`

Use a small secondary status row/icon. Article status remains `success`; do not turn the entire document card red when one illustration fails. Show “重试插图” only for failed items. Normal automatic retries remain silent.

- [ ] **Step 7: Keep manual insertion compatible**

The existing editor upload inserts ordinary Markdown image syntax. Generated images use HTML markers. Ensure editor autosave preserves both and preview/export render both. Do not replace data URLs or upload behavior in this feature.

- [ ] **Step 8: Run editor and store tests**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/article-illustration-editor.test.ts tests/article-illustration-planner.test.ts tests/article-batch-store.test.ts
```

Expected: 0 failures.

- [ ] **Step 9: Commit editor orchestration**

```powershell
git add -p components/geo-article-editor-view.tsx components/geo/article/geo-article-doc-grid.tsx
git add tests/article-illustration-editor.test.ts
git diff --cached --check
git commit -m "feat: orchestrate GEO article auto illustrations"
```

---

### Task 8: Document operations and run regression gates

**Files:**
- Modify: `AGENTS.md`
- Modify tests only if a verified regression reveals a missing assertion.

- [ ] **Step 1: Document the operational contract**

Add a compact section under the existing GEO/image workbench notes:

- setting location and `0..5` default/range;
- dedicated `/api/geo/article-illustrations/*` route;
- server-side prompt/ratio selection;
- global concurrency `6`, retries `2`;
- cache root and public URL;
- project/user/article isolation;
- image workbench remains fixed at two candidates;
- provider/model names are forbidden in browser UI/errors.

Do not add new environment variables; reuse `RUNNINGHUB_API_KEY`.

- [ ] **Step 2: Run the complete focused Node suite**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test `
  tests/article-illustration-types.test.ts `
  tests/article-illustration-planner.test.ts `
  tests/article-illustration-api.test.ts `
  tests/article-illustration-route.test.ts `
  tests/article-illustration-ui.test.ts `
  tests/article-illustration-editor.test.ts `
  tests/article-batch-api.test.ts `
  tests/article-batch-jobs.test.ts `
  tests/article-batch-store.test.ts `
  tests/image-workbench-api.test.ts `
  tests/image-workbench-route.test.ts `
  tests/image-workbench-types.test.ts
```

Expected: 0 failures.

- [ ] **Step 3: Run Python regressions**

Run:

```powershell
python -m pytest tests/test_article_illustrations.py tests/test_video_cover.py tests/test_credit.py tests/test_credit_pricing.py -q
```

Expected: 0 failures.

- [ ] **Step 4: Run type and production build gates**

Run:

```powershell
npx tsc --noEmit
pnpm build
```

Expected: both commands exit `0`. If the repository has pre-existing unrelated failures, record the exact baseline error, prove no new feature-file diagnostics, and still fix every failure introduced by this feature.

- [ ] **Step 5: Run browser smoke tests**

Start the dual service:

```powershell
pnpm dev:all
```

Verify in the real browser:

1. Open GEO → 深度优化文章创作.
2. Select project A; set each-combination count `1` and each-article illustrations `3`.
3. Confirm summary shows article count plus maximum image count.
4. Start creation; leave the page while text or images are running.
5. Return and confirm article/image progress resumes without a duplicate task.
6. Confirm completed images appear after ordinary body sections, never in contact/FAQ/conclusion/tag areas.
7. Confirm there is exactly one final image per anchor and no candidate picker.
8. Switch to project B and confirm project A’s articles/tasks do not appear.
9. Switch back to project A and confirm persisted images/tasks return.
10. Set count `0`, create another article, and confirm no illustration API request occurs.
11. Simulate one image failure and confirm the article remains usable with a non-blocking retry control.
12. Confirm the browser UI/network error text does not expose supplier, model, workflow, endpoint ID, or key names.

- [ ] **Step 6: Verify billing and deduplication**

For one article with three planned images:

- observe exactly three `image_creation` ledger entries;
- reload and resume status, observing zero additional charges;
- invoke retry on one failed illustration, observing at most one new charge only if the existing idempotent charge was never completed;
- confirm completed illustration IDs are not resubmitted.

- [ ] **Step 7: Final diff and secret scan**

Run:

```powershell
git diff --check
git diff --name-only
rg -n "RUNNINGHUB_API_KEY=|sk-[A-Za-z0-9_-]{12,}|workflow[_-]?id" `
  app/api/geo lib/geo components/geo main.py tests AGENTS.md
```

Expected: no whitespace errors, no secrets, and no browser-visible workflow/provider identifiers.

- [ ] **Step 8: Commit documentation and any final verified fixes**

```powershell
git add -p AGENTS.md
git diff --cached --check
git commit -m "docs: document GEO article illustrations"
```

---

## Completion criteria

- The approved selector is present in the approved position, defaults to `0`, restores by project, and accepts only `0..5`.
- Text generation is not blocked by image generation, and navigation does not lose either stage’s task state.
- Every planned anchor gets at most one final generated image and the image workbench still produces two candidates.
- Server-side plans avoid protected article regions and insert idempotent Markdown markers into the latest article revision.
- FastAPI enforces one article task per stable request, a global concurrency cap of six, bounded retries, scoped status lookup, and safe cache paths.
- Billing is one stable `image_creation` charge per planned illustration with no duplicate charge on resume.
- Mixed image results preserve the article and provide a targeted retry path.
- Project A and project B article/image state remain isolated in storage, UI, backend status, and cache paths.
- UI/errors contain no model, provider, workflow, endpoint, or secret identifiers.
- Focused Node/Python suites, TypeScript, production build, and browser smoke checks pass or have explicitly recorded pre-existing unrelated baselines.

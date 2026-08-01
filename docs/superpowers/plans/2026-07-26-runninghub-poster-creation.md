# RunningHub Poster Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unfinished Ark-based poster workspace with a modular RunningHub G-2 poster generator that creates two candidates and supports square plus paired portrait/landscape ratios.

**Architecture:** Keep poster domain types, prompt construction, browser API calls, and UI sections under dedicated poster modules. Add a poster-specific Next.js proxy and FastAPI task pipeline while reusing `RunningHubClient` authentication, polling, error parsing, and local media caching; do not reuse the video-cover task store.

**Tech Stack:** Next.js App Router, React, TypeScript, FastAPI, Pydantic, Python asyncio, RunningHub OpenAPI v2, node:test, pytest.

---

## File structure

- Create `lib/poster/types.ts`: ratio-family, orientation, resolution, submit/status types, and ratio resolution.
- Modify `lib/poster/prompt.ts`: generate the final Chinese poster prompt from typed inputs.
- Create `lib/poster/api.ts`: submit and poll the poster FastAPI proxy with bounded polling.
- Create `components/poster/poster-creation-form.tsx`: text, style, ratio, orientation, and submit controls.
- Create `components/poster/poster-ratio-selector.tsx`: ratio-family and orientation UI only.
- Create `components/poster/poster-result-gallery.tsx`: empty/running/failed/result states and downloads.
- Modify `components/poster-creation-workspace.tsx`: state orchestration and child-component composition only.
- Create `app/api/poster/generate/route.ts`: authenticated, charged POST proxy.
- Create `app/api/poster/status/route.ts`: authenticated GET proxy.
- Modify `lib/runninghub_client.py`: RunningHub G-2 text-to-image submission.
- Modify `main.py`: poster task models, isolated stores, background pipeline, cache mount, submit/status routes.
- Modify `lib/credit-pricing/registry.ts`, `lib/api_auth.py`, and related pricing tests: name the poster charge explicitly while retaining the existing 20-credit image price.
- Modify `AGENTS.md`: replace the obsolete Ark poster contract with the RunningHub poster contract.

### Task 1: Poster domain contract and prompt

**Files:**
- Create: `lib/poster/types.ts`
- Modify: `lib/poster/prompt.ts`
- Modify: `tests/poster-prompt.test.ts`
- Create: `tests/poster-types.test.ts`

- [ ] **Step 1: Write failing ratio-resolution tests**

```ts
import assert from "node:assert/strict"
import test from "node:test"
import { resolvePosterAspectRatio } from "@/lib/poster/types"

test("resolves portrait and landscape variants", () => {
  assert.equal(resolvePosterAspectRatio("3:4", "portrait"), "3:4")
  assert.equal(resolvePosterAspectRatio("3:4", "landscape"), "4:3")
  assert.equal(resolvePosterAspectRatio("9:16", "landscape"), "16:9")
  assert.equal(resolvePosterAspectRatio("9:25", "portrait"), "9:25")
  assert.equal(resolvePosterAspectRatio("9:25", "landscape"), "25:9")
})

test("square ignores orientation", () => {
  assert.equal(resolvePosterAspectRatio("1:1", "portrait"), "1:1")
  assert.equal(resolvePosterAspectRatio("1:1", "landscape"), "1:1")
})
```

- [ ] **Step 2: Run the ratio test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/poster-types.test.ts
```

Expected: FAIL because `lib/poster/types.ts` does not exist.

- [ ] **Step 3: Implement the typed ratio contract**

```ts
export const POSTER_RATIO_FAMILIES = ["1:1", "3:4", "9:16", "9:25"] as const
export type PosterRatioFamily = (typeof POSTER_RATIO_FAMILIES)[number]
export type PosterOrientation = "portrait" | "landscape"
export type PosterAspectRatio = "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "9:25" | "25:9"

const LANDSCAPE_RATIO: Record<PosterRatioFamily, PosterAspectRatio> = {
  "1:1": "1:1",
  "3:4": "4:3",
  "9:16": "16:9",
  "9:25": "25:9",
}

export function resolvePosterAspectRatio(
  family: PosterRatioFamily,
  orientation: PosterOrientation,
): PosterAspectRatio {
  return orientation === "landscape" ? LANDSCAPE_RATIO[family] : family
}
```

- [ ] **Step 4: Rewrite the prompt test before implementation**

Assert that the prompt includes purpose, headline, optional body, style, resolved ratio, landscape/portrait composition, and Chinese typography safeguards; assert that whitespace-only optional body is omitted.

- [ ] **Step 5: Run the prompt test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/poster-prompt.test.ts
```

Expected: FAIL because the old prompt input has no typed orientation contract or composition instruction.

- [ ] **Step 6: Implement `buildPosterPrompt`**

Use a pure function accepting `purpose`, `headline`, `body`, `style`, `aspectRatio`, and `orientation`. Trim all user values and join non-empty lines. The final requirement line must include `中文文字准确、信息层级清晰、无水印、无二维码、无虚构品牌标志`.

- [ ] **Step 7: Run both domain tests and verify GREEN**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/poster-types.test.ts tests/poster-prompt.test.ts
```

Expected: 0 failures.

### Task 2: RunningHub G-2 text-to-image client

**Files:**
- Modify: `lib/runninghub_client.py`
- Modify: `tests/test_video_cover.py`

- [ ] **Step 1: Write the failing endpoint/payload test**

```python
def test_submit_poster_image_uses_runninghub_text_to_image_payload():
    rh_client = RunningHubClient("test-api-key")
    http_client = AsyncMock()
    http_client.post.return_value = SimpleNamespace(
        is_success=True,
        json=lambda: {"taskId": "poster-rh-1"},
    )
    rh_client._client = http_client

    task_id = asyncio.run(
        rh_client.submit_text_image(
            prompt="商业海报",
            aspect_ratio="25:9",
            resolution="2k",
        )
    )

    assert task_id == "poster-rh-1"
    assert http_client.post.call_args.args[0].endswith(
        "/openapi/v2/rhart-image-g-2/text-to-image"
    )
    assert http_client.post.call_args.kwargs["json"] == {
        "prompt": "商业海报",
        "aspectRatio": "25:9",
        "resolution": "2k",
    }
```

- [ ] **Step 2: Run the client test and verify RED**

Run:

```powershell
python -m pytest tests/test_video_cover.py::test_submit_poster_image_uses_runninghub_text_to_image_payload -v
```

Expected: FAIL with missing `submit_text_image`.

- [ ] **Step 3: Implement minimal RunningHub method**

Add `TEXT_IMAGE_ENDPOINT = "/rhart-image-g-2/text-to-image"` and an async `submit_text_image` method beside `submit_cover_image`. Reuse `_get_client()` and `_build_http_error()`, return `taskId`, and raise `RunningHubError` for transport errors or missing task IDs.

- [ ] **Step 4: Verify the client tests GREEN**

Run:

```powershell
python -m pytest tests/test_video_cover.py -v
```

Expected: all cover and text-image tests pass.

### Task 3: FastAPI poster task pipeline

**Files:**
- Modify: `main.py`
- Create: `tests/test_poster_generation.py`

- [ ] **Step 1: Write failing validation and submission tests**

Create tests that:

- POST a prompt with `aspect_ratio="9:25"`, `resolution="2k"`, `count=2`.
- Assert response task ID starts with `poster_`.
- Assert invalid ratio returns 400.
- Assert empty prompt returns 400.
- Assert count other than 2 is normalized or rejected consistently; use fixed count 2 for the UI contract.

Patch `main.asyncio.create_task` with a side effect that closes the coroutine so the submission test does not leak work.

- [ ] **Step 2: Run submit tests and verify RED**

Run:

```powershell
python -m pytest tests/test_poster_generation.py -k "submit or rejects" -v
```

Expected: FAIL because the routes and stores do not exist.

- [ ] **Step 3: Add isolated poster models, stores, and static mount**

Add:

```python
POSTER_ASPECT_RATIOS = {"1:1", "3:4", "4:3", "9:16", "16:9", "9:25", "25:9"}
POSTER_CACHE_ROOT = os.path.join(_DATA_DIR, "video-cache", "posters")
_poster_task_store: dict[str, dict] = {}
_poster_pipeline_tasks: dict[str, asyncio.Task] = {}
```

Create the directory and mount it at `/static/posters`. Define `PosterGenerateRequest`, `PosterSubmitResponse`, and `PosterStatusResponse`, where status returns `image_urls`, `warning`, `error`, and `stage_label`.

- [ ] **Step 4: Add submit/status routes**

Implement `POST /api/poster/generate` with server-side prompt, ratio, resolution, and count validation. Store a queued task and schedule `_run_poster_pipeline`.

Implement `GET /api/poster/status?posterTaskId=...` and return 400 for an empty ID and 404 for an unknown task.

- [ ] **Step 5: Verify submission/status tests GREEN**

Run:

```powershell
python -m pytest tests/test_poster_generation.py -k "submit or rejects or status" -v
```

Expected: 0 failures.

- [ ] **Step 6: Write failing pipeline tests**

Use an async fake RunningHub client with two generated task IDs. Cover:

- both candidates succeed and download to `poster_id-1.png` / `poster_id-2.png`;
- one succeeds and one fails, resulting in `success` with one URL and a warning;
- both fail, resulting in `failed`;
- `close()` is always awaited.

- [ ] **Step 7: Run pipeline tests and verify RED**

Run:

```powershell
python -m pytest tests/test_poster_generation.py -k "pipeline" -v
```

Expected: FAIL because `_run_poster_pipeline` is missing.

- [ ] **Step 8: Implement concurrent two-candidate generation**

Inside `_run_poster_pipeline`, obtain one RunningHub client, submit two tasks using `asyncio.gather`, wait for each task concurrently, extract the first valid URL, download successful results, and update the local task only after at least one local file exists. Use `return_exceptions=True` so one candidate does not discard the other.

- [ ] **Step 9: Run the complete Python poster test GREEN**

Run:

```powershell
python -m pytest tests/test_poster_generation.py tests/test_video_cover.py -v
```

Expected: 0 failures.

### Task 4: Authenticated Next.js proxy and billing

**Files:**
- Create: `app/api/poster/generate/route.ts`
- Create: `app/api/poster/status/route.ts`
- Modify: `lib/credit-pricing/registry.ts`
- Modify: `lib/api_auth.py`
- Modify: `tests/credit-pricing.test.ts`
- Modify: `tests/test_api_auth.py`
- Create: `tests/poster-route.test.ts`

- [ ] **Step 1: Write failing billing registry assertions**

Assert `sceneCost("poster_image") === 20` in TypeScript and that Python `SCENE_COST_TABLE["poster_image"] == 20`. Keep `ai_ark_image` at 20 for existing callers.

- [ ] **Step 2: Run billing tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/credit-pricing.test.ts
python -m pytest tests/test_api_auth.py -k poster -v
```

Expected: FAIL because `poster_image` is absent.

- [ ] **Step 3: Add the fixed poster price**

Add `poster_image: 20` to the TypeScript fixed scene registry and `"poster_image": 20` to Python `SCENE_COST_TABLE`. Do not rename or remove `ai_ark_image`.

- [ ] **Step 4: Write failing route source-contract tests**

Assert:

- POST route uses `withAuth`, `chargeCredit`, scene `poster_image`, and proxies to `/api/poster/generate`;
- status route uses `withAuth` and proxies the query string to `/api/poster/status`;
- neither route references Ark environment variables.

- [ ] **Step 5: Run the route test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/poster-route.test.ts
```

Expected: FAIL because the routes do not exist.

- [ ] **Step 6: Implement routes**

The POST route must parse the authenticated request once, charge a unique `poster-image:${userId}:${crypto.randomBytes(8).toString("hex")}` reference, rebuild a JSON `Request`, and then call `proxyToFastapi`. The GET status route requires authentication but does not charge.

- [ ] **Step 7: Run billing and route tests GREEN**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/credit-pricing.test.ts tests/poster-route.test.ts
python -m pytest tests/test_api_auth.py -k "scene or poster" -v
```

Expected: 0 failures.

### Task 5: Browser API and modular poster workspace

**Files:**
- Create: `lib/poster/api.ts`
- Create: `components/poster/poster-ratio-selector.tsx`
- Create: `components/poster/poster-creation-form.tsx`
- Create: `components/poster/poster-result-gallery.tsx`
- Modify: `components/poster-creation-workspace.tsx`
- Modify: `tests/poster-creation-view.test.ts`
- Create: `tests/poster-api.test.ts`

- [ ] **Step 1: Write failing browser API tests**

Inject a fake `fetch` into `submitPosterGeneration` and `queryPosterStatus`. Assert snake-case payload fields, customer-facing API errors, and bounded polling termination.

- [ ] **Step 2: Run API tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/poster-api.test.ts
```

Expected: FAIL because `lib/poster/api.ts` does not exist.

- [ ] **Step 3: Implement typed browser API**

Provide:

```ts
submitPosterGeneration(input): Promise<{ poster_task_id: string }>
queryPosterStatus(posterTaskId): Promise<PosterStatusResponse>
waitForPosterResult(posterTaskId, options): Promise<PosterStatusResponse>
```

Use `/api/poster/generate`, `/api/poster/status`, `parseApiErrorResponse`, an abortable delay, and a default ten-minute timeout.

- [ ] **Step 4: Verify browser API tests GREEN**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/poster-api.test.ts
```

Expected: 0 failures.

- [ ] **Step 5: Rewrite the view contract test before UI code**

Assert that:

- workspace imports the new poster form/gallery/API modules;
- no file under the poster workspace references `callArkImagesGeneration`;
- ratios include `1:1`, `3:4`, `9:16`, `9:25`;
- ratio selector includes portrait/landscape controls;
- result gallery uses dynamic `aspectRatio`, `object-contain`, and download links;
- business-assistant registry still has no poster assistant.

- [ ] **Step 6: Run the view test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/poster-creation-view.test.ts
```

Expected: FAIL because the old monolithic Ark workspace is still present.

- [ ] **Step 7: Implement `PosterRatioSelector`**

Render four ratio-family buttons and portrait/landscape buttons. Hide the direction switch for `1:1`. Expose only typed callbacks; do not perform network calls.

- [ ] **Step 8: Implement `PosterCreationForm`**

Render purpose, required headline, optional body, style chips, ratio selector, resolution selector, current error, and submit button. Disable submit while loading or when the trimmed headline is empty.

- [ ] **Step 9: Implement `PosterResultGallery`**

Render:

- empty-state copy before submission;
- spinner and `stage_label` while queued/running;
- retryable error state;
- one or two figures after success;
- `style={{ aspectRatio: ratio.replace(":", " / ") }}` with `object-contain`;
- a warning when only one candidate succeeded;
- per-image download/open links.

- [ ] **Step 10: Refactor the workspace into orchestration**

Keep form values and generation state in `PosterCreationWorkspace`. Build the prompt, resolve the actual aspect ratio, submit one local task requesting two candidates, wait for terminal status, and pass display state to the gallery. Preserve the existing gradient hero and two-column desktop layout while stacking sections on smaller screens.

- [ ] **Step 11: Run UI/API tests GREEN**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/poster-api.test.ts tests/poster-types.test.ts tests/poster-prompt.test.ts tests/poster-creation-view.test.ts tests/business-assistant-registry.test.ts
```

Expected: 0 failures.

### Task 6: Operations contract and full verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-07-26-runninghub-poster-creation.md`

- [ ] **Step 1: Update the operations contract**

Replace the Ark-specific poster statement with:

```markdown
- 海报图创作复用 `RUNNINGHUB_API_KEY`，通过独立 `/api/poster/*` 接口调用 RunningHub G-2 文生图；不注册业务助理，不新增环境变量。
```

- [ ] **Step 2: Run focused TypeScript tests**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/poster-api.test.ts tests/poster-types.test.ts tests/poster-prompt.test.ts tests/poster-creation-view.test.ts tests/poster-route.test.ts tests/credit-pricing.test.ts tests/business-assistant-registry.test.ts
```

Expected: 0 failures.

- [ ] **Step 3: Run focused Python tests**

Run:

```powershell
python -m pytest tests/test_poster_generation.py tests/test_video_cover.py tests/test_api_auth.py -v
```

Expected: 0 failures.

- [ ] **Step 4: Run TypeScript type checking**

Run:

```powershell
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 5: Run the relevant broader suites**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/
python -m pytest tests/ -q
```

Record unrelated pre-existing failures separately; do not label the feature complete unless all poster-focused tests and type checking pass.

- [ ] **Step 6: Inspect the final diff and requirement checklist**

Run:

```powershell
git diff --check
git status --short
git diff -- components/poster-creation-workspace.tsx components/poster lib/poster app/api/poster lib/runninghub_client.py main.py lib/credit-pricing/registry.ts lib/api_auth.py AGENTS.md tests/poster-creation-view.test.ts tests/poster-prompt.test.ts tests/poster-types.test.ts tests/poster-api.test.ts tests/poster-route.test.ts tests/test_poster_generation.py tests/test_video_cover.py
```

Confirm every modified task file belongs to the poster scope and that unrelated dirty-worktree changes remain untouched.

# RunningHub Image Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the existing poster generator into a two-section image workbench with modular poster and general-image strategies, shared RunningHub text/image generation, distinct reference-image behavior, and mode-specific cloud billing.

**Architecture:** Introduce a shared `lib/image-workbench` domain and generic `/api/image-workbench/*` task pipeline. Poster and general-image panels provide separate templates, prompt builders, and reference policies while sharing ratio, upload, polling, result, and RunningHub infrastructure; existing `/api/poster/*` routes remain compatibility adapters.

**Tech Stack:** Next.js App Router, React, TypeScript, FastAPI, Pydantic, Python asyncio, RunningHub OpenAPI v2, node:test, pytest.

---

## File map

- Create `lib/image-workbench/types.ts`: shared modes, ratios, reference types, request validation, and status types.
- Create `lib/image-workbench/strategies.ts`: mode metadata, template lists, limits, and billing scenes.
- Create `lib/image-workbench/poster-prompt.ts`: poster prompt builder with role-aware references.
- Create `lib/image-workbench/image-prompt.ts`: general-image prompt builder and reference modes.
- Create `lib/image-workbench/reference-images.ts`: browser file validation and base64 payload conversion.
- Create `lib/image-workbench/api.ts`: generic submit/query/poll client.
- Create `components/image-workbench/*`: workbench shell, tabs, two business panels, shared uploader, ratio selector, and gallery.
- Modify `components/poster-creation-workspace.tsx`: compatibility re-export only.
- Create `app/api/image-workbench/generate/route.ts` and `status/route.ts`: authenticated proxy and mode-specific charge.
- Modify `lib/runninghub_client.py`: generic G-2 image-to-image method while retaining the cover wrapper.
- Modify `main.py`: generic image-workbench task store, reference upload, endpoint selection, and poster adapters.
- Modify navigation/search files to rename the entry to “图片工作台”.
- Modify pricing registries and cloud error mapping for `image_creation`.
- Modify `AGENTS.md` with the new operational contract.

### Task 1: Shared domain types and mode strategies

**Files:**
- Create: `lib/image-workbench/types.ts`
- Create: `lib/image-workbench/strategies.ts`
- Create: `tests/image-workbench-types.test.ts`

- [ ] **Step 1: Write failing mode, ratio, and validation tests**

```ts
import assert from "node:assert/strict"
import test from "node:test"

import {
  parseImageWorkbenchRequest,
  resolveImageAspectRatio,
} from "@/lib/image-workbench/types"
import { IMAGE_WORKBENCH_STRATEGIES } from "@/lib/image-workbench/strategies"

test("resolves portrait and landscape ratios", () => {
  assert.equal(resolveImageAspectRatio("9:25", "portrait"), "9:25")
  assert.equal(resolveImageAspectRatio("9:25", "landscape"), "25:9")
  assert.equal(resolveImageAspectRatio("1:1", "landscape"), "1:1")
})

test("validates mode-specific reference limits", () => {
  const poster = parseImageWorkbenchRequest({
    mode: "poster",
    prompt: "海报",
    aspect_ratio: "3:4",
    resolution: "2k",
    count: 2,
    reference_images: [
      { role: "subject", mime_type: "image/png", data_base64: "YQ==" },
      { role: "style", mime_type: "image/jpeg", data_base64: "Yg==" },
    ],
  })
  assert.equal(poster.reference_images.length, 2)

  assert.throws(
    () =>
      parseImageWorkbenchRequest({
        ...poster,
        mode: "image",
        reference_images: Array.from({ length: 5 }, () => ({
          role: "general",
          mime_type: "image/webp",
          data_base64: "YQ==",
        })),
      }),
    /最多添加 4 张参考图/,
  )
})

test("declares distinct billing scenes", () => {
  assert.equal(IMAGE_WORKBENCH_STRATEGIES.poster.billingScene, "poster_image")
  assert.equal(IMAGE_WORKBENCH_STRATEGIES.image.billingScene, "image_creation")
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-types.test.ts
```

Expected: FAIL because the shared domain files do not exist.

- [ ] **Step 3: Implement the shared types**

Define:

```ts
export type ImageWorkbenchMode = "poster" | "image"
export type ImageOrientation = "portrait" | "landscape"
export type ImageRatioFamily = "1:1" | "3:4" | "9:16" | "9:25"
export type ImageAspectRatio =
  | "1:1" | "3:4" | "4:3" | "9:16" | "16:9" | "9:25" | "25:9"
export type ImageResolution = "1k" | "2k"
export type ReferenceRole = "subject" | "style" | "general"
export type ReferenceMode = "preserve_subject" | "style_only" | "remix"
```

`parseImageWorkbenchRequest` must trim the prompt, require count `2`, validate the seven aspect ratios, validate MIME types, strip data-URL prefixes, reject empty base64, allow at most two references for `poster` and four for `image`, require poster roles to be `subject` or `style`, and normalize general-image roles to `general`.

- [ ] **Step 4: Implement the strategy registry**

```ts
export const IMAGE_WORKBENCH_STRATEGIES = {
  poster: {
    label: "海报图创作",
    billingScene: "poster_image",
    maxReferences: 2,
    templates: ["品牌宣传", "活动促销", "新品发布", "知识海报"],
  },
  image: {
    label: "图片创作",
    billingScene: "image_creation",
    maxReferences: 4,
    templates: ["电商主图", "人物写真", "场景设计", "社媒配图", "自由创作"],
  },
} as const
```

- [ ] **Step 5: Run domain tests and verify GREEN**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-types.test.ts
```

Expected: 0 failures.

### Task 2: Business prompt strategies

**Files:**
- Create: `lib/image-workbench/poster-prompt.ts`
- Create: `lib/image-workbench/image-prompt.ts`
- Create: `tests/image-workbench-prompts.test.ts`

- [ ] **Step 1: Write failing prompt tests**

```ts
test("poster prompt explains reference roles in stable order", () => {
  const prompt = buildPosterWorkbenchPrompt({
    template: "品牌宣传",
    purpose: "门店引流",
    headline: "夏日上新",
    body: "到店体验",
    style: "高级简约",
    aspectRatio: "3:4",
    orientation: "portrait",
    referenceRoles: ["subject", "style"],
  })
  assert.match(prompt, /第 1 张参考图是商品或主体图/)
  assert.match(prompt, /第 2 张参考图是风格参考图/)
  assert.match(prompt, /不要复制参考图中的文字/)
})

test("general image prompt maps reference modes", () => {
  const prompt = buildGeneralImagePrompt({
    template: "人物写真",
    description: "城市夜景中的女性半身照",
    requirements: "自然肤质",
    aspectRatio: "9:16",
    orientation: "portrait",
    referenceMode: "preserve_subject",
    referenceCount: 2,
  })
  assert.match(prompt, /保持参考图中的人物身份特征/)
  assert.match(prompt, /自然肤质/)
})
```

- [ ] **Step 2: Run the prompt test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-prompts.test.ts
```

Expected: FAIL because both prompt builders are missing.

- [ ] **Step 3: Implement poster prompts**

Map each poster template to a short instruction block. Always include purpose, headline, optional body, style, aspect ratio, orientation, accurate Chinese typography, hierarchy, whitespace, no watermark/QR code/fabricated logo, and role-aware reference instructions.

- [ ] **Step 4: Implement general-image prompts**

Map templates to:

- `电商主图`: clean commercial product focus and controlled lighting.
- `人物写真`: identity consistency, natural skin, and photographic light.
- `场景设计`: spatial structure, material, and light.
- `社媒配图`: strong focal point, mobile readability, and negative space.
- `自由创作`: quality and safety constraints only.

Map reference modes to distinct Chinese instructions. Omit all reference language when `referenceCount` is zero.

- [ ] **Step 5: Run prompt tests and verify GREEN**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-prompts.test.ts
```

Expected: 0 failures.

### Task 3: Browser reference-image conversion

**Files:**
- Create: `lib/image-workbench/reference-images.ts`
- Create: `tests/image-workbench-reference-images.test.ts`
- Reuse: `lib/image-base64.ts`

- [ ] **Step 1: Write failing validation tests**

Test `validateReferenceFile` using file-like objects:

```ts
assert.equal(validateReferenceFile({ name: "a.png", type: "image/png", size: 10 }), "")
assert.match(
  validateReferenceFile({ name: "a.gif", type: "image/gif", size: 10 }),
  /仅支持 JPG、PNG、WebP/,
)
assert.match(
  validateReferenceFile({ name: "large.png", type: "image/png", size: 10 * 1024 * 1024 + 1 }),
  /不能超过 10MB/,
)
```

Also test stable poster role ordering and image-mode maximum counts.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-reference-images.test.ts
```

Expected: FAIL because the utility file is absent.

- [ ] **Step 3: Implement reference utilities**

Reuse `fileToBase64Parts` from `lib/image-base64.ts`. Export:

```ts
validateReferenceFile(file): string
fileToWorkbenchReference(file, role): Promise<WorkbenchReferenceImage>
sortPosterReferences(images): WorkbenchReferenceImage[]
canAddReference(mode, currentCount): boolean
```

Do not persist base64 data to localStorage.

- [ ] **Step 4: Run reference tests and verify GREEN**

Run the command from Step 2 and expect 0 failures.

### Task 4: Generic RunningHub image-to-image client

**Files:**
- Modify: `lib/runninghub_client.py`
- Modify: `tests/test_video_cover.py`

- [ ] **Step 1: Write a failing generic image-to-image test**

```python
def test_submit_image_to_image_uses_all_reference_urls():
    rh_client = RunningHubClient("test-api-key")
    http_client = AsyncMock()
    http_client.post.return_value = SimpleNamespace(
        is_success=True,
        json=lambda: {"taskId": "image-rh-1"},
    )
    rh_client._client = http_client

    task_id = asyncio.run(
        rh_client.submit_image_to_image(
            prompt="综合重绘",
            image_urls=["https://example.com/1.png", "https://example.com/2.png"],
            aspect_ratio="16:9",
            resolution="2k",
        )
    )
    assert task_id == "image-rh-1"
    assert http_client.post.call_args.kwargs["json"]["imageUrls"] == [
        "https://example.com/1.png",
        "https://example.com/2.png",
    ]
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
python -m pytest tests/test_video_cover.py::test_submit_image_to_image_uses_all_reference_urls -v
```

Expected: FAIL because `submit_image_to_image` is missing.

- [ ] **Step 3: Implement the generic method**

Move the existing `submit_cover_image` HTTP body into `submit_image_to_image`. Validate at least one URL. Keep `submit_cover_image` as a wrapper calling the generic method so video-cover callers and tests remain compatible.

- [ ] **Step 4: Run RunningHub client tests and verify GREEN**

Run:

```powershell
python -m pytest tests/test_video_cover.py -v
```

Expected: 0 failures.

### Task 5: FastAPI shared task pipeline and compatibility adapters

**Files:**
- Modify: `main.py`
- Create: `tests/test_image_workbench.py`
- Modify: `tests/test_poster_generation.py`

- [ ] **Step 1: Write failing request-validation tests**

POST `/api/image-workbench/generate` and assert:

- poster accepts zero to two references;
- image accepts zero to four references;
- a fifth image reference returns 400;
- decoded reference data over 10MB returns 400;
- unsupported MIME and ratio return 400;
- response task ID starts with `image_`.

Patch `asyncio.create_task` to close the scheduled coroutine in submit-only tests.

- [ ] **Step 2: Run validation tests and verify RED**

Run:

```powershell
python -m pytest tests/test_image_workbench.py -k "submit or reject" -v
```

Expected: FAIL because the generic routes and models do not exist.

- [ ] **Step 3: Add shared Pydantic models and stores**

Define `ImageReferenceInput`, `ImageWorkbenchGenerateRequest`, `ImageWorkbenchSubmitResponse`, and `ImageWorkbenchStatusResponse`. Add isolated `_image_task_store`, `_image_pipeline_tasks`, an `image_` task ID, and a shared cache directory mounted at `/static/image-workbench`.

- [ ] **Step 4: Implement validated base64 decoding**

Normalize optional data-URL prefixes, decode with validation, check decoded size at 10MB, write each reference to a task-specific temporary file with a MIME-derived suffix, and retain the input order.

- [ ] **Step 5: Write failing endpoint-selection and cleanup tests**

Use a fake RunningHub client and assert:

- zero references calls `submit_text_image` twice;
- references are uploaded in order and call `submit_image_to_image` twice;
- temporary files are removed in `finally`;
- one candidate may succeed with a warning;
- no valid local image produces failed status.

- [ ] **Step 6: Run pipeline tests and verify RED**

Run:

```powershell
python -m pytest tests/test_image_workbench.py -k "pipeline" -v
```

Expected: FAIL because the shared pipeline is not implemented.

- [ ] **Step 7: Implement the pipeline**

Create `_generate_image_candidate` and `_run_image_workbench_pipeline`. Upload references once per local task, then run two candidate submissions concurrently. Select `submit_text_image` when the uploaded URL list is empty and `submit_image_to_image` otherwise. Download each valid result before recording success; close RunningHub and delete temporary references in `finally`.

- [ ] **Step 8: Add routes and poster adapters**

Implement:

```text
POST /api/image-workbench/generate
GET  /api/image-workbench/status
```

Keep existing poster routes by adapting the poster request to the generic pipeline and mapping the shared status response back to the existing poster response shape.

- [ ] **Step 9: Run Python image tests and verify GREEN**

Run:

```powershell
python -m pytest tests/test_image_workbench.py tests/test_poster_generation.py tests/test_video_cover.py -v
```

Expected: 0 failures.

### Task 6: Next.js proxy, billing, and actionable charge errors

**Files:**
- Create: `app/api/image-workbench/generate/route.ts`
- Create: `app/api/image-workbench/status/route.ts`
- Modify: `lib/credit-pricing/registry.ts`
- Modify: `lib/api_auth.py`
- Modify: `lib/api/with-auth.ts`
- Create: `tests/image-workbench-route.test.ts`
- Modify: `tests/credit-pricing.test.ts`
- Modify: `tests/test_api_auth.py`
- Modify: `tests/with-auth-service-errors.test.ts`

- [ ] **Step 1: Write failing pricing tests**

Assert:

```ts
assert.equal(sceneCost("poster_image"), 20)
assert.equal(sceneCost("image_creation"), 20)
```

and in Python:

```python
assert SCENE_COST_TABLE["poster_image"] == 20
assert SCENE_COST_TABLE["image_creation"] == 20
```

- [ ] **Step 2: Run pricing tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/credit-pricing.test.ts
python -m pytest tests/test_api_auth.py -k image_creation -v
```

Expected: FAIL because `image_creation` is not registered.

- [ ] **Step 3: Register the new scene**

Add `image_creation: 20` to the TypeScript fixed-price registry and `"image_creation": 20` to cloud `SCENE_COST_TABLE`. Preserve `poster_image`.

- [ ] **Step 4: Write failing route and charge-error tests**

Assert that the POST route:

- parses with `parseImageWorkbenchRequest`;
- charges `poster_image` for poster mode and `image_creation` for image mode;
- charges exactly once;
- proxies to `/api/image-workbench/generate`.

Add `chargeErrorResponse` cases:

```ts
new Error("CHARGE_FAILED:400:INVALID_SCENE") => "计费项目未配置"
CloudApiServiceUnavailableError => existing service-unavailable response
new Error("INSUFFICIENT_CREDIT") => "积分不足"
```

- [ ] **Step 5: Run route/error tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-route.test.ts tests/with-auth-service-errors.test.ts
```

Expected: FAIL because routes and explicit invalid-scene mapping are missing.

- [ ] **Step 6: Implement mode-specific proxy charging**

Generate the idempotency prefix `image-workbench:${mode}:${userId}:...`, charge only after validation, rebuild the consumed JSON request, and proxy it. Status requires authentication but does not charge.

Extend `chargeCredit` to retain a small safe error code from non-OK JSON responses without returning upstream secrets. Map `INVALID_SCENE` to “计费项目未配置，请联系管理员同步云端计费配置”.

- [ ] **Step 7: Run route and pricing tests GREEN**

Run the commands from Steps 2 and 5 and expect 0 failures.

### Task 7: Shared browser API and result state

**Files:**
- Create: `lib/image-workbench/api.ts`
- Create: `tests/image-workbench-api.test.ts`

- [ ] **Step 1: Write failing API tests**

Cover:

- snake-case submission payload;
- `task_id` presence;
- terminal success and failure;
- abort handling;
- timeout without converting the backend task to failed.

- [ ] **Step 2: Run API tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-api.test.ts
```

Expected: FAIL because the API module does not exist.

- [ ] **Step 3: Implement submit/query/poll**

Export:

```ts
submitImageWorkbenchTask(input)
queryImageWorkbenchStatus(taskId)
waitForImageWorkbenchResult(taskId, options)
```

Use the generic routes, `parseApiErrorResponse`, a two-second default interval, ten-minute timeout, and abortable delay.

- [ ] **Step 4: Verify API tests GREEN**

Run Step 2 and expect 0 failures.

### Task 8: Modular image-workbench UI

**Files:**
- Create: `components/image-workbench/image-workbench.tsx`
- Create: `components/image-workbench/workbench-mode-tabs.tsx`
- Create: `components/image-workbench/poster-creation-panel.tsx`
- Create: `components/image-workbench/image-creation-panel.tsx`
- Create: `components/image-workbench/reference-image-uploader.tsx`
- Create: `components/image-workbench/image-ratio-selector.tsx`
- Create: `components/image-workbench/image-result-gallery.tsx`
- Modify: `components/poster-creation-workspace.tsx`
- Create: `tests/image-workbench-ui.test.ts`
- Modify: `tests/poster-creation-view.test.ts`

- [ ] **Step 1: Write failing UI source-contract tests**

Assert:

- Hero contains `IMAGE STUDIO` and `图片工作台`.
- Tabs contain `海报图创作` and `图片创作`.
- Poster panel declares four poster templates and two named reference slots.
- Image panel declares five image templates, three reference modes, and maximum four references.
- Uploader uses JPEG/PNG/WebP, 10MB validation, preview, delete, and ordering controls.
- Shared gallery uses dynamic aspect ratio, `object-contain`, and downloads.
- The workbench imports the shared generic API and does not import the Ark client.

- [ ] **Step 2: Run UI test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-ui.test.ts tests/poster-creation-view.test.ts
```

Expected: FAIL because the shared UI does not exist.

- [ ] **Step 3: Implement tabs and ratio selector**

Use accessible `button` elements with `aria-pressed`. Reuse the current violet selected state and portrait/landscape icon treatment. Hide direction controls for `1:1`.

- [ ] **Step 4: Implement the reference uploader**

Support click and drag/drop. Show thumbnail, filename, role/reference-mode help text, delete control, and move-left/move-right controls for general images. Disable mutation during generation.

- [ ] **Step 5: Implement both panels**

Poster panel owns structured poster fields and two role slots. Image panel owns template, description, requirements, reference mode, and ordered general references. Neither panel calls `fetch`; each produces a typed generation draft.

- [ ] **Step 6: Implement shared gallery and workbench shell**

Maintain independent `poster` and `image` draft/result states in a keyed record. On tab change, abort only the visible poll controller; store submitted task IDs and resume query when returning to a running tab. Use shared result copy parameterized by mode.

- [ ] **Step 7: Convert the old workspace to a compatibility export**

```tsx
export { ImageWorkbench as PosterCreationWorkspace } from "@/components/image-workbench/image-workbench"
```

This preserves existing imports until navigation is renamed.

- [ ] **Step 8: Run UI tests and verify GREEN**

Run Step 2 and expect 0 failures.

### Task 9: Navigation, search, and business-assistant boundary

**Files:**
- Modify: `components/dashboard-sidebar.tsx`
- Modify: `components/dashboard-view.tsx`
- Modify: `app/page.tsx`
- Modify: `lib/global-search.ts`
- Modify: `tests/business-assistant-ui.test.ts`
- Modify: `tests/business-assistant-registry.test.ts`
- Create: `tests/image-workbench-navigation.test.ts`

- [ ] **Step 1: Write failing navigation tests**

Assert all user-visible entry points use `图片工作台`, old `海报图创作` remains only as an inner tab label, and `resolveAssistantForView("图片工作台")` returns `undefined`.

- [ ] **Step 2: Run navigation tests and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-navigation.test.ts tests/business-assistant-ui.test.ts tests/business-assistant-registry.test.ts
```

Expected: FAIL because navigation still uses the old view name.

- [ ] **Step 3: Rename the main view**

Update sidebar item, dashboard card, breadcrumbs, `activeView` rendering, and global-search action to `图片工作台`. Render `ImageWorkbench` directly from `app/page.tsx`. Do not register a new business assistant.

- [ ] **Step 4: Run navigation tests and verify GREEN**

Run Step 2 and expect 0 failures.

### Task 10: Operations contract and complete verification

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/superpowers/plans/2026-07-27-image-workbench.md`

- [ ] **Step 1: Update AGENTS.md**

Document the two sections, shared `/api/image-workbench/*` routes, text/image endpoint selection, reference limits, and both 20-credit cloud scenes. Keep the explicit rule that RunningHub image APIs do not come from synced pure-model configuration.

- [ ] **Step 2: Run focused TypeScript tests**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-types.test.ts tests/image-workbench-prompts.test.ts tests/image-workbench-reference-images.test.ts tests/image-workbench-api.test.ts tests/image-workbench-route.test.ts tests/image-workbench-ui.test.ts tests/image-workbench-navigation.test.ts tests/poster-creation-view.test.ts tests/credit-pricing.test.ts tests/with-auth-service-errors.test.ts tests/business-assistant-ui.test.ts tests/business-assistant-registry.test.ts
```

Expected: 0 failures.

- [ ] **Step 3: Run focused Python tests**

Run:

```powershell
python -m pytest tests/test_image_workbench.py tests/test_poster_generation.py tests/test_video_cover.py tests/test_api_auth.py -v
```

Expected: 0 failures.

- [ ] **Step 4: Run type checking**

Run:

```powershell
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 5: Run broader regression suites**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/
python -m pytest tests/ -q
```

Record unrelated pre-existing failures separately. Do not claim external generation success unless the cloud billing scene is deployed and RunningHub returns real images.

- [ ] **Step 6: Verify source scope**

Run:

```powershell
git diff --check
git status --short
git diff -- app/api/image-workbench components/image-workbench lib/image-workbench components/poster-creation-workspace.tsx app/page.tsx components/dashboard-sidebar.tsx components/dashboard-view.tsx lib/global-search.ts lib/runninghub_client.py main.py lib/api/with-auth.ts lib/api_auth.py lib/credit-pricing/registry.ts AGENTS.md tests/image-workbench-types.test.ts tests/image-workbench-prompts.test.ts tests/image-workbench-reference-images.test.ts tests/image-workbench-api.test.ts tests/image-workbench-route.test.ts tests/image-workbench-ui.test.ts tests/image-workbench-navigation.test.ts tests/test_image_workbench.py
```

Confirm all changed task files belong to this feature and unrelated dirty-worktree changes remain untouched.

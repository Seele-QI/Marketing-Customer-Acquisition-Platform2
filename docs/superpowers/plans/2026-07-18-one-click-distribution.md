# One-click Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a production-ready one-click distribution section with a Douyin-first video workflow and a non-publishing GEO article workspace.

**Architecture:** Keep the existing `MainView` navigation model and add a focused distribution workspace. Next.js routes proxy authenticated requests to FastAPI, while a publisher package owns browser login, encrypted account storage, local video resolution, and visible Chromium publishing.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, FastAPI, SQLite, Playwright, Chromium.

---

### Task 1: Distribution navigation and workspace

**Files:**
- Create: `lib/distribution/workspace.ts`
- Create: `components/distribution/distribution-workspace.tsx`
- Modify: `components/dashboard-sidebar.tsx`
- Modify: `app/page.tsx`

- [ ] Define stable view constants for video and GEO article distribution.
- [ ] Add the expandable “一键分发” sidebar group and two child views.
- [ ] Route distribution views through `DistributionWorkspace`.
- [ ] Add breadcrumb labels for both views.

### Task 2: Video distribution UI and account binding

**Files:**
- Modify: `components/share-distribute.tsx`
- Create: `components/distribution/account-binding.tsx`
- Create: `lib/prompts/publish-copy-system.ts`

- [ ] Replace the placeholder with the existing working video selection, upload, copywriting, account and result flow.
- [ ] Keep only Douyin selectable for first-release publishing; render the remaining platforms as “待验证”.
- [ ] Host account binding inside the distribution workspace and return to the publish form after binding.
- [ ] Preserve explicit idle, blocked, publishing, user-action, success and failure states.

### Task 3: GEO article distribution shell

**Files:**
- Create: `components/distribution/geo-article-distribute.tsx`

- [ ] Build source, platform-preview and publish-history sections.
- [ ] Link the source empty state to `GEO_VIEWS.ARTICLE_EDITOR`.
- [ ] Disable all publishing controls and label them “即将开放”.
- [ ] Keep the layout responsive without horizontal clipping.

### Task 4: Next.js proxy routes

**Files:**
- Create: `app/api/connectors/platforms/route.ts`
- Create: `app/api/connectors/connect/route.ts`
- Create: `app/api/connectors/disconnect/[platform_id]/route.ts`
- Create: `app/api/connectors/browser/start/route.ts`
- Create: `app/api/connectors/browser/status/route.ts`
- Create: `app/api/connectors/browser/cancel/route.ts`
- Create: `app/api/publish/route.ts`
- Create: `app/api/publish/accounts/route.ts`
- Create: `app/api/ai/publish-copy/route.ts`

- [ ] Proxy connector and publish calls through the existing hardened `proxyToFastapi` helper.
- [ ] Give browser start and publish routes durations appropriate for interactive automation.
- [ ] Implement AI copy generation with existing auth, credit charging and DeepSeek helpers.

### Task 5: FastAPI account and Douyin publisher integration

**Files:**
- Create: `lib/connector_service.py`
- Create: `lib/interactive_login.py`
- Create: `lib/playwright_env.py`
- Create: `lib/publisher/__init__.py`
- Create: `lib/publisher/cookies.py`
- Create: `lib/publisher/douyin.py`
- Create: `lib/publisher/douyin_login_page.py`
- Create: `lib/publisher/douyin_open_api.py`
- Create: `lib/publisher/manager.py`
- Create: `lib/publisher/profile_paths.py`
- Create: `lib/publisher/publish_click.py`
- Create: `lib/publisher/types.py`
- Create: `lib/publisher/video_path.py`
- Modify: `main.py`
- Modify: `requirements.txt`

- [ ] Add per-user encrypted account persistence and connector status APIs.
- [ ] Add visible-browser login start, status and cancellation endpoints.
- [ ] Add single-platform publish and account-list endpoints.
- [ ] Restrict the first-release manager path to Douyin while retaining explicit unsupported-platform results.
- [ ] Add Playwright to Python dependencies and provide actionable missing-browser errors.

### Task 6: Focused verification

**Files:**
- Test: `tests/distribution-workspace.test.ts`
- Test: `tests/test_publisher_video_path.py`

- [ ] Verify view classification and breadcrumbs.
- [ ] Verify local and public video path resolution rejects unsafe paths.
- [ ] Run focused TypeScript tests, Python tests and TypeScript type checking.
- [ ] Exercise connector status and publish preflight without sending a real post.


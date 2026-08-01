# Functional Workbench Verification

Date: 2026-07-25

## Delivered

- Retained the existing `TopBanner`.
- Replaced the display-only dashboard body with current-project continuation, five major business directions, and recent projects.
- Enabled only video and GEO business assistants; Douyin interception remains reserved.
- Added an account-scoped project, step, and message store with optimistic revisions and evidence-gated completion.
- Added a root-mounted floating assistant with conversation, plan, and memory tabs.
- Added shared `global + positioning` memory plus isolated `video` / `geo` professional scopes.
- Added a non-assistant poster creation workspace using the existing Ark image API.
- Added sidebar and global-search navigation for the major directions.

## Self-review

- Assistant IDs and page destinations are resolved from a server-owned registry.
- Page context is bounded and removes key/token/secret/password/cookie fields.
- Model suggestions are allow-listed to navigation and user-applied plan updates.
- Generation, publishing, deletion, external outreach, and direct charging are not executable assistant suggestions.
- Cross-user project reads return not found; stale project revisions return conflict.
- A project step cannot be marked complete without recognized saved/runtime/score evidence.
- No new environment variable or model selector was added.

## Fresh verification evidence

- TypeScript: `npx tsc --noEmit` — exit 0.
- Production build: `pnpm build` — exit 0; `/api/business-assistant/chat` and project routes included.
- Node tests: 33 passed, 0 failed.
- Python unittests: 9 passed, 0 failed.
- Browser inspection at 1366x768 with mocked login/project reads:
  - retained banner found: 1;
  - major direction cards found: 5;
  - floating assistant found: 1;
  - conversation/plan/memory tabs rendered;
  - poster generator control rendered;
  - no page or console errors.

Screenshots:

- `C:\Users\18330\AppData\Local\Temp\workbench-1366.png`
- `C:\Users\18330\AppData\Local\Temp\workbench-assistant-1366.png`
- `C:\Users\18330\AppData\Local\Temp\poster-workspace-1366.png`

## Evidence boundary

The browser inspection used mocked authentication and project reads and did not call a paid model or image generator. It does not prove live account persistence, model completion, paid image generation, video generation, GEO scoring, or external publishing. Those require authenticated service UAT with corresponding saved project evidence.

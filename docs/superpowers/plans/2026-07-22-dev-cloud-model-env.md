# Development Cloud Model Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `pnpm dev:all` inject the cached cloud LLM and Seedance provider snapshot into both Next.js and FastAPI without overriding RunningHub or image-generation configuration.

**Architecture:** A standalone ESM helper reads and decrypts Electron's cached credential file, filters provider adapters to the existing pure-model contract, and returns a sanitized environment snapshot. A unified development launcher loads that snapshot once and spawns both services with the same environment.

**Tech Stack:** Node.js ESM, AES-256-GCM/HKDF, node-machine-id, Next.js, FastAPI, node:test.

---

### Task 1: Cloud credential cache reader

**Files:**
- Create: `scripts/dev-cloud-model-env.mjs`
- Test: `tests/dev-cloud-model-env.test.mjs`

- [x] **Step 1: Write failing tests for decrypting a provider cache, filtering adapters, preserving built-in exclusions, and rejecting a missing cache.**

- [x] **Step 2: Run `node --test tests/dev-cloud-model-env.test.mjs` and confirm failure because the module does not exist.**

- [x] **Step 3: Implement `loadDevCloudModelEnv` with injectable credential path and machine ID so the crypto and filtering behavior is tested with real encrypted bytes.**

- [x] **Step 4: Re-run `node --test tests/dev-cloud-model-env.test.mjs` and confirm all cases pass.**

### Task 2: Unified development launcher

**Files:**
- Create: `scripts/dev-all.mjs`
- Modify: `package.json`
- Test: `tests/dev-all-cloud-env.test.mjs`

- [x] **Step 1: Write a failing wiring test that requires `dev:all` to call `scripts/dev-all.mjs`, and requires the launcher to pass one injected environment to both child processes.**

- [x] **Step 2: Run `node --test tests/dev-all-cloud-env.test.mjs` and confirm the assertions fail against the current concurrently command.**

- [x] **Step 3: Implement the launcher with child shutdown propagation and change only the `dev:all` package script.**

- [x] **Step 4: Re-run both focused test files and confirm they pass.**

### Task 3: Regression verification

**Files:**
- Verify only; no production files expected.

- [x] **Step 1: Run `node --test tests/dev-cloud-model-env.test.mjs tests/dev-all-cloud-env.test.mjs tests/electron-cloud-model-runtime.test.ts`.**

- [x] **Step 2: Run the repository TypeScript test command for the directly affected model-provider tests.**

- [x] **Step 3: Run `npx tsc --noEmit` and record the exit code.**

- [x] **Step 4: Inspect `git diff` for the task files and confirm no RunningHub/image API node was changed.**

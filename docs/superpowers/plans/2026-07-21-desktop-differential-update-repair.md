# Desktop Differential Update Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repair the missing Electron update configuration, restore old-client updates with a lightweight repair tool, and enforce NSIS differential-update assets before release.

**Architecture:** Keep the existing two-stage Windows build, but insert a deterministic `app-update.yml` generator before NSIS packaging and fail closed when update assets are incomplete. Add an Electron runtime fallback under the writable user-data directory, plus a standalone PowerShell repair path for already shipped clients that cannot receive the new runtime code.

**Tech Stack:** Electron 34, electron-updater 6.8, electron-builder 25, Node.js ESM scripts, TypeScript, Node test runner, PowerShell, NSIS, Aliyun OSS generic feed.

---

## File map

- Create `scripts/lib/app-update-config.mjs`: pure normalization, rendering, parsing, validation, and atomic-write helpers for build scripts.
- Create `scripts/generate-app-update-config.mjs`: CLI that creates `release/win-unpacked/resources/app-update.yml`.
- Create `electron/services/update-config.ts`: packaged-config selection and writable runtime fallback.
- Create `scripts/repair-desktop-updater.ps1`: one-time repair for already shipped 0.1.3/1.3.5 installations.
- Create `tests/app-update-config.test.mjs`: build-helper and release-asset unit tests.
- Create `tests/electron-update-config.test.ts`: runtime fallback unit tests.
- Create `tests/repair-desktop-updater.test.mjs`: isolated repair-script integration tests.
- Modify `scripts/dist-win.mjs`: invoke config generator and post-build verification.
- Modify `electron/services/updater.ts`: set a valid config path before any check/download and explicitly keep differential download enabled.
- Modify `electron/utils/friendly-update-error.ts`, `lib/update-error.ts`, `tests/update-error.test.ts`: actionable missing-config message.
- Modify `scripts/upload-release-oss.mjs`: require paired installer/blockmap metadata and upload `latest.yml` last.
- Modify `scripts/verify-desktop-update.mjs`: validate packaged config, blockmaps, remote Range support, and an optional old version.
- Modify `electron-builder.yml`, `package.json`: release 1.3.6 and embed concise release notes.
- Modify `docs/deploy/DESKTOP-UPDATE-OSS.md`: repaired release procedure and old-client recovery instructions.

### Task 1: Deterministic build-time update configuration

**Files:**
- Create: `scripts/lib/app-update-config.mjs`
- Create: `scripts/generate-app-update-config.mjs`
- Create: `tests/app-update-config.test.mjs`
- Modify: `scripts/dist-win.mjs`

- [ ] **Step 1: Write failing generator tests**

Test the desired public API before the module exists:

```js
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  normalizeFeedUrl,
  renderAppUpdateConfig,
  writeAppUpdateConfig,
  validateAppUpdateConfig,
} from "../scripts/lib/app-update-config.mjs"

test("normalizes an HTTPS generic feed and writes a valid config atomically", () => {
  const root = mkdtempSync(path.join(tmpdir(), "app-update-config-"))
  try {
    const file = writeAppUpdateConfig(root, {
      feedUrl: "https://updates.example.com/releases",
      updaterCacheDirName: "cuocuo-ai-updater",
    })
    const text = readFileSync(file, "utf8")
    assert.equal(normalizeFeedUrl("https://updates.example.com/releases"), "https://updates.example.com/releases/")
    assert.equal(text, renderAppUpdateConfig({
      feedUrl: "https://updates.example.com/releases/",
      updaterCacheDirName: "cuocuo-ai-updater",
    }))
    assert.deepEqual(validateAppUpdateConfig(text), {
      provider: "generic",
      url: "https://updates.example.com/releases/",
      updaterCacheDirName: "cuocuo-ai-updater",
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("rejects a non-HTTPS feed", () => {
  assert.throws(() => normalizeFeedUrl("http://updates.example.com"), /HTTPS/)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests/app-update-config.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/lib/app-update-config.mjs`.

- [ ] **Step 3: Implement the pure generator and CLI**

Implement `normalizeFeedUrl`, `renderAppUpdateConfig`, `validateAppUpdateConfig`, and `writeAppUpdateConfig`. The writer must create the resources directory, write to a sibling temporary file, rename it to `app-update.yml`, and re-read/validate the final file. The CLI must load `.env.electron-build.local` without logging values and use:

```js
const DEFAULT_FEED_URL = "https://mcap-desktop-releases.oss-cn-beijing.aliyuncs.com/releases/"
const DEFAULT_CACHE_DIR = "cuocuo-ai-updater"
```

CLI usage:

```powershell
node scripts/generate-app-update-config.mjs --resources release/win-unpacked/resources
```

Insert the CLI after `patch-exe-icon.mjs` and before the `--prepackaged` NSIS command in `scripts/dist-win.mjs`.

- [ ] **Step 4: Run tests and a real-directory smoke check**

Run:

```powershell
node --test tests/app-update-config.test.mjs
node scripts/generate-app-update-config.mjs --resources release/win-unpacked/resources
Get-Content -Encoding UTF8 release/win-unpacked/resources/app-update.yml
```

Expected: tests PASS and the file contains `provider: generic`, the HTTPS OSS URL, and `updaterCacheDirName: cuocuo-ai-updater`.

- [ ] **Step 5: Commit Task 1 files**

```powershell
git add scripts/lib/app-update-config.mjs scripts/generate-app-update-config.mjs scripts/dist-win.mjs tests/app-update-config.test.mjs
git commit -m "fix(desktop): generate packaged updater config"
```

### Task 2: Runtime fallback for future packaging regressions

**Files:**
- Create: `electron/services/update-config.ts`
- Create: `tests/electron-update-config.test.ts`
- Modify: `electron/services/updater.ts`

- [ ] **Step 1: Write failing runtime fallback tests**

Use real temporary directories and no Electron mocks:

```ts
import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ensureUpdateConfigPath } from "../electron/services/update-config.ts"

test("keeps a valid packaged app-update.yml", () => {
  const root = mkdtempSync(path.join(tmpdir(), "electron-update-config-"))
  try {
    const packaged = path.join(root, "resources", "app-update.yml")
    mkdirSync(path.dirname(packaged), { recursive: true })
    writeFileSync(packaged, "provider: generic\nurl: https://updates.example.com/\nupdaterCacheDirName: cuocuo-ai-updater\n")
    const result = ensureUpdateConfigPath({
      packagedConfigPath: packaged,
      fallbackConfigPath: path.join(root, "user-data", "app-update.yml"),
      feedUrl: "https://updates.example.com/",
    })
    assert.deepEqual(result, { path: packaged, source: "packaged" })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("creates a user-data fallback when packaged config is missing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "electron-update-config-"))
  try {
    const fallback = path.join(root, "user-data", "app-update.yml")
    const result = ensureUpdateConfigPath({
      packagedConfigPath: path.join(root, "resources", "app-update.yml"),
      fallbackConfigPath: fallback,
      feedUrl: "https://updates.example.com/releases",
    })
    assert.deepEqual(result, { path: fallback, source: "fallback" })
    assert.match(readFileSync(fallback, "utf8"), /updaterCacheDirName: cuocuo-ai-updater/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/electron-update-config.test.ts
```

Expected: FAIL because `electron/services/update-config.ts` does not exist.

- [ ] **Step 3: Implement the runtime helper and integrate it**

`ensureUpdateConfigPath()` must validate an existing packaged file, otherwise require an HTTPS feed and atomically create the fallback. In `setupAutoUpdater()` call it before any update operation:

```ts
const config = ensureUpdateConfigPath({
  packagedConfigPath: path.join(process.resourcesPath, "app-update.yml"),
  fallbackConfigPath: path.join(app.getPath("userData"), "updater", "app-update.yml"),
  feedUrl: resolveFeedUrl(),
})
au.updateConfigPath = config.path
au.disableDifferentialDownload = false
logger.info("updater: config", config.source, config.path)
```

Keep `setFeedURL()` only for the supported environment override. On failure, store a friendly configuration error in update state so IPC handlers return it before calling electron-updater.

- [ ] **Step 4: Verify GREEN and Electron compilation**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/electron-update-config.test.ts
pnpm electron:build
```

Expected: tests PASS and TypeScript compilation exits 0.

- [ ] **Step 5: Commit Task 2 files**

```powershell
git add electron/services/update-config.ts electron/services/updater.ts tests/electron-update-config.test.ts
git commit -m "fix(desktop): add updater config fallback"
```

### Task 3: Actionable missing-config error

**Files:**
- Modify: `lib/update-error.ts`
- Modify: `electron/utils/friendly-update-error.ts`
- Modify: `tests/update-error.test.ts`

- [ ] **Step 1: Add the failing regression test**

```ts
import { toFriendlyUpdateError as toElectronFriendlyUpdateError } from "../electron/utils/friendly-update-error.ts"

it("maps missing app-update.yml to an actionable repair message", () => {
  const raw = "ENOENT: no such file or directory, open 'E:\\\\AI\\\\cuocuo-ai\\\\resources\\\\app-update.yml'"
  const expected = "更新配置缺失，请运行更新修复工具或覆盖安装新版客户端"
  assert.equal(toFriendlyUpdateError(raw), expected)
  assert.equal(toElectronFriendlyUpdateError(raw), expected)
})
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/update-error.test.ts
```

Expected: FAIL because the raw ENOENT text is returned.

- [ ] **Step 3: Add the specific mapping before generic network handling**

Add the same constants and ordering to both copies:

```ts
const MISSING_UPDATE_CONFIG_RE = /ENOENT[\s\S]*app-update\.yml|app-update\.yml[\s\S]*ENOENT/i
const FRIENDLY_MISSING_UPDATE_CONFIG = "更新配置缺失，请运行更新修复工具或覆盖安装新版客户端"

if (MISSING_UPDATE_CONFIG_RE.test(text)) return FRIENDLY_MISSING_UPDATE_CONFIG
```

- [ ] **Step 4: Verify GREEN**

Run the focused test and `pnpm electron:build`. Both must exit 0.

- [ ] **Step 5: Commit Task 3 files**

```powershell
git add lib/update-error.ts electron/utils/friendly-update-error.ts tests/update-error.test.ts
git commit -m "fix(desktop): clarify missing update configuration"
```

### Task 4: Lightweight repair tool for already shipped clients

**Files:**
- Create: `scripts/repair-desktop-updater.ps1`
- Create: `tests/repair-desktop-updater.test.mjs`

- [ ] **Step 1: Write the failing isolated integration tests**

Create a temporary fake install with `招财猫.exe` and `resources/`, invoke PowerShell with `-InstallDir`, and assert the generated YAML. Invoke it again after changing the file and assert that exactly one timestamped backup exists.

```js
const result = spawnSync("powershell.exe", [
  "-NoProfile", "-ExecutionPolicy", "Bypass",
  "-File", script,
  "-InstallDir", installDir,
], { encoding: "utf8" })
assert.equal(result.status, 0, result.stderr || result.stdout)
assert.match(readFileSync(path.join(installDir, "resources", "app-update.yml"), "utf8"), /provider: generic/)
```

Also test an invalid directory and expect non-zero exit without creating files.

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests/repair-desktop-updater.test.mjs
```

Expected: FAIL because the PowerShell repair script does not exist.

- [ ] **Step 3: Implement safe discovery, backup, and atomic write**

The script accepts `-InstallDir`, otherwise probes its own directory, current directory, and HKCU uninstall entries. It validates both `招财猫.exe` and `resources`, backs up a different existing config as `app-update.yml.bak-<timestamp>`, writes a temporary file with UTF-8 no BOM, then renames it. It must never recurse or write outside the validated install directory.

- [ ] **Step 4: Verify GREEN**

Run the integration test twice. Expected: all tests PASS and no files remain outside test temp directories.

- [ ] **Step 5: Commit Task 4 files**

```powershell
git add scripts/repair-desktop-updater.ps1 tests/repair-desktop-updater.test.mjs
git commit -m "fix(desktop): add legacy updater repair tool"
```

### Task 5: Fail-closed release asset ordering and verification

**Files:**
- Modify: `scripts/upload-release-oss.mjs`
- Modify: `scripts/verify-desktop-update.mjs`
- Modify: `tests/app-update-config.test.mjs`

- [ ] **Step 1: Add failing artifact-selection tests**

Export a pure `pickArtifacts(dir)` from the uploader without executing `main()` on import. Test that a directory with `latest.yml` and an installer but no matching `.blockmap` throws. Test that a complete directory returns the order installer, blockmap, then `latest.yml`.

```js
assert.throws(() => pickArtifacts(incompleteDir), /blockmap/)
assert.deepEqual(
  pickArtifacts(completeDir).map((file) => path.basename(file)),
  ["招财猫-Setup-1.3.6.exe", "招财猫-Setup-1.3.6.exe.blockmap", "latest.yml"],
)
```

- [ ] **Step 2: Run the test and verify RED**

Run `node --test tests/app-update-config.test.mjs`.

Expected: FAIL because `pickArtifacts` is not exported and current ordering places metadata before blockmaps.

- [ ] **Step 3: Implement fail-closed selection and metadata-last upload**

Parse `path:` from each latest metadata file, require the referenced artifact and `<artifact>.blockmap`, and return all binary artifacts first, blockmaps second, metadata last. Guard `main()` with a direct-execution check so tests can import the module. Never upload `latest.yml` if an earlier upload or public read-back check fails.

Enhance `verify-desktop-update.mjs` with:

```text
--client 0.1.3
--expect 1.3.6
--old-version 0.1.3
```

It must validate packaged `app-update.yml`, the local referenced blockmap, remote latest installer/blockmap HEAD responses, installer Range `206`, and remote old blockmap availability.

- [ ] **Step 4: Verify GREEN without mutating OSS**

Run focused unit tests and the verifier only after local 1.3.6 artifacts exist. The verifier uses GET/HEAD only; do not invoke `release:upload-oss` in this task.

- [ ] **Step 5: Commit Task 5 files**

```powershell
git add scripts/upload-release-oss.mjs scripts/verify-desktop-update.mjs tests/app-update-config.test.mjs
git commit -m "fix(release): require differential update assets"
```

### Task 6: Versioned release notes and operator documentation

**Files:**
- Modify: `package.json`
- Modify: `electron-builder.yml`
- Modify: `docs/deploy/DESKTOP-UPDATE-OSS.md`

- [ ] **Step 1: Add a failing metadata assertion**

Extend the config test to read both version sources and assert 1.3.6 plus the exact concise announcement:

```text
修复桌面客户端更新失败问题，启用更快速的差分更新，并提升后续版本更新稳定性。
```

Expected initial failure: both version files still contain 1.3.5 and builder config has no release notes.

- [ ] **Step 2: Set version 1.3.6 and release notes**

Update both version fields together and add `releaseInfo.releaseNotes` to electron-builder. Do not overwrite 1.3.5 on OSS because clients already on that version would not detect a same-version repair.

- [ ] **Step 3: Document the repaired release flow**

Document:

1. Run tests and resource build.
2. Run `pnpm dist:win` and confirm packaged `app-update.yml`.
3. Run the read-only verifier.
4. Run the repair tool for already shipped clients, then restart and update.
5. Upload only after explicit release approval.
6. Keep old installers and blockmaps.
7. Set `CENTRAL_RELEASE_NOTES` to the same short announcement.

- [ ] **Step 4: Verify metadata test GREEN and commit**

```powershell
node --test tests/app-update-config.test.mjs
git add package.json electron-builder.yml docs/deploy/DESKTOP-UPDATE-OSS.md tests/app-update-config.test.mjs
git commit -m "chore(release): prepare desktop 1.3.6 update"
```

### Task 7: Full local build and end-to-end evidence

**Files:**
- Modify only if a focused defect is discovered in files already listed above.
- Produce ignored artifacts under `release/`; do not commit them.

- [ ] **Step 1: Run focused and regression tests**

```powershell
node --test tests/app-update-config.test.mjs tests/repair-desktop-updater.test.mjs
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/electron-update-config.test.ts tests/update-error.test.ts
pnpm electron:build
```

Expected: all tests PASS and compilation exits 0.

- [ ] **Step 2: Build the Windows installer**

Run:

```powershell
pnpm dist:win
```

Expected artifacts:

```text
release/win-unpacked/resources/app-update.yml
release/招财猫-Setup-1.3.6.exe
release/招财猫-Setup-1.3.6.exe.blockmap
release/latest.yml
```

- [ ] **Step 3: Verify local package and current OSS read-only state**

```powershell
node scripts/verify-desktop-update.mjs --client 0.1.3 --expect 1.3.6 --old-version 0.1.3
```

Before 1.3.6 is uploaded, the verifier is expected to report the remote feed is still 1.3.5 while all local checks pass. Record this as “release ready, remote publication pending”; do not weaken the assertion in production code.

- [ ] **Step 4: Simulate legacy repair in an isolated directory**

Copy only a dummy `招财猫.exe` and empty `resources/` into a temporary directory, run the repair script, validate the YAML, rerun it for idempotence, and delete the temporary directory.

- [ ] **Step 5: Inspect final diff and repository state**

Run `git diff --check`, focused `git status --short`, and `git log -7 --oneline`. Confirm unrelated user changes remain untouched and no OSS upload command was executed.

- [ ] **Step 6: Final handoff**

Report root cause, changed files, exact test/build evidence, artifact paths and sizes, the one-time repair command, the concise announcement, and the explicit remaining action: production OSS upload requires release authorization.

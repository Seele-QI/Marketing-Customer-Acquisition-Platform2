import assert from "node:assert/strict"
import test from "node:test"

import {
  BUSINESS_STORAGE_KEYS,
  TutorialDemoBlockedError,
  assertNotDemoMode,
  guardDemoAction,
  isBlockedTutorialFetchUrl,
  isTutorialDemoMode,
  setTutorialDemoMode,
} from "../lib/tutorial/demo-mode.ts"
import {
  TUTORIAL_PROGRESS_KEY,
  clearTutorialProgress,
  completionRatio,
  defaultTutorialProgress,
  isScenarioCompleted,
  loadTutorialProgress,
  markScenarioCompleted,
  saveTutorialProgress,
  saveTutorialStepCursor,
} from "../lib/tutorial/progress-store.ts"
import {
  TUTORIAL_FIXTURES,
  getTutorialFixture,
} from "../lib/tutorial/fixtures.ts"
import {
  TUTORIAL_SCENARIOS,
  getTutorialScenario,
  listModuleScenarios,
  listWorkflowHubScenarios,
  modulesMissingScenarios,
} from "../lib/tutorial/scenarios.ts"
import {
  TUTORIAL_WORKFLOWS,
  getWorkflowById,
} from "../lib/tutorial/workflows.ts"
import {
  TUTORIAL_USER_MODULES,
  TUTORIAL_MODULE_VIEWS,
  TUTORIAL_WORKFLOW_IDS,
} from "../lib/tutorial/types.ts"
import { existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { TUTORIAL_GLOSSARY } from "../lib/tutorial/glossary.ts"
import { TUTORIAL_FAQ } from "../lib/tutorial/faq.ts"
import { DRAFT_STORAGE_KEY } from "../lib/workflow-draft-store.ts"
import { HISTORY_STORAGE_KEY } from "../lib/video/types.ts"
import { IP_POSITIONING_SESSION_KEY } from "../lib/ip-positioning-store.ts"

function createMemoryStorage(seed?: Record<string, string>) {
  const store = new Map(Object.entries(seed ?? {}))
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
  }
}

function withMockBrowserEnv(storage: ReturnType<typeof createMemoryStorage>, run: () => void) {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage")

  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true })
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true })

  try {
    run()
  } finally {
    setTutorialDemoMode(false, null)
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor)
    } else {
      // @ts-expect-error test cleanup
      delete globalThis.window
    }
    if (localStorageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", localStorageDescriptor)
    } else {
      // @ts-expect-error test cleanup
      delete globalThis.localStorage
    }
  }
}

test("every user-visible module has at least one tutorial scenario", () => {
  const missing = modulesMissingScenarios()
  assert.deepEqual(missing, [])
  for (const moduleId of TUTORIAL_USER_MODULES) {
    const found = TUTORIAL_SCENARIOS.some((s) => s.module === moduleId)
    assert.equal(found, true, `missing scenario for ${moduleId}`)
  }
})

test("module scenarios map to known target views", () => {
  for (const s of listModuleScenarios()) {
    assert.ok(s.targetView.length > 0)
    assert.equal(s.targetView, TUTORIAL_MODULE_VIEWS[s.module])
    assert.ok(s.steps.length >= 1)
    assert.ok(s.goal.length > 0)
  }
})

test("fixtures exist for all fixtureKey references", () => {
  for (const s of TUTORIAL_SCENARIOS) {
    if (!s.fixtureKey) continue
    assert.ok(
      s.fixtureKey in TUTORIAL_FIXTURES,
      `fixture missing: ${s.fixtureKey} (scenario ${s.id})`,
    )
    const fixture = getTutorialFixture(s.fixtureKey as keyof typeof TUTORIAL_FIXTURES)
    assert.ok(fixture)
  }
})

test("ip positioning fixture has required report fields", () => {
  const fixture = getTutorialFixture("ip-positioning")
  assert.ok(fixture.report.oneLiner)
  assert.ok(fixture.report.platformPlans.length > 0)
  assert.ok(fixture.report.thirtyDayPlan.length > 0)
})

test("dh-video-v2 fixture has script plan segments", () => {
  const fixture = getTutorialFixture("dh-video-v2")
  assert.equal(fixture.scriptPlan.segment_count, fixture.scriptPlan.segments.length)
  assert.ok(fixture.scriptPlan.segments.length >= 1)
})

test("progress store only writes tutorial key", () => {
  const storage = createMemoryStorage({
    [DRAFT_STORAGE_KEY]: JSON.stringify({ keep: true }),
    [HISTORY_STORAGE_KEY]: JSON.stringify([{ id: "user-hist" }]),
    [IP_POSITIONING_SESSION_KEY]: JSON.stringify({ report: null }),
  })
  withMockBrowserEnv(storage, () => {
    markScenarioCompleted("dashboard-overview")
    saveTutorialStepCursor("dashboard-overview", 1)
    const progress = loadTutorialProgress()
    assert.equal(isScenarioCompleted(progress, "dashboard-overview"), true)
    assert.equal(progress.lastStepIndex, 1)
    assert.ok(storage.getItem(TUTORIAL_PROGRESS_KEY))
    assert.equal(storage.getItem(DRAFT_STORAGE_KEY), JSON.stringify({ keep: true }))
    assert.equal(storage.getItem(HISTORY_STORAGE_KEY), JSON.stringify([{ id: "user-hist" }]))
    assert.equal(
      storage.getItem(IP_POSITIONING_SESSION_KEY),
      JSON.stringify({ report: null }),
    )
    clearTutorialProgress()
    assert.equal(storage.getItem(TUTORIAL_PROGRESS_KEY), null)
  })
})

test("completion ratio clamps to 1", () => {
  const progress = {
    ...defaultTutorialProgress(),
    completedScenarios: ["a", "b", "c"],
  }
  assert.equal(completionRatio(progress, 2), 1)
  assert.equal(completionRatio(progress, 0), 0)
})

test("demo mode blocks assert and soft guard", () => {
  setTutorialDemoMode(false)
  assert.equal(guardDemoAction("x"), true)
  assert.doesNotThrow(() => assertNotDemoMode("x"))

  setTutorialDemoMode(true, "dh-video-v2-demo")
  assert.equal(isTutorialDemoMode(), true)
  assert.equal(guardDemoAction("dh-video-v2 submit"), false)
  assert.throws(() => assertNotDemoMode("submit"), TutorialDemoBlockedError)
  setTutorialDemoMode(false)
})

test("blocked fetch url detection covers high-cost paths", () => {
  assert.equal(isBlockedTutorialFetchUrl("/api/ai/chat-stream"), true)
  assert.equal(isBlockedTutorialFetchUrl("/api/dh-video-v2/submit"), true)
  assert.equal(isBlockedTutorialFetchUrl("/api/credit/consume"), true)
  assert.equal(isBlockedTutorialFetchUrl("/api/geo/matrix-projects/1/generate"), true)
  assert.equal(isBlockedTutorialFetchUrl("/api/auth/me"), false)
  assert.equal(isBlockedTutorialFetchUrl("/api/credit/balance"), false)
})

test("business storage keys include known draft and history keys", () => {
  assert.ok(BUSINESS_STORAGE_KEYS.includes("agenthub-workflow-drafts"))
  assert.ok(BUSINESS_STORAGE_KEYS.includes("video-history"))
  assert.ok(BUSINESS_STORAGE_KEYS.includes("ip-positioning-session-v1"))
})

test("glossary and faq are non-empty", () => {
  assert.ok(TUTORIAL_GLOSSARY.length >= 5)
  assert.ok(TUTORIAL_FAQ.length >= 5)
  assert.ok(getTutorialScenario("wf-prep"))
})

test("six core workflows plus prep and finish exist", () => {
  const required: Array<{ id: (typeof TUTORIAL_WORKFLOW_IDS)[number]; minSteps: number }> = [
    { id: "prep", minSteps: 4 },
    { id: "positioning-content", minSteps: 6 },
    { id: "dh-oral", minSteps: 6 },
    { id: "image-video", minSteps: 6 },
    { id: "mashup", minSteps: 7 },
    { id: "promo", minSteps: 7 },
    { id: "geo-growth", minSteps: 5 },
    { id: "finish-publish", minSteps: 3 },
  ]
  assert.equal(TUTORIAL_WORKFLOWS.length, TUTORIAL_WORKFLOW_IDS.length)
  assert.equal(listWorkflowHubScenarios().length, TUTORIAL_WORKFLOW_IDS.length)
  for (const { id, minSteps } of required) {
    const wf = getWorkflowById(id)
    assert.ok(wf, `missing workflow ${id}`)
    assert.equal(wf!.workflowId, id)
    assert.ok(wf!.kind === "workflow" || wf!.kind === "prep", `${id} kind`)
    assert.ok(wf!.steps.length >= minSteps, `${id} steps ${wf!.steps.length} < ${minSteps}`)
    assert.ok(wf!.title.length > 0)
    assert.ok(wf!.goal.length > 0)
    for (const step of wf!.steps) {
      assert.ok(step.title.length > 0, `${id}/${step.id} title`)
      assert.ok(step.body.length > 0, `${id}/${step.id} body`)
    }
  }
})

test("workflow flowchart assets exist under public/tutorial/flowcharts", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..")
  const expected = [
    "/tutorial/flowcharts/01-positioning-content.png",
    "/tutorial/flowcharts/02-digital-human.png",
    "/tutorial/flowcharts/03-image-video.png",
    "/tutorial/flowcharts/04-mashup-video.png",
    "/tutorial/flowcharts/05-promo-video.png",
    "/tutorial/flowcharts/06-geo-growth.png",
  ]
  for (const publicPath of expected) {
    const diskPath = join(root, "public", ...publicPath.replace(/^\//, "").split("/"))
    assert.equal(existsSync(diskPath), true, `missing ${diskPath}`)
  }
  for (const wf of TUTORIAL_WORKFLOWS) {
    if (!wf.flowchart) continue
    assert.ok(expected.includes(wf.flowchart), `unexpected flowchart ${wf.flowchart}`)
  }
})

test("starting workflow scenarios does not touch business storage keys", () => {
  const storage = createMemoryStorage({
    [DRAFT_STORAGE_KEY]: JSON.stringify({ keep: true }),
    [HISTORY_STORAGE_KEY]: JSON.stringify([{ id: "user-hist" }]),
    [IP_POSITIONING_SESSION_KEY]: JSON.stringify({ report: null }),
  })
  withMockBrowserEnv(storage, () => {
    for (const wf of TUTORIAL_WORKFLOWS) {
      markScenarioCompleted(wf.id)
      saveTutorialStepCursor(wf.id, 0)
    }
    assert.equal(storage.getItem(DRAFT_STORAGE_KEY), JSON.stringify({ keep: true }))
    assert.equal(storage.getItem(HISTORY_STORAGE_KEY), JSON.stringify([{ id: "user-hist" }]))
    assert.equal(
      storage.getItem(IP_POSITIONING_SESSION_KEY),
      JSON.stringify({ report: null }),
    )
    assert.ok(storage.getItem(TUTORIAL_PROGRESS_KEY))
  })
})

test("saveTutorialProgress merges without wiping completions", () => {
  const storage = createMemoryStorage()
  withMockBrowserEnv(storage, () => {
    markScenarioCompleted("a")
    saveTutorialProgress({ lastScenarioId: "b" })
    const p = loadTutorialProgress()
    assert.deepEqual(p.completedScenarios, ["a"])
    assert.equal(p.lastScenarioId, "b")
  })
})

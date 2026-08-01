import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { initialTutorialProgress } from "../lib/tutorial/progress-store.ts"

const layoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8")
const providerSource = readFileSync(new URL("../components/tutorial/tutorial-provider.tsx", import.meta.url), "utf8")

test("主题初始化脚本在 head 中以 beforeInteractive 方式注入", () => {
  const head = layoutSource.match(/<head>[\s\S]*?<\/head>/)?.[0] ?? ""
  const body = layoutSource.match(/<body[\s\S]*?<\/body>/)?.[0] ?? ""

  assert.match(head, /strategy="beforeInteractive"/)
  assert.match(head, /dangerouslySetInnerHTML/)
  assert.doesNotMatch(body, /<Script/)
})

test("教程 Provider 使用确定性首屏快照并在 effect 中恢复本地进度", () => {
  assert.deepEqual(initialTutorialProgress(), {
    version: 1,
    completedScenarios: [],
    updatedAt: 0,
  })
  assert.match(providerSource, /useState<TutorialProgress>\(initialTutorialProgress\)/)
  assert.match(providerSource, /setProgress\(loadTutorialProgress\(\)\)/)
  assert.doesNotMatch(providerSource, /typeof window === "undefined" \? loadTutorialProgress/)
})

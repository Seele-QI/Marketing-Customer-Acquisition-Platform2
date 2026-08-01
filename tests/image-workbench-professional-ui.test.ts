import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const read = (path: string) => readFileSync(path, "utf8")

test("image workbench public UI never exposes provider branding", () => {
  const publicSources = [
    read("components/image-workbench/image-workbench.tsx"),
    read("components/image-workbench/image-result-gallery.tsx"),
    read("components/image-workbench/image-result-canvas.tsx"),
    read("components/image-workbench/image-prompt-composer.tsx"),
    read("components/image-workbench/image-workbench-toolbar.tsx"),
    read("components/image-workbench/poster-creation-panel.tsx"),
    read("components/image-workbench/image-creation-panel.tsx"),
    read("components/dashboard-view.tsx"),
  ].join("\n")

  assert.doesNotMatch(publicSources, /RunningHub/i)
  assert.doesNotMatch(publicSources, /\bG-2\b/i)
  assert.match(publicSources, /图片生成引擎|创作服务|候选图/)
})

test("professional workbench uses a compact studio shell", () => {
  const workbench = read("components/image-workbench/image-workbench.tsx")

  assert.match(workbench, /ImageWorkbenchToolbar/)
  assert.match(workbench, /lg:grid-cols-\[320px_minmax\(0,1fr\)\]/)
  assert.doesNotMatch(workbench, /bg-gradient-to-r/)
  assert.doesNotMatch(workbench, /IMAGE STUDIO/)
})

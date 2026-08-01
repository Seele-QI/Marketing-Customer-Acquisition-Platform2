import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const view = readFileSync("components/poster-creation-workspace.tsx", "utf8")
const workbench = readFileSync(
  "components/image-workbench/image-workbench.tsx",
  "utf8",
)
const form = readFileSync(
  "components/image-workbench/poster-creation-panel.tsx",
  "utf8",
)
const ratioSelector = readFileSync(
  "components/image-workbench/image-ratio-selector.tsx",
  "utf8",
)
const gallery = readFileSync(
  "components/image-workbench/image-result-canvas.tsx",
  "utf8",
)
const registry = readFileSync("lib/business-assistant/registry.ts", "utf8")

test("poster compatibility entry routes to the shared image workbench", () => {
  assert.match(view, /ImageWorkbench as PosterCreationWorkspace/)
  assert.match(workbench, /PosterCreationPanel/)
  assert.match(workbench, /ImageCreationPanel/)
  assert.match(workbench, /submitImageWorkbenchTask/)
  assert.match(workbench, /waitForImageWorkbenchResult/)
  assert.doesNotMatch(workbench, /callArkImagesGeneration/)
})

test("poster form supports ratio families and portrait or landscape output", () => {
  assert.match(form, /ImageRatioSelector/)
  assert.match(ratioSelector, /IMAGE_RATIO_FAMILIES/)
  assert.match(ratioSelector, /portrait/)
  assert.match(ratioSelector, /landscape/)
  for (const ratio of ["1:1", "3:4", "9:16", "9:25"]) {
    assert.ok(
      ratioSelector.includes(ratio) ||
        ratioSelector.includes("IMAGE_RATIO_FAMILIES"),
    )
  }
})

test("poster result preview follows the generated ratio without cropping", () => {
  assert.match(gallery, /aspectRatio/)
  assert.match(gallery, /object-contain/)
  assert.match(gallery, /download=/)
})

test("poster stays outside the business-assistant registry", () => {
  assert.match(gallery, /download=/)
  assert.equal(registry.includes('id: "poster'), false)
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const shell = readFileSync("components/image-workbench/image-workbench.tsx", "utf8")
const tabs = readFileSync("components/image-workbench/workbench-mode-tabs.tsx", "utf8")
const poster = readFileSync("components/image-workbench/poster-creation-panel.tsx", "utf8")
const image = readFileSync("components/image-workbench/image-creation-panel.tsx", "utf8")
const uploader = readFileSync("components/image-workbench/reference-image-uploader.tsx", "utf8")
const gallery = readFileSync("components/image-workbench/image-result-gallery.tsx", "utf8")
const canvas = readFileSync("components/image-workbench/image-result-canvas.tsx", "utf8")
const composer = readFileSync("components/image-workbench/image-prompt-composer.tsx", "utf8")
const toolbar = readFileSync("components/image-workbench/image-workbench-toolbar.tsx", "utf8")

test("image workbench has two persistent business sections", () => {
  assert.match(toolbar, /图片工作台/)
  assert.match(shell, /ImageWorkbenchToolbar/)
  assert.match(shell, /ImagePromptComposer/)
  assert.match(shell, /ImageResultCanvas/)
  assert.match(shell, /PosterCreationPanel/)
  assert.match(shell, /ImageCreationPanel/)
  assert.match(shell, /submitImageWorkbenchTask/)
  assert.match(tabs, /海报图创作/)
  assert.match(tabs, /图片创作/)
  assert.match(tabs, /aria-pressed/)
})

test("poster and general image panels expose different templates and references", () => {
  for (const label of ["品牌宣传", "活动促销", "新品发布", "知识海报"]) {
    assert.match(poster, new RegExp(label))
  }
  assert.match(poster, /商品 \/ 主体图/)
  assert.match(poster, /风格参考图/)

  for (const label of ["电商主图", "人物写真", "场景设计", "社媒配图", "自由创作"]) {
    assert.match(image, new RegExp(label))
  }
  for (const label of ["保持主体", "参考风格", "综合重绘"]) {
    assert.match(image, new RegExp(label))
  }
  assert.match(image, /maxFiles=\{4\}/)
})

test("reference uploader and result canvas preserve usable source images", () => {
  assert.match(uploader, /image\/jpeg,image\/png,image\/webp/)
  assert.match(uploader, /10MB/)
  assert.match(uploader, /onRemove/)
  assert.match(uploader, /onMove/)
  assert.match(gallery, /ImageResultCanvas/)
  assert.match(canvas, /aspectRatio/)
  assert.match(canvas, /object-contain/)
  assert.match(canvas, /download=/)
  assert.match(canvas, /设为参考/)
  assert.match(canvas, /再次生成/)
  assert.match(composer, /生成 2 张/)
  assert.match(composer, /20 积分/)
  assert.doesNotMatch(shell, /callArkImagesGeneration/)
})

# 图片工作台专业创作台改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将图片工作台重构为专业的参数面板、作品画布和底部提示词操作台，同时彻底移除用户可见的底层供应商信息。

**Architecture:** 保留现有生成 API、计费和任务轮询，在前端新增工作台壳层、提示词操作台和结果画布。两个创作面板继续分别拥有业务字段与参考图规则，但把主提示词、生成动作和最后一次请求交给工作台协调，以支持固定操作台、再次生成和将结果设为参考图。

**Tech Stack:** Next.js App Router、React、TypeScript、Tailwind CSS、FastAPI、node:test、pytest、Playwright

---

## 文件结构

- Create: `components/image-workbench/image-workbench-toolbar.tsx`
  - 紧凑标题栏、模式切换、积分和当前会话任务入口。
- Create: `components/image-workbench/image-prompt-composer.tsx`
  - 底部主提示词、输出摘要、参考图数量和生成主操作。
- Create: `components/image-workbench/image-result-canvas.tsx`
  - 空、生成、失败、部分成功和成功状态，以及结果操作。
- Modify: `components/image-workbench/image-workbench.tsx`
  - 统一协调双模式草稿、任务、再次生成和生成结果转参考图。
- Modify: `components/image-workbench/poster-creation-panel.tsx`
  - 改为专业参数检查器，移除面板内生成按钮，接收底部创意描述。
- Modify: `components/image-workbench/image-creation-panel.tsx`
  - 改为专业参数检查器，把主画面描述交给底部操作台。
- Modify: `components/image-workbench/image-ratio-selector.tsx`
  - 收敛为紧凑分段控件。
- Modify: `components/image-workbench/reference-image-uploader.tsx`
  - 收敛上传槽视觉，并支持生成结果写回。
- Modify: `components/image-workbench/image-result-gallery.tsx`
  - 兼容导出到新结果画布，避免旧入口失效。
- Modify: `lib/image-workbench/poster-prompt.ts`
  - 把底部创意描述合入海报提示词。
- Modify: `lib/image-workbench/reference-images.ts`
  - 增加从生成结果 URL 构造参考图的工具。
- Modify: `main.py`
  - 图片工作台状态使用产品级文案，供应商异常不原样返回浏览器。
- Modify: `AGENTS.md`
  - 登记供应商信息仅允许出现在内部运维边界。
- Test: `tests/image-workbench-professional-ui.test.ts`
- Test: `tests/image-workbench-prompts.test.ts`
- Test: `tests/image-workbench-reference-images.test.ts`
- Test: `tests/test_image_workbench.py`
- Test: `tests/image-workbench-ui.test.ts`

### Task 1: 供应商信息脱敏边界

**Files:**
- Create: `tests/image-workbench-professional-ui.test.ts`
- Modify: `components/image-workbench/image-workbench.tsx`
- Modify: `components/image-workbench/image-result-gallery.tsx`
- Modify: `main.py`
- Modify: `tests/test_image_workbench.py`

- [ ] **Step 1: 写前端失败测试**

测试读取图片工作台源文件并断言用户可见组件中不存在供应商名称或模型商品名：

```ts
const publicSources = [
  readFileSync("components/image-workbench/image-workbench.tsx", "utf8"),
  readFileSync("components/image-workbench/image-result-gallery.tsx", "utf8"),
].join("\n")

assert.doesNotMatch(publicSources, /RunningHub/i)
assert.doesNotMatch(publicSources, /\bG-2\b/i)
assert.match(publicSources, /图片生成引擎|创作服务|候选图/)
```

- [ ] **Step 2: 写后端失败测试**

覆盖状态文案和异常清洗：

```python
def test_image_workbench_status_never_exposes_provider_name(monkeypatch):
    # 模拟底层抛出包含供应商名称与控制台指引的异常。
    # 查询状态只能得到产品级错误，不含供应商名称。
    assert "RunningHub" not in payload["error"]
    assert payload["error"] == "创作服务暂时繁忙，请稍后重试。"
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-professional-ui.test.ts
python -m pytest tests/test_image_workbench.py -k provider -v
```

Expected: FAIL，现有组件与阶段文案仍包含供应商信息。

- [ ] **Step 4: 实现产品级状态与错误清洗**

前端阶段文案统一为：

```ts
stageLabel: "正在准备创作任务"
stageLabel: input.referenceImages.length
  ? "正在处理参考图并生成 2 张候选图"
  : "正在生成 2 张候选图"
```

后端新增只用于浏览器状态的清洗函数：

```python
def _public_image_workbench_error(error: Exception) -> str:
    message = str(error)
    if "参考图" in message or "上传" in message:
        return "参考图处理失败，请更换图片后重试。"
    if "未返回结果" in message or "结果 URL" in message:
        return "候选图生成失败，本次未获得可用结果。"
    return "创作服务暂时繁忙，请稍后重试。"
```

内部日志记录原异常，任务状态只保存清洗后的 `error`。

- [ ] **Step 5: 运行测试确认通过**

Run:

```bash
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-professional-ui.test.ts
python -m pytest tests/test_image_workbench.py -k "provider or image_workbench" -v
```

Expected: PASS。

### Task 2: 工作台壳层与紧凑工具栏

**Files:**
- Create: `components/image-workbench/image-workbench-toolbar.tsx`
- Modify: `components/image-workbench/workbench-mode-tabs.tsx`
- Modify: `components/image-workbench/image-workbench.tsx`
- Modify: `tests/image-workbench-professional-ui.test.ts`
- Modify: `tests/image-workbench-ui.test.ts`

- [ ] **Step 1: 扩展失败测试**

```ts
const workbench = readFileSync(
  "components/image-workbench/image-workbench.tsx",
  "utf8",
)
assert.match(workbench, /ImageWorkbenchToolbar/)
assert.match(workbench, /lg:grid-cols-\[320px_minmax\(0,1fr\)\]/)
assert.doesNotMatch(workbench, /bg-gradient-to-r/)
assert.doesNotMatch(workbench, /IMAGE STUDIO/)
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```bash
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-professional-ui.test.ts tests/image-workbench-ui.test.ts
```

Expected: FAIL，工作台仍包含大渐变横幅和旧卡片布局。

- [ ] **Step 3: 创建工具栏**

`ImageWorkbenchToolbar` 接口：

```ts
type ImageWorkbenchToolbarProps = {
  mode: ImageWorkbenchMode
  onModeChange: (mode: ImageWorkbenchMode) => void
  taskCount: number
}
```

工具栏展示“图片工作台”、“创作服务可用”、两种模式、单次 20 积分和当前会话任务数。服务状态不探测外部供应商，仅表达当前前端可提交状态。

- [ ] **Step 4: 重构工作台结构**

桌面结构：

```tsx
<main className="min-h-0 flex-1 overflow-hidden bg-[#eef0f3]">
  <div className="flex h-full min-h-[720px] flex-col">
    <ImageWorkbenchToolbar ... />
    <div className="grid min-h-0 flex-1 lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-y-auto border-r ...">...</aside>
      <section className="relative min-h-[620px] min-w-0">...</section>
    </div>
  </div>
</main>
```

移动端使用单列，结果画布在参数区之前，设置区通过原生 `<details>` 展开，不使用模态框。

- [ ] **Step 5: 运行测试确认通过**

Run:

```bash
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-professional-ui.test.ts tests/image-workbench-ui.test.ts tests/image-workbench-navigation.test.ts
```

Expected: PASS。

### Task 3: 参数检查器与底部提示词操作台

**Files:**
- Create: `components/image-workbench/image-prompt-composer.tsx`
- Modify: `components/image-workbench/poster-creation-panel.tsx`
- Modify: `components/image-workbench/image-creation-panel.tsx`
- Modify: `components/image-workbench/image-ratio-selector.tsx`
- Modify: `components/image-workbench/reference-image-uploader.tsx`
- Modify: `components/image-workbench/image-workbench.tsx`
- Modify: `lib/image-workbench/poster-prompt.ts`
- Modify: `tests/image-workbench-prompts.test.ts`
- Modify: `tests/image-workbench-professional-ui.test.ts`

- [ ] **Step 1: 写海报创意描述失败测试**

```ts
const prompt = buildPosterWorkbenchPrompt({
  template: "品牌宣传",
  purpose: "新品发布",
  headline: "轻盈新生",
  body: "限时上市",
  creativeDirection: "暖灰背景，产品居中，右侧留白",
  style: "高级简约",
  aspectRatio: "3:4",
  orientation: "portrait",
  referenceRoles: [],
})
assert.match(prompt, /暖灰背景，产品居中，右侧留白/)
```

- [ ] **Step 2: 写操作台结构失败测试**

```ts
const composer = readFileSync(
  "components/image-workbench/image-prompt-composer.tsx",
  "utf8",
)
assert.match(composer, /生成 2 张/)
assert.match(composer, /20 积分/)
assert.match(composer, /referenceCount/)
assert.match(composer, /outputLabel/)
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-prompts.test.ts tests/image-workbench-professional-ui.test.ts
```

Expected: FAIL，海报提示词没有创意描述，操作台文件不存在。

- [ ] **Step 4: 扩展海报提示词合同**

```ts
export type PosterWorkbenchPromptInput = {
  template: string
  purpose: string
  headline: string
  body: string
  creativeDirection: string
  style: string
  aspectRatio: ImageAspectRatio
  orientation: ImageOrientation
  referenceRoles: ReferenceRole[]
}
```

只有 `creativeDirection.trim()` 非空时才加入“画面创意”行。

- [ ] **Step 5: 创建提示词操作台**

```ts
type ImagePromptComposerProps = {
  mode: ImageWorkbenchMode
  value: string
  onChange: (value: string) => void
  loading: boolean
  canGenerate: boolean
  referenceCount: number
  outputLabel: string
  onGenerate: () => void
}
```

输入框支持多行；按钮显示“生成 2 张 · 20 积分”；生成期间显示业务阶段并禁用重复提交。

- [ ] **Step 6: 面板发布可生成草稿**

两个面板移除自身生成按钮，并新增：

```ts
type PanelDraft = {
  request: SubmitImageWorkbenchInput | null
  referenceCount: number
  outputLabel: string
}

type PanelProps = {
  loading: boolean
  creativePrompt: string
  referenceSeed?: GeneratedReferenceSeed
  onDraftChange: (draft: PanelDraft) => void
}
```

图片模式把 `creativePrompt` 作为 `description`；海报模式把它作为 `creativeDirection`。面板字段变化后通过 `useEffect` 发布最新请求。

- [ ] **Step 7: 收敛检查器控件**

- 模板使用紧凑的分段按钮。
- 参数组用 1px 分隔线而非嵌套卡片。
- 比例保持四列，方向与清晰度保持两列。
- 上传区采用 72 至 88 像素缩略槽，不使用大面积虚线框。
- 统一蓝色选中态，删除图片工作台内所有 violet、fuchsia、rose 主题类。

- [ ] **Step 8: 运行测试确认通过**

Run:

```bash
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-prompts.test.ts tests/image-workbench-professional-ui.test.ts tests/image-workbench-reference-images.test.ts
npx tsc --noEmit
```

Expected: PASS，TypeScript 无错误。

### Task 4: 专业结果画布与结果复用

**Files:**
- Create: `components/image-workbench/image-result-canvas.tsx`
- Modify: `components/image-workbench/image-result-gallery.tsx`
- Modify: `components/image-workbench/image-workbench.tsx`
- Modify: `lib/image-workbench/reference-images.ts`
- Modify: `tests/image-workbench-reference-images.test.ts`
- Modify: `tests/image-workbench-professional-ui.test.ts`

- [ ] **Step 1: 写生成结果转参考图失败测试**

```ts
const reference = await generatedImageUrlToReference(
  "/static/image-workbench/example.png",
  "general",
  fetchMock,
)
assert.equal(reference.role, "general")
assert.equal(reference.mimeType, "image/png")
assert.match(reference.dataBase64, /^[A-Za-z0-9+/]+=*$/)
assert.equal(reference.previewUrl, "/static/image-workbench/example.png")
```

- [ ] **Step 2: 写结果操作结构失败测试**

```ts
const canvas = readFileSync(
  "components/image-workbench/image-result-canvas.tsx",
  "utf8",
)
assert.match(canvas, /下载/)
assert.match(canvas, /设为参考/)
assert.match(canvas, /再次生成/)
assert.match(canvas, /onUseAsReference/)
assert.match(canvas, /onRegenerate/)
```

- [ ] **Step 3: 运行测试确认失败**

Run:

```bash
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-reference-images.test.ts tests/image-workbench-professional-ui.test.ts
```

Expected: FAIL，URL 转参考图工具与结果画布尚不存在。

- [ ] **Step 4: 实现 URL 转参考图**

```ts
export async function generatedImageUrlToReference(
  url: string,
  role: ReferenceRole,
  fetcher: typeof fetch = fetch,
): Promise<WorkbenchReferenceImage> {
  const response = await fetcher(url)
  if (!response.ok) throw new Error("生成结果读取失败")
  const blob = await response.blob()
  const mimeType = blob.type as WorkbenchReferenceImage["mimeType"]
  const file = new File([blob], `generated-${Date.now()}.${mimeExtension(mimeType)}`, {
    type: mimeType,
  })
  const dataBase64 = await fileToBase64(file)
  return { id: crypto.randomUUID(), name: file.name, role, mimeType, dataBase64, previewUrl: url }
}
```

复用现有 MIME 与 10MB 校验；读取失败时显示“无法把该结果设为参考图，请先下载后上传”。

- [ ] **Step 5: 创建结果画布**

结果画布接口：

```ts
type ImageResultCanvasProps = ImageWorkbenchResultState & {
  mode: ImageWorkbenchMode
  onUseAsReference: (url: string, role: ReferenceRole) => void
  onRegenerate: () => void
}
```

海报结果分别提供“设为主体图”和“设为风格图”；图片结果提供“设为参考图”。两张图按输出比例并排，移动端单列。

- [ ] **Step 6: 缓存最后请求并实现再次生成**

工作台保存：

```ts
const lastSubmissions = useRef<
  Partial<Record<ImageWorkbenchMode, SubmitImageWorkbenchInput>>
>({})
```

每次成功提交前写入；“再次生成”只调用 `generate(lastSubmissions.current[mode])`，仍通过原计费路由产生一次新扣费。

- [ ] **Step 7: 将生成结果写回对应面板**

工作台生成 `GeneratedReferenceSeed` 并传入当前面板。面板消费后：

- 海报替换对应角色槽位。
- 图片模式在未满四张时追加。
- 达上限不覆盖现有参考图，展示可恢复提示。

- [ ] **Step 8: 运行测试确认通过**

Run:

```bash
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/image-workbench-reference-images.test.ts tests/image-workbench-professional-ui.test.ts tests/image-workbench-ui.test.ts
npx tsc --noEmit
```

Expected: PASS。

### Task 5: 响应式、文档和端到端验收

**Files:**
- Modify: `AGENTS.md`
- Modify: `tests/image-workbench-ui.test.ts`
- Modify: `tests/poster-creation-view.test.ts`

- [ ] **Step 1: 更新运维契约**

在图片工作台章节注明：

```md
- 底层图片供应商及模型商品名属于内部运维信息，禁止出现在图片工作台页面、浏览器安全错误、加载状态或帮助文案中；浏览器统一使用“创作服务”“图片生成引擎”“候选图”等产品级名称。
```

- [ ] **Step 2: 运行完整前端相关测试**

Run:

```bash
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test \
  tests/image-workbench-types.test.ts \
  tests/image-workbench-prompts.test.ts \
  tests/image-workbench-reference-images.test.ts \
  tests/image-workbench-api.test.ts \
  tests/image-workbench-route.test.ts \
  tests/image-workbench-ui.test.ts \
  tests/image-workbench-navigation.test.ts \
  tests/image-workbench-professional-ui.test.ts \
  tests/poster-creation-view.test.ts \
  tests/credit-pricing.test.ts \
  tests/with-auth-service-errors.test.ts
```

Expected: 全部通过。

- [ ] **Step 3: 运行完整后端相关测试**

Run:

```bash
python -m pytest \
  tests/test_image_workbench.py \
  tests/test_poster_generation.py \
  tests/test_video_cover.py \
  tests/test_api_auth.py -q
```

Expected: 全部通过。

- [ ] **Step 4: 运行类型检查**

Run:

```bash
npx tsc --noEmit
```

Expected: exit 0，无 TypeScript 错误。

- [ ] **Step 5: Playwright 桌面验收**

在 1600×1000 视口打开图片工作台，验证：

- 无大渐变 Hero。
- 工具栏、左侧参数、两张候选画布和底部提示词操作台同时可见。
- 海报与图片模式可切换。
- 页面可见文本不包含供应商名称或模型商品名。
- 浏览器 `pageerror` 为空。

- [ ] **Step 6: Playwright 移动验收**

在 430×932 视口验证：

- 模式切换不溢出。
- 结果区优先于展开设置区。
- 提示词与生成按钮不被全局业务助理遮挡。
- 四种比例入口可操作。

- [ ] **Step 7: 差异与泄漏扫描**

Run:

```bash
rg -n -i "runninghub|G-2" components/image-workbench app/api/image-workbench
git diff --check -- components/image-workbench lib/image-workbench app/api/image-workbench main.py tests AGENTS.md
```

Expected: 第一条只允许在非用户可见的内部 API 注释或测试夹具中出现；第二条无空白错误。

- [ ] **Step 8: 提交改版**

只暂存本计划涉及文件：

```bash
git add \
  components/image-workbench \
  lib/image-workbench \
  main.py \
  tests/image-workbench-professional-ui.test.ts \
  tests/image-workbench-prompts.test.ts \
  tests/image-workbench-reference-images.test.ts \
  tests/image-workbench-ui.test.ts \
  tests/poster-creation-view.test.ts \
  tests/test_image_workbench.py \
  AGENTS.md
git commit -m "feat: redesign image workbench as professional studio"
```

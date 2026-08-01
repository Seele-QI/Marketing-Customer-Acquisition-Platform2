import assert from "node:assert/strict"
import test from "node:test"

import { generateOneArticle } from "../lib/geo/article-generate.ts"
import type { ArticleJob } from "../lib/geo/article-types.ts"
import type { CompleteTextParams } from "../lib/geo/llm/router.ts"

const job: ArticleJob = {
  jobId: "job-1",
  mode: "direction",
  platformId: "zhihu",
  title: "小微企业办税入门",
  brief: "新手办理清单",
  projectId: "matrix-project-1",
}

function validArticle(): string {
  const detail = "说明适用条件、办理动作和需要核验的边界，具体结果以主管部门要求为准。"
  return `小微企业办税入门

一、先确认适用范围
${detail.repeat(10)}

二、准备有效材料
${detail.repeat(10)}

三、按节点完成核验
${detail.repeat(10)}

总结
先核对企业情况，再按所在地现行要求办理；政策变化时应重新确认。

标签：#小微企业 #办税指南 #合规经营`
}

test("valid output uses one completion call", async () => {
  let calls = 0
  const article = await generateOneArticle(job, {
    provider: "deepseek",
    batchId: "batch-1",
    complete: async () => {
      calls++
      return validArticle()
    },
  })

  assert.equal(article.status, "success")
  assert.equal(article.projectId, "matrix-project-1")
  assert.equal(calls, 1)
})

test("over-limit output is rewritten once", async () => {
  const outputs = [
    `标题\n\n${"普通内容。".repeat(400)}\n\n标签：#A #B #C`,
    validArticle(),
  ]
  const calls: CompleteTextParams[] = []
  const article = await generateOneArticle(job, {
    provider: "deepseek",
    batchId: "batch-1",
    userId: 7,
    cookieHeader: "session_id=test",
    complete: async (params) => {
      calls.push(params)
      return outputs[calls.length - 1]!
    },
  })

  assert.equal(article.status, "success")
  assert.equal(calls.length, 2)
  assert.match(calls[1]!.user, /全文超过 1200 字/)
  assert.match(calls[1]!.billing?.refIdPrefix ?? "", /:rewrite$/)
})

test("risk language triggers one corrective rewrite", async () => {
  const outputs = [
    validArticle().replace("具体结果以主管部门要求为准", "保证通过"),
    validArticle(),
  ]
  let calls = 0
  const article = await generateOneArticle(job, {
    provider: "deepseek",
    batchId: "batch-1",
    complete: async () => outputs[calls++]!,
  })

  assert.equal(article.status, "success")
  assert.equal(calls, 2)
})

test("remaining prohibited language triggers a fresh automatic creation", async () => {
  const calls: CompleteTextParams[] = []
  const outputs = [
    validArticle().replace("具体结果以主管部门要求为准", "保证通过"),
    validArticle().replace("具体结果以主管部门要求为准", "保证通过"),
    validArticle(),
  ]
  const article = await generateOneArticle(job, {
    provider: "deepseek",
    batchId: "batch-1",
    complete: async (params) => {
      calls.push(params)
      return outputs[calls.length - 1]!
    },
  })

  assert.equal(article.status, "success")
  assert.equal(calls.length, 3)
  assert.match(calls[2]!.user, /重新创作/)
  assert.doesNotMatch(calls[2]!.user, /保证通过/)
})

test("provider prohibited-word rejection is retried without returning a failed article", async () => {
  let calls = 0
  const article = await generateOneArticle(job, {
    provider: "deepseek",
    batchId: "batch-1",
    complete: async () => {
      calls += 1
      if (calls === 1) throw new Error("内容包含违禁词，审核未通过")
      return validArticle()
    },
  })

  assert.equal(article.status, "success")
  assert.equal(calls, 2)
})

test("persistent invalid output is bounded instead of retrying forever", async () => {
  let calls = 0
  const article = await generateOneArticle(job, {
    provider: "deepseek",
    batchId: "batch-1",
    complete: async () => {
      calls++
      return "保证通过。"
    },
  })

  assert.equal(article.status, "failed")
  assert.equal(calls, 4)
  assert.equal(article.markdown, "")
  assert.match(article.error ?? "", /自动重新创作/)
})

test("empty first output fails without spending a rewrite call", async () => {
  let calls = 0
  const article = await generateOneArticle(job, {
    provider: "deepseek",
    batchId: "batch-1",
    complete: async () => {
      calls++
      return "   "
    },
  })

  assert.equal(article.status, "failed")
  assert.equal(calls, 1)
  assert.match(article.error ?? "", /模型未返回有效正文/)
})

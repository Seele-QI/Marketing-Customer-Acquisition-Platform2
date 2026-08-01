import assert from "node:assert/strict"
import test from "node:test"

import {
  buildArticleRewritePrompt,
  buildArticleSystemPrompt,
  buildArticleUserPrompt,
} from "../lib/geo/article-prompt.ts"
import type { ArticleJob } from "../lib/geo/article-types.ts"

const job: ArticleJob = {
  jobId: "j1",
  mode: "direction",
  platformId: "dianping",
  title: "代账公司和个人会计哪个好",
  brief: "优缺点对比",
}

test("system prompt uses the approved target and hard ceiling", () => {
  const prompt = buildArticleSystemPrompt()
  assert.match(prompt, /900[–-]1100/)
  assert.match(prompt, /1200/)
  assert.doesNotMatch(prompt, /宜 600[–-]900/)
})

test("article prompt includes selected structure and platform compliance", () => {
  const prompt = buildArticleUserPrompt(job, {})
  assert.match(prompt, /900[–-]1100/)
  assert.match(prompt, /1200/)
  assert.match(prompt, /结构类型：对比问答/)
  assert.match(prompt, /虚构消费经历/)
  assert.doesNotMatch(prompt, /结构类型：新手清单/)
  assert.match(prompt, /只有标题或创作方向明确要求联系、咨询、预约或购买时/)
  assert.match(prompt, /不得主动写入电话、微信、邮箱或联系人/)
})

test("matrix format takes precedence when selecting the prompt structure", () => {
  const prompt = buildArticleUserPrompt(
    {
      ...job,
      mode: "matrix",
      matrixMeta: {
        themeArc: "创业复盘",
        format: "真实案例复盘",
        geoIntent: "经验说明",
        platformNative: "客观叙述",
      },
    },
    {},
  )
  assert.match(prompt, /结构类型：真实案例分享/)
})

test("rewrite prompt carries concrete failures and prohibits new facts", () => {
  const prompt = buildArticleRewritePrompt({
    job,
    original: "原文",
    structureId: "comparison",
    ctx: {
      modelSkillId: "strategy/model-a",
      viralSkillIds: ["platforms/zhihu"],
      enterpriseSnapshot: "enterprise official snapshot",
    },
    reasons: ["全文超过 1200 字", "存在无条件效果承诺"],
  })
  assert.match(prompt, /全文超过 1200 字/)
  assert.match(prompt, /存在无条件效果承诺/)
  assert.match(prompt, /不得新增无法验证的数据、经历、客户评价或政策结论/)
  assert.match(prompt, /结构类型：对比问答/)
  assert.match(prompt, /原文/)
})

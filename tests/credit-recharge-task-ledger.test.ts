import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

test("credit recharge view presents aggregated task bills", async () => {
  const source = await readFile(
    new URL("../components/credit-recharge-view.tsx", import.meta.url),
    "utf8",
  )

  assert.match(source, /最近任务账单/)
  assert.match(source, /按完整业务任务汇总展示/)
  assert.match(source, /零散模型调用不单列/)
  assert.match(source, /video_digital_human:\s*["']数字人视频创作["']/)
  assert.match(source, /geo_article_batch:\s*["']GEO 文章批量生成["']/)
  assert.match(source, /item\.breakdown/)
  assert.match(source, /entry_kind\s*===\s*["']business_task["']/)
  assert.match(source, /redeem_code:\s*["']兑换充值["']/)
  assert.match(source, /grid-cols-\[1\.15fr_1\.1fr_0\.75fr_0\.8fr_2\.2fr\]/)
  assert.match(source, /break-words text-muted-foreground/)
})

test("ledger type exposes task identity and stage breakdown", async () => {
  const source = await readFile(
    new URL("../lib/credit-types.ts", import.meta.url),
    "utf8",
  )

  assert.match(source, /id:\s*number\s*\|\s*string/)
  assert.match(source, /entry_kind\??:\s*["']ledger["']\s*\|\s*["']business_task["']/)
  assert.match(source, /breakdown\??:\s*Array/)
})

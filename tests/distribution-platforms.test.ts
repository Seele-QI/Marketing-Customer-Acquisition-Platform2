import assert from "node:assert/strict"
import test from "node:test"

import {
  VIDEO_PLATFORM_IDS,
  mergeDistributionPlatforms,
  readDistributionApiResponse,
} from "../lib/distribution/platforms.ts"

test("视频账号栏在接口不可用时仍保留四个平台", () => {
  const platforms = mergeDistributionPlatforms([], "video")
  assert.deepEqual(platforms.map((platform) => platform.platform_id), VIDEO_PLATFORM_IDS)
  assert.ok(platforms.every((platform) => platform.connection_health === "service_error"))
})

test("纯文本 500 被转换为中文错误而不是 JSON 解析异常", async () => {
  const response = new Response("Internal Server Error", {
    status: 500,
    headers: { "content-type": "text/plain" },
  })

  const result = await readDistributionApiResponse(response, "加载平台失败")
  assert.equal(result.ok, false)
  assert.equal(result.message, "账号服务暂时不可用，请稍后重试")
})

test("JSON 错误保留后端给出的可读说明", async () => {
  const response = new Response(JSON.stringify({ detail: "登录已过期" }), {
    status: 401,
    headers: { "content-type": "application/json" },
  })

  const result = await readDistributionApiResponse(response, "加载平台失败")
  assert.equal(result.ok, false)
  assert.equal(result.message, "登录已过期")
})

test("HTTP 200 的业务失败仍保留后端浏览器错误", async () => {
  const response = new Response(JSON.stringify({
    success: false,
    error: "浏览器配置被其他登录窗口占用",
    code: "profile_in_use",
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  })

  const result = await readDistributionApiResponse(response, "启动浏览器失败")
  assert.equal(result.ok, true)
  assert.equal(result.message, "浏览器配置被其他登录窗口占用")
})

import { NextResponse } from "next/server"

import {
  getAvailablePlanLlmProviders,
  isLlmPlanAvailable,
} from "@/lib/dh-video-v2/plan-script-ai"

export const runtime = "nodejs"

/**
 * 分镜 LLM Key 就绪探测（安装包 sync 后轮询用，无需登录）。
 * 不泄露 Key 值，仅返回是否可用与已启用供应商名。
 */
export async function GET() {
  const providers = getAvailablePlanLlmProviders()
  return NextResponse.json({
    ready: isLlmPlanAvailable(),
    providers,
  })
}

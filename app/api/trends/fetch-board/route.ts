import { NextResponse } from "next/server"
import { fetchTrendsBoard, getHotEndpoints } from "@/lib/tianapi-trends"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const name = searchParams.get("name") ?? ""
    const endpoints = getHotEndpoints()
    if (!name || !(name in endpoints)) {
      return NextResponse.json(
        { error: "缺少或非法的 name（榜单名）", allowed: Object.keys(endpoints) },
        { status: 400 },
      )
    }
    const data = await fetchTrendsBoard(name)
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : "请求失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}


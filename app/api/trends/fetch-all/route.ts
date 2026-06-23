import { NextResponse } from "next/server"
import { fetchAllTrendsSections } from "@/lib/tianapi-trends"

export async function GET() {
  try {
    const data = await fetchAllTrendsSections()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : "请求失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

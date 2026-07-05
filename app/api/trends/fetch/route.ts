import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { fetchNetworkHotList } from "@/lib/tianapi-trends"

export const GET = withAuth(async () => {
  try {
    const data = await fetchNetworkHotList()
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : "请求失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
})

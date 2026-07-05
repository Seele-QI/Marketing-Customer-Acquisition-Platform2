import { NextResponse } from "next/server"
import { listLlmProviders } from "@/lib/geo/llm/router"

export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({ providers: listLlmProviders() })
}

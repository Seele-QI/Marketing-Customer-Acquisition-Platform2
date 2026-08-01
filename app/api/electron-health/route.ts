export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  const generation = (process.env.ELECTRON_SERVICE_GENERATION ?? "").trim()
  const headers = new Headers({
    "Cache-Control": "no-store",
  })
  if (generation) {
    headers.set("X-Electron-Service-Generation", generation)
  }
  return Response.json({ status: "ok" }, { status: 200, headers })
}

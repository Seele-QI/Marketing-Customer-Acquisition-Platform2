import { getServerFastapiBase } from "@/lib/fastapi-base"
import type { MatrixProject } from "@/lib/geo/matrix-types"

export async function fetchOwnedMatrixProject(
  projectId: string,
  cookieHeader: string,
): Promise<MatrixProject | null> {
  const base = getServerFastapiBase()
  if (!base) return null
  try {
    const response = await fetch(
      `${base}/api/geo/matrix-projects/${encodeURIComponent(projectId)}`,
      {
        headers: { Cookie: cookieHeader },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      },
    )
    if (!response.ok) return null
    const payload = (await response.json()) as { project?: MatrixProject }
    return payload.project ?? null
  } catch {
    return null
  }
}

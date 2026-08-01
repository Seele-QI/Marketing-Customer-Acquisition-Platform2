import type {
  GenerateMatrixRequest,
  MatrixProject,
} from "@/lib/geo/matrix-types"
import { parseApiErrorResponse } from "@/lib/api/parse-detail"

const SUMMARY_TTL_MS = 30_000
/** CRUD / 详情：卡住时必须能结束 spinner */
const MATRIX_CRUD_TIMEOUT_MS = 20_000
/** 生成两周矩阵：服务端 maxDuration=180s，额外预留保存与响应传输时间。 */
const MATRIX_GENERATE_TIMEOUT_MS = 210_000
/** 上游可能先断开响应，但服务端仍会完成并落库；短轮询用于对账真实结果。 */
const MATRIX_RECONCILE_DELAYS_MS = [
  0,
  2_000,
  4_000,
  8_000,
  12_000,
  20_000,
  30_000,
  30_000,
  30_000,
] as const

let summaryCache: { at: number; projects: MatrixProject[] } | null = null
const detailCache = new Map<string, { at: number; project: MatrixProject }>()

function invalidateMatrixCaches(projectId?: string) {
  summaryCache = null
  if (projectId) {
    detailCache.delete(projectId)
  } else {
    detailCache.clear()
  }
}

function matrixFetchInit(
  init: RequestInit | undefined,
  timeoutMs: number,
): RequestInit {
  return {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
  }
}

function mapFetchError(err: unknown, fallback: string): Error {
  if (err instanceof DOMException && err.name === "TimeoutError") {
    return new Error(`${fallback}：请求超时，请稍后重试`)
  }
  if (err instanceof Error && err.name === "AbortError") {
    return new Error(`${fallback}：请求已取消或超时`)
  }
  if (err instanceof Error) return err
  return new Error(fallback)
}

function wait(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function matrixMatchesGeneration(
  project: MatrixProject | null,
  body: GenerateMatrixRequest,
  baselineUpdatedAt: number,
  generationStartedAtMs: number,
): project is MatrixProject {
  if (!project) return false
  const generatedPlatforms = project.matrix?.platforms ?? []
  if (generatedPlatforms.length < 1) return false
  const generatedAtMs = Date.parse(project.matrix.generatedAt ?? "")
  if (
    !Number.isFinite(generatedAtMs) ||
    generatedAtMs < generationStartedAtMs - 10_000
  ) {
    return false
  }
  if (project.updatedAt < baselineUpdatedAt) return false
  const requested = new Set(body.platforms.filter(Boolean))
  return (
    requested.size > 0 &&
    generatedPlatforms.every(
      (platform) =>
        requested.has(platform.platformId) &&
        Array.isArray(platform.cells) &&
        platform.cells.length > 0,
    ) &&
    [...requested].every((platformId) =>
      generatedPlatforms.some((platform) => platform.platformId === platformId),
    )
  )
}

async function reconcileGeneratedMatrix(
  id: string,
  body: GenerateMatrixRequest,
  baselineUpdatedAt: number,
  generationStartedAtMs: number,
): Promise<MatrixProject | null> {
  for (const delayMs of MATRIX_RECONCILE_DELAYS_MS) {
    await wait(delayMs)
    try {
      const project = await getMatrixProject(id, { force: true })
      if (
        matrixMatchesGeneration(
          project,
          body,
          baselineUpdatedAt,
          generationStartedAtMs,
        )
      ) {
        invalidateMatrixCaches(id)
        detailCache.set(id, { at: Date.now(), project })
        return project
      }
    } catch {
      // 对账查询也可能短暂失败，继续下一轮；最终仍抛出原始生成错误。
    }
  }
  return null
}

async function parseJson<T>(resp: Response, fallback = "请求失败"): Promise<T> {
  let data: { detail?: unknown; error?: string }
  try {
    data = (await resp.json()) as { detail?: unknown; error?: string }
  } catch {
    throw new Error(parseApiErrorResponse(resp.status, {}, fallback))
  }
  if (!resp.ok) {
    throw new Error(parseApiErrorResponse(resp.status, data, fallback))
  }
  return data as T
}

/** 轻量项目列表（默认不含 matrix / enterpriseSnapshot，加载更快） */
export async function listMatrixProjects(options?: {
  force?: boolean
  full?: boolean
}): Promise<MatrixProject[]> {
  const useSummary = !options?.full
  if (
    useSummary &&
    !options?.force &&
    summaryCache &&
    Date.now() - summaryCache.at < SUMMARY_TTL_MS
  ) {
    return summaryCache.projects
  }

  const query = useSummary ? "?summary=1" : "?summary=0"
  let resp: Response
  try {
    resp = await fetch(
      `/api/geo/matrix-projects${query}`,
      matrixFetchInit(
        {
          credentials: "include",
          cache: "no-store",
        },
        MATRIX_CRUD_TIMEOUT_MS,
      ),
    )
  } catch (err) {
    throw mapFetchError(err, "加载项目列表失败")
  }
  const data = await parseJson<{ projects: MatrixProject[] }>(resp, "加载项目列表失败")
  const projects = data.projects ?? []

  if (useSummary) {
    summaryCache = { at: Date.now(), projects }
  }
  return projects
}

export async function getMatrixProject(
  id: string,
  options?: { force?: boolean },
): Promise<MatrixProject | null> {
  const cached = detailCache.get(id)
  if (!options?.force && cached && Date.now() - cached.at < SUMMARY_TTL_MS) {
    return cached.project
  }

  let resp: Response
  try {
    resp = await fetch(
      `/api/geo/matrix-projects/${id}`,
      matrixFetchInit(
        {
          credentials: "include",
          cache: "no-store",
        },
        MATRIX_CRUD_TIMEOUT_MS,
      ),
    )
  } catch (err) {
    throw mapFetchError(err, "加载项目失败")
  }
  if (resp.status === 404) return null
  const data = await parseJson<{ project?: MatrixProject }>(resp, "加载项目失败")
  const project = data.project ?? null
  if (project) {
    detailCache.set(id, { at: Date.now(), project })
  }
  return project
}

export async function createMatrixProject(name: string): Promise<MatrixProject> {
  let resp: Response
  try {
    resp = await fetch(
      "/api/geo/matrix-projects",
      matrixFetchInit(
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name }),
        },
        MATRIX_CRUD_TIMEOUT_MS,
      ),
    )
  } catch (err) {
    throw mapFetchError(err, "新建项目失败")
  }
  const data = await parseJson<{ project: MatrixProject }>(resp, "新建项目失败")
  if (!data.project?.id) {
    throw new Error("新建项目失败：服务端未返回项目数据")
  }
  invalidateMatrixCaches()
  detailCache.set(data.project.id, { at: Date.now(), project: data.project })
  return data.project
}

export async function updateMatrixProject(
  id: string,
  patch: Partial<MatrixProject> & {
    matrix?: MatrixProject["matrix"]
    clearEnterpriseSnapshot?: boolean
  },
): Promise<MatrixProject> {
  let resp: Response
  try {
    resp = await fetch(
      `/api/geo/matrix-projects/${id}`,
      matrixFetchInit(
        {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: patch.name,
            platforms: patch.platforms,
            modelSkillId: patch.modelSkillId,
            viralSkillIds: patch.viralSkillIds,
            enterpriseSkillId: patch.enterpriseSkillId,
            enterpriseSnapshot: patch.enterpriseSnapshot,
            matrix: patch.matrix,
            clearEnterpriseSnapshot: patch.clearEnterpriseSnapshot,
          }),
        },
        MATRIX_CRUD_TIMEOUT_MS,
      ),
    )
  } catch (err) {
    throw mapFetchError(err, "更新项目失败")
  }
  const data = await parseJson<{ project: MatrixProject }>(resp)
  invalidateMatrixCaches(id)
  detailCache.set(data.project.id, { at: Date.now(), project: data.project })
  return data.project
}

export async function deleteMatrixProject(id: string): Promise<void> {
  let resp: Response
  try {
    resp = await fetch(
      `/api/geo/matrix-projects/${id}`,
      matrixFetchInit(
        {
          method: "DELETE",
          credentials: "include",
        },
        MATRIX_CRUD_TIMEOUT_MS,
      ),
    )
  } catch (err) {
    throw mapFetchError(err, "删除项目失败")
  }
  await parseJson<{ ok: boolean }>(resp)
  invalidateMatrixCaches(id)
}

export async function generateMatrixProject(
  id: string,
  body: GenerateMatrixRequest,
): Promise<MatrixProject> {
  const generationStartedAtMs = Date.now()
  const baselineUpdatedAt = detailCache.get(id)?.project.updatedAt ?? 0
  let resp: Response
  try {
    resp = await fetch(
      `/api/geo/matrix-projects/${id}/generate`,
      matrixFetchInit(
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
        MATRIX_GENERATE_TIMEOUT_MS,
      ),
    )
  } catch (err) {
    const recovered = await reconcileGeneratedMatrix(
      id,
      body,
      baselineUpdatedAt,
      generationStartedAtMs,
    )
    if (recovered) return recovered
    throw mapFetchError(err, "生成矩阵失败")
  }
  if ([408, 502, 503, 504].includes(resp.status)) {
    const recovered = await reconcileGeneratedMatrix(
      id,
      body,
      baselineUpdatedAt,
      generationStartedAtMs,
    )
    if (recovered) return recovered
  }
  const data = await parseJson<{ project: MatrixProject }>(resp)
  invalidateMatrixCaches(id)
  detailCache.set(data.project.id, { at: Date.now(), project: data.project })
  return data.project
}

import type {
  GenerateMatrixRequest,
  MatrixProject,
} from "@/lib/geo/matrix-types"
import { parseApiErrorResponse } from "@/lib/api/parse-detail"

async function parseJson<T>(resp: Response, fallback = "请求失败"): Promise<T> {
  let data: { detail?: unknown; error?: string }
  try {
    data = (await resp.json()) as { detail?: unknown; error?: string }
  } catch {
    throw new Error(
      resp.status === 503
        ? "后端服务未配置或未启动，请运行 pnpm dev:all"
        : `${fallback}（HTTP ${resp.status}，响应非 JSON）`,
    )
  }
  if (!resp.ok) {
    throw new Error(parseApiErrorResponse(resp.status, data, fallback))
  }
  return data as T
}

export async function listMatrixProjects(): Promise<MatrixProject[]> {
  const resp = await fetch("/api/geo/matrix-projects", { credentials: "include" })
  const data = await parseJson<{ projects: MatrixProject[] }>(resp, "加载项目列表失败")
  return data.projects ?? []
}

export async function getMatrixProject(id: string): Promise<MatrixProject | null> {
  const resp = await fetch(`/api/geo/matrix-projects/${id}`, { credentials: "include" })
  if (resp.status === 404) return null
  const data = await parseJson<{ project?: MatrixProject }>(resp, "加载项目失败")
  return data.project ?? null
}

export async function createMatrixProject(name: string): Promise<MatrixProject> {
  const resp = await fetch("/api/geo/matrix-projects", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  })
  const data = await parseJson<{ project: MatrixProject }>(resp, "新建项目失败")
  if (!data.project?.id) {
    throw new Error("新建项目失败：服务端未返回项目数据")
  }
  return data.project
}

export async function updateMatrixProject(
  id: string,
  patch: Partial<MatrixProject> & {
    matrix?: MatrixProject["matrix"]
    clearEnterpriseSnapshot?: boolean
  },
): Promise<MatrixProject> {
  const resp = await fetch(`/api/geo/matrix-projects/${id}`, {
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
      provider: patch.provider,
      matrix: patch.matrix,
      clearEnterpriseSnapshot: patch.clearEnterpriseSnapshot,
    }),
  })
  const data = await parseJson<{ project: MatrixProject }>(resp)
  return data.project
}

export async function deleteMatrixProject(id: string): Promise<void> {
  const resp = await fetch(`/api/geo/matrix-projects/${id}`, {
    method: "DELETE",
    credentials: "include",
  })
  await parseJson<{ ok: boolean }>(resp)
}

export async function generateMatrixProject(
  id: string,
  body: GenerateMatrixRequest,
): Promise<MatrixProject> {
  const resp = await fetch(`/api/geo/matrix-projects/${id}/generate`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
  const data = await parseJson<{ project: MatrixProject }>(resp)
  return data.project
}

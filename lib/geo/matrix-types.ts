export type MatrixCell = {
  date: string
  week: 1 | 2
  themeArc: string
  title: string
  contentDirection: string
  format: string
  geoIntent: string
  platformNative: string
}

export type PlatformMatrix = {
  platformId: string
  cells: MatrixCell[]
}

export type MatrixData = {
  platforms: PlatformMatrix[]
  generatedAt?: string
  skillId?: string
}

export type MatrixProject = {
  id: string
  userId: number
  name: string
  platforms: string[]
  modelSkillId: string | null
  viralSkillIds: string[]
  enterpriseSkillId: string | null
  enterpriseSnapshot: string | null
  provider: string
  matrix: MatrixData
  createdAt: number
  updatedAt: number
  /** 列表 summary 模式下是否已生成矩阵（不含 matrix 正文） */
  hasMatrix?: boolean
}

export type GenerateMatrixRequest = {
  provider: string
  platforms: string[]
  modelSkillId?: string | null
  viralSkillIds?: string[]
  enterpriseSkillId?: string | null
  enterpriseSnapshot?: string | null
}

export type GenerateMatrixResponse = {
  project: MatrixProject
}

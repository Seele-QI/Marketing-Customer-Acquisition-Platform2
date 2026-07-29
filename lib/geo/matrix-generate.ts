import {
  alignPlatformCellsToFourteenDays,
  assertMatrixFourteenDays,
  buildPlatformFillUserPrompt,
  buildSinglePlatformSystemPrompt,
  buildSinglePlatformUserPrompt,
  buildThemeArcSeedSystemPrompt,
  buildThemeArcSeedUserPrompt,
  mergePlatformMatrices,
  parseMatrixJson,
  parseThemeArcSeed,
  type ThemeArcSeed,
} from "@/lib/geo/content-matrix-prompt"
import {
  MATRIX_DAYS,
  matrixDateRange,
  matrixStartDateIso,
} from "@/lib/geo/matrix-platforms"
import type { MatrixCell, MatrixData, PlatformMatrix } from "@/lib/geo/matrix-types"

export type GenerateMatrixParams = {
  projectName: string
  platforms: string[]
  modelSkillId?: string | null
  viralSkillIds?: string[]
  enterpriseSnapshot?: string | null
  complete: MatrixTextCompletion
}

export type MatrixTextCompletion = (input: {
  system: string
  user: string
  maxTokens: number
  validateText: (text: string) => boolean
}) => Promise<string>

const MAX_TOKENS_SEED = 2048
const MAX_TOKENS_PLATFORM = 8192

function fallbackThemeSeed(startIso: string, projectName: string): ThemeArcSeed {
  const arc1 = `${projectName}认知建立`
  const arc2 = `${projectName}深化转化`
  const dates = matrixDateRange(startIso, MATRIX_DAYS)
  return {
    themeArcs: [arc1, arc2],
    days: dates.map((date, i) => ({
      date,
      week: (i < 7 ? 1 : 2) as 1 | 2,
      themeArc: i < 7 ? arc1 : arc2,
      dayTheme: i < 7 ? `W1 D${i + 1} 立题` : `W2 D${i + 1} 深化`,
    })),
  }
}

async function generateThemeSeed(
  params: GenerateMatrixParams,
  startIso: string,
): Promise<ThemeArcSeed> {
  try {
    const raw = await params.complete({
      system: buildThemeArcSeedSystemPrompt(),
      user: buildThemeArcSeedUserPrompt({
        projectName: params.projectName,
        platforms: params.platforms,
        modelSkillId: params.modelSkillId,
        viralSkillIds: params.viralSkillIds,
        enterpriseSnapshot: params.enterpriseSnapshot,
        startIso,
      }),
      maxTokens: MAX_TOKENS_SEED,
      validateText: (text) => {
        try {
          parseThemeArcSeed(text)
          return true
        } catch {
          return false
        }
      },
    })
    const seed = parseThemeArcSeed(raw)
    // 强制日期对齐到 startIso
    const dates = matrixDateRange(startIso, MATRIX_DAYS)
    return {
      themeArcs: seed.themeArcs.length ? seed.themeArcs : [params.projectName],
      days: dates.map((date, i) => {
        const fromSeed = seed.days[i]
        return {
          date,
          week: (i < 7 ? 1 : 2) as 1 | 2,
          themeArc:
            fromSeed?.themeArc ||
            seed.themeArcs[i < 7 ? 0 : Math.min(1, seed.themeArcs.length - 1)] ||
            params.projectName,
          dayTheme: fromSeed?.dayTheme || `D${i + 1}`,
        }
      }),
    }
  } catch {
    return fallbackThemeSeed(startIso, params.projectName)
  }
}

const REQUIRED_CELL_TEXT_FIELDS = [
  "themeArc",
  "title",
  "contentDirection",
  "format",
  "geoIntent",
  "platformNative",
] as const

function isUsableMatrixCell(cell: MatrixCell): boolean {
  if (!cell || typeof cell.date !== "string" || !cell.date.trim()) return false
  return REQUIRED_CELL_TEXT_FIELDS.every((field) => {
    const value = cell[field]
    return typeof value === "string" && Boolean(value.trim())
  })
}

function missingDatesForPlatform(
  cells: MatrixCell[],
  startIso: string,
): string[] {
  const dates = matrixDateRange(startIso, MATRIX_DAYS)
  const have = new Set(cells.filter(isUsableMatrixCell).map((cell) => cell.date))
  return dates.filter((d) => !have.has(d))
}

async function generateOnePlatform(
  params: GenerateMatrixParams,
  platformId: string,
  startIso: string,
  themeSeed: ThemeArcSeed,
): Promise<PlatformMatrix> {
  const system = buildSinglePlatformSystemPrompt()
  const user = buildSinglePlatformUserPrompt({
    projectName: params.projectName,
    platforms: params.platforms,
    platformId,
    themeSeed,
    modelSkillId: params.modelSkillId,
    viralSkillIds: params.viralSkillIds,
    enterpriseSnapshot: params.enterpriseSnapshot,
    startIso,
  })

  let cells: MatrixCell[] = []
  let lastError: unknown
  try {
    const raw = await params.complete({
      system,
      user,
      maxTokens: MAX_TOKENS_PLATFORM,
      validateText: (text) => {
        try {
          const parsed = parseMatrixJson(text)
          const platform =
            parsed.platforms.find((item) => item.platformId === platformId) ??
            parsed.platforms[0]
          return Boolean(platform?.cells?.some(isUsableMatrixCell))
        } catch {
          return false
        }
      },
    })
    const parsed = parseMatrixJson(raw)
    const pm =
      parsed.platforms.find((p) => p.platformId === platformId) ??
      parsed.platforms[0]
    cells = (pm?.cells ?? []).filter(isUsableMatrixCell)
  } catch (error) {
    lastError = error
    cells = []
  }

  let missing = missingDatesForPlatform(cells, startIso)
  if (missing.length > 0) {
    try {
      const fillRaw = await params.complete({
        system: "你只输出合法 JSON，不要 Markdown 或解释。",
        user: buildPlatformFillUserPrompt({
          platformId,
          startIso,
          missingDates: missing,
          existingCellsJson: JSON.stringify(cells),
          themeSeed,
          projectName: params.projectName,
          modelSkillId: params.modelSkillId,
          viralSkillIds: params.viralSkillIds,
          enterpriseSnapshot: params.enterpriseSnapshot,
        }),
        maxTokens: MAX_TOKENS_PLATFORM,
        validateText: (text) => {
          try {
            const parsed = parseMatrixJson(text)
            const platform =
              parsed.platforms.find((item) => item.platformId === platformId) ??
              parsed.platforms[0]
            return Boolean(platform?.cells?.some(isUsableMatrixCell))
          } catch {
            return false
          }
        },
      })
      const fillParsed = parseMatrixJson(fillRaw)
      const fillPm =
        fillParsed.platforms.find((p) => p.platformId === platformId) ??
        fillParsed.platforms[0]
      const filled = (fillPm?.cells ?? []).filter(isUsableMatrixCell)
      const byDate = new Map(cells.map((c) => [c.date, c]))
      for (const c of filled) {
        if (c?.date) byDate.set(c.date, c)
      }
      cells = [...byDate.values()]
    } catch (error) {
      lastError = error
    }
  }

  missing = missingDatesForPlatform(cells, startIso)
  if (missing.length > 0) {
    if (lastError instanceof Error) throw lastError
    throw Object.assign(
      new Error(`MATRIX_PLATFORM_INCOMPLETE: ${platformId} 缺少 ${missing.length} 天内容`),
      { statusCode: 502, code: "MATRIX_PLATFORM_INCOMPLETE" },
    )
  }

  const fallbackArc = themeSeed.themeArcs[0] || params.projectName
  return alignPlatformCellsToFourteenDays(platformId, cells, startIso, fallbackArc)
}

/**
 * Phase A themeArc 种子 + Phase B 按平台并发生成，合并为恰好 14 天矩阵。
 */
export async function generateMatrixConcurrent(
  params: GenerateMatrixParams,
): Promise<MatrixData> {
  if (params.platforms.length < 1) {
    throw new Error("请至少选择一个平台")
  }

  const startIso = matrixStartDateIso()
  const themeSeed = await generateThemeSeed(params, startIso)

  const parts = await Promise.all(
    params.platforms.map((platformId) =>
      generateOnePlatform(params, platformId, startIso, themeSeed),
    ),
  )

  const merged = mergePlatformMatrices(parts, params.platforms)
  return assertMatrixFourteenDays(merged, params.platforms, startIso, {
    fillMissing: true,
  })
}

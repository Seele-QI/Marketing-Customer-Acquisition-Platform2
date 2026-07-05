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
  completeText,
  type CompleteTextBilling,
  type LlmProviderId,
} from "@/lib/geo/llm/router"
import {
  MATRIX_DAYS,
  matrixDateRange,
  matrixStartDateIso,
} from "@/lib/geo/matrix-platforms"
import type { MatrixCell, MatrixData, PlatformMatrix } from "@/lib/geo/matrix-types"

export type GenerateMatrixParams = {
  provider: LlmProviderId
  projectName: string
  platforms: string[]
  modelSkillId?: string | null
  viralSkillIds?: string[]
  enterpriseSnapshot?: string | null
  /** Sonetto（gpt/claude）计量扣费 */
  userId?: number
  cookieHeader?: string
}

function billingFor(
  _params: GenerateMatrixParams,
  _prefix: string,
): CompleteTextBilling | undefined {
  // 矩阵整批扣费在 API 路由层（geo_matrix_gen），此处不再按 LLM 次扣费
  return undefined
}

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
    const raw = await completeText({
      provider: params.provider,
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
      billing: billingFor(params, "geo-matrix-seed"),
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

function missingDatesForPlatform(
  cells: MatrixCell[],
  startIso: string,
): string[] {
  const dates = matrixDateRange(startIso, MATRIX_DAYS)
  const have = new Set(cells.map((c) => c.date).filter(Boolean))
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
  try {
    const raw = await completeText({
      provider: params.provider,
      system,
      user,
      maxTokens: MAX_TOKENS_PLATFORM,
      billing: billingFor(params, "geo-matrix-plat"),
    })
    const parsed = parseMatrixJson(raw)
    const pm =
      parsed.platforms.find((p) => p.platformId === platformId) ??
      parsed.platforms[0]
    cells = pm?.cells ?? []
  } catch {
    cells = []
  }

  let missing = missingDatesForPlatform(cells, startIso)
  if (missing.length > 0) {
    try {
      const fillRaw = await completeText({
        provider: params.provider,
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
        billing: billingFor(params, "geo-matrix-fill"),
      })
      const fillParsed = parseMatrixJson(fillRaw)
      const fillPm =
        fillParsed.platforms.find((p) => p.platformId === platformId) ??
        fillParsed.platforms[0]
      const filled = fillPm?.cells ?? []
      const byDate = new Map(cells.map((c) => [c.date, c]))
      for (const c of filled) {
        if (c?.date) byDate.set(c.date, c)
      }
      cells = [...byDate.values()]
    } catch {
      // fall through to align placeholder
    }
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

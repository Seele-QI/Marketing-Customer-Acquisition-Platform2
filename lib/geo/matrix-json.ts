import type { MatrixCell, MatrixData, PlatformMatrix } from "@/lib/geo/matrix-types"
import {
  MATRIX_DAYS,
  matrixDateRange,
  weekForMatrixDayIndex,
} from "@/lib/geo/matrix-platforms"

export function stripJsonFences(text: string): string {
  return text
    .replace(/^```(?:json)?\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim()
}

export function parseMatrixJson(text: string): MatrixData {
  const cleaned = stripJsonFences(text)
  const parsed = JSON.parse(cleaned) as MatrixData
  if (!parsed || !Array.isArray(parsed.platforms)) {
    throw new Error("JSON 缺少 platforms 数组")
  }
  for (const pm of parsed.platforms) {
    if (!pm.platformId || !Array.isArray(pm.cells)) {
      throw new Error("platform 条目格式无效")
    }
  }
  return parsed
}

export function buildMatrixRepairPrompt(broken: string): string {
  return `下列文本应是合法 JSON，但解析失败。请只输出修复后的 JSON，不要其他文字：\n\n${broken.slice(0, 12000)}`
}

export function validateMatrixPlatforms(
  data: MatrixData,
  expectedPlatformIds: string[],
): MatrixData {
  const allowed = new Set(expectedPlatformIds)
  const platforms: PlatformMatrix[] = data.platforms.filter((p) =>
    allowed.has(p.platformId),
  )
  return {
    ...data,
    platforms,
    skillId: "content-matrix-planning",
    generatedAt: new Date().toISOString(),
  }
}

export type ThemeArcSeed = {
  themeArcs: string[]
  days: Array<{ date: string; week: 1 | 2; themeArc: string; dayTheme: string }>
}

export function parseThemeArcSeed(text: string): ThemeArcSeed {
  const cleaned = stripJsonFences(text)
  const parsed = JSON.parse(cleaned) as ThemeArcSeed
  if (!parsed || !Array.isArray(parsed.themeArcs) || !Array.isArray(parsed.days)) {
    throw new Error("themeArc 种子格式无效")
  }
  if (parsed.days.length !== MATRIX_DAYS) {
    throw new Error(`themeArc 种子须含 ${MATRIX_DAYS} 天，实际 ${parsed.days.length}`)
  }
  return parsed
}

function normalizeCell(
  cell: Partial<MatrixCell>,
  date: string,
  dayIndex: number,
  fallbackThemeArc: string,
): MatrixCell {
  const week = weekForMatrixDayIndex(dayIndex)
  return {
    date,
    week,
    themeArc: String(cell.themeArc || fallbackThemeArc).trim() || fallbackThemeArc,
    title: String(cell.title || "").trim() || `${date} 内容规划`,
    contentDirection: String(cell.contentDirection || "").trim() || "待补充创作方向",
    format: String(cell.format || "").trim() || "图文",
    geoIntent: String(cell.geoIntent || "").trim() || "种草",
    platformNative: String(cell.platformNative || "").trim() || "平台原生要点待补充",
  }
}

/** 将平台 cells 对齐到 startIso 起连续 14 天（按 date 匹配，缺失用占位） */
export function alignPlatformCellsToFourteenDays(
  platformId: string,
  cells: MatrixCell[],
  startIso: string,
  fallbackThemeArc = "主题弧",
): PlatformMatrix {
  const dates = matrixDateRange(startIso, MATRIX_DAYS)
  const byDate = new Map<string, MatrixCell>()
  for (const c of cells) {
    if (c?.date && !byDate.has(c.date)) {
      byDate.set(c.date, c)
    }
  }
  const aligned: MatrixCell[] = dates.map((date, i) => {
    const existing = byDate.get(date)
    return normalizeCell(existing ?? {}, date, i, fallbackThemeArc)
  })
  return { platformId, cells: aligned }
}

/**
 * 校验每平台恰好 14 格、日期连续、week 正确。
 * 返回对齐后的 MatrixData；若某平台缺格会用占位补齐（调用方应优先 LLM 补全）。
 */
export function assertMatrixFourteenDays(
  data: MatrixData,
  expectedPlatformIds: string[],
  startIso: string,
  options?: { fillMissing?: boolean },
): MatrixData {
  const fillMissing = options?.fillMissing ?? false
  const dates = matrixDateRange(startIso, MATRIX_DAYS)
  const byId = new Map(data.platforms.map((p) => [p.platformId, p]))
  const platforms: PlatformMatrix[] = []
  const errors: string[] = []

  for (const pid of expectedPlatformIds) {
    const pm = byId.get(pid)
    if (!pm) {
      if (fillMissing) {
        platforms.push(
          alignPlatformCellsToFourteenDays(pid, [], startIso),
        )
      } else {
        errors.push(`缺少平台 ${pid}`)
      }
      continue
    }
    const cellDates = [...new Set(pm.cells.map((c) => c.date).filter(Boolean))].sort()
    const missing = dates.filter((d) => !cellDates.includes(d))
    if (pm.cells.length !== MATRIX_DAYS || missing.length > 0) {
      if (fillMissing) {
        platforms.push(
          alignPlatformCellsToFourteenDays(pid, pm.cells, startIso),
        )
      } else {
        errors.push(
          `${pid}: 需要 ${MATRIX_DAYS} 格，实际 ${pm.cells.length}` +
            (missing.length ? `，缺日期 ${missing.join(",")}` : ""),
        )
      }
      continue
    }
    platforms.push(alignPlatformCellsToFourteenDays(pid, pm.cells, startIso))
  }

  if (errors.length > 0) {
    throw new Error(errors.join("；"))
  }

  return {
    platforms,
    skillId: "content-matrix-planning",
    generatedAt: new Date().toISOString(),
  }
}

/** 合并多平台结果（按 expected 顺序） */
export function mergePlatformMatrices(
  parts: PlatformMatrix[],
  expectedPlatformIds: string[],
): MatrixData {
  const byId = new Map(parts.map((p) => [p.platformId, p]))
  return {
    platforms: expectedPlatformIds
      .map((id) => byId.get(id))
      .filter((p): p is PlatformMatrix => Boolean(p)),
    skillId: "content-matrix-planning",
    generatedAt: new Date().toISOString(),
  }
}

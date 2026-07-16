/**
 * GEO 文章创作卡片：按矩阵排期日期升序（内容日历顺序）。
 * 无日期的项排在最后；同日期再按平台、创建时间稳定排序。
 */
export function compareByArticleDate(
  a: { date?: string; platformId?: string; createdAt?: number },
  b: { date?: string; platformId?: string; createdAt?: number },
): number {
  const da = a.date?.trim() ?? ""
  const db = b.date?.trim() ?? ""
  if (da && db && da !== db) return da.localeCompare(db)
  if (da && !db) return -1
  if (!da && db) return 1

  const pa = a.platformId ?? ""
  const pb = b.platformId ?? ""
  if (pa !== pb) return pa.localeCompare(pb)

  return (a.createdAt ?? 0) - (b.createdAt ?? 0)
}

export function sortByArticleDate<T extends { date?: string; platformId?: string; createdAt?: number }>(
  items: T[],
): T[] {
  return [...items].sort(compareByArticleDate)
}

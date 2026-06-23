/**
 * 生成图片归档 — localStorage 持久化。
 * 保存 AI 生成的主图与次要成稿，支持查看、下载与删除。
 */

const STORAGE_KEY = "generated-images"
export const SECONDARY_ARCHIVE_STORAGE_KEY = "generated-secondary-images"

export type ArchivedSecondaryImage = {
  id: string
  url: string
  prompt: string
  savedAt: string
  source: string
  slotLabel?: string
}

function read(key: string): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(key)
}

function write(key: string, value: string) {
  if (typeof window === "undefined") return
  localStorage.setItem(key, value)
}

export function listArchivedSecondaryImages(): ArchivedSecondaryImage[] {
  const raw = read(SECONDARY_ARCHIVE_STORAGE_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export function removeArchivedSecondaryImage(id: string) {
  const list = listArchivedSecondaryImages().filter((item) => item.id !== id)
  write(SECONDARY_ARCHIVE_STORAGE_KEY, JSON.stringify(list))
}

export function clearArchivedSecondaryImages() {
  write(SECONDARY_ARCHIVE_STORAGE_KEY, "[]")
}

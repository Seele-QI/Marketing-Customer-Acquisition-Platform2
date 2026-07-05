import { getMatrixPlatformLabel } from "@/lib/geo/matrix-platforms"

export type ArticleExportMeta = {
  title: string
  platformId?: string
  date?: string
  createdAt?: number
}

export function articleWordCount(text: string): number {
  return text.replace(/\s/g, "").length
}

export function sanitizeArticleFilename(name: string): string {
  return name.replace(/[/\\?*:|"<>]/g, "_").trim() || "geo-article"
}

export function formatArticleMarkdown(meta: ArticleExportMeta, body: string): string {
  const platform = meta.platformId ? getMatrixPlatformLabel(meta.platformId) : ""
  const createdAt = meta.createdAt
    ? new Date(meta.createdAt).toISOString()
    : new Date().toISOString()
  const wc = articleWordCount(body)
  const escapeYaml = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')

  const lines = [
    "---",
    `title: "${escapeYaml(meta.title)}"`,
    platform ? `platform: "${escapeYaml(platform)}"` : null,
    meta.date ? `date: "${escapeYaml(meta.date)}"` : null,
    `createdAt: "${createdAt}"`,
    `wordCount: ${wc}`,
    "---",
    "",
    body.trim(),
    "",
  ].filter((line): line is string => line != null)

  return lines.join("\n")
}

/** 浏览器内下载 .md 文件（仅 Client Component 调用） */
export function downloadArticleMarkdown(
  input: ArticleExportMeta & { markdown: string },
): void {
  const content = formatArticleMarkdown(
    {
      title: input.title,
      platformId: input.platformId,
      date: input.date,
      createdAt: input.createdAt,
    },
    input.markdown,
  )
  const filename = `${sanitizeArticleFilename(input.title)}.md`
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  a.rel = "noopener"
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

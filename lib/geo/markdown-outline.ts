export type OutlineItem = {
  id: string
  title: string
  level: number
}

function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  return slug || "section"
}

/** 从 Markdown 正文提取 H1–H3 大纲 */
export function parseMarkdownOutline(markdown: string): OutlineItem[] {
  const items: OutlineItem[] = []
  const seen = new Map<string, number>()

  for (const line of markdown.split("\n")) {
    const match = line.match(/^(#{1,3})\s+(.+)$/)
    if (!match) continue

    const level = match[1]!.length
    const title = match[2]!
      .replace(/[#*_`[\]]/g, "")
      .trim()
    if (!title) continue

    const base = slugify(title)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const id = count === 0 ? base : `${base}-${count}`

    items.push({ id, title, level })
  }

  return items
}

/**
 * 视频模块通用工具函数
 */
import { getFastapiBase } from "@/lib/fastapi-base"

/* ------------------------------------------------------------------ */
/*  文件处理                                                             */
/* ------------------------------------------------------------------ */

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result as string
      const idx = r.indexOf(",")
      resolve(idx >= 0 ? r.slice(idx + 1) : r)
    }
    reader.onerror = () => reject(reader.error ?? new Error("读取失败"))
    reader.readAsDataURL(file)
  })
}

export function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

/* ------------------------------------------------------------------ */
/*  排列组合（批量混剪用）                                                */
/* ------------------------------------------------------------------ */

export function generatePermutations<T>(arr: T[], maxCount = 20): T[][] {
  if (arr.length <= 1) return [arr]
  const results: T[][] = []
  function permute(prefix: T[], remaining: T[]) {
    if (results.length >= maxCount) return
    if (remaining.length === 0) {
      results.push(prefix)
      return
    }
    for (let i = 0; i < remaining.length; i++) {
      const next = remaining.slice(0, i).concat(remaining.slice(i + 1))
      permute([...prefix, remaining[i]], next)
      if (results.length >= maxCount) return
    }
  }
  permute([], arr)
  return results
}

export function factorial(n: number): number {
  let r = 1
  for (let i = 2; i <= n; i++) r *= i
  return r
}

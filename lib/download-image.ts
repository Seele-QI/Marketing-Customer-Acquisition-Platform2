/** 浏览器内保存远程图或 data URL；跨域失败时新开标签页兜底（仅在 Client Component 内调用） */
export async function downloadImageFromUrl(url: string, baseFilename: string): Promise<void> {
  const stripBad = baseFilename.replace(/[/\\?*:|"<>]/g, "_").trim() || "image"
  const withExt =
    /\.(png|jpe?g|webp|gif)$/i.test(stripBad) ? stripBad : `${stripBad}.png`

  if (url.startsWith("data:")) {
    const a = document.createElement("a")
    a.href = url
    a.download = withExt
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    return
  }

  try {
    const res = await fetch(url, { mode: "cors" })
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    const mime = blob.type || ""
    let name = withExt
    if (!/\.(png|jpe?g|webp|gif)$/i.test(name)) {
      const ext = mime.includes("jpeg") ? ".jpg" : mime.includes("webp") ? ".webp" : ".png"
      name = `${stripBad}${ext}`
    }
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = objUrl
    a.download = name
    a.rel = "noopener"
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(objUrl)
  } catch {
    window.open(url, "_blank", "noopener,noreferrer")
  }
}

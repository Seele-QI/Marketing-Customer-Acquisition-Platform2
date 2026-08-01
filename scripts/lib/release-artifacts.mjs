import { readFileSync, readdirSync } from "node:fs"
import path from "node:path"

const WINDOWS_METADATA_RE = /^latest\.yml$/i
const MAC_METADATA_RE = /^latest-mac(?:-arm64|-x64)?\.yml$/i

function referencedArtifact(metadataPath) {
  const text = readFileSync(metadataPath, "utf8")
  const match = text.match(/^\s*path:\s*(.+?)\s*$/m)
  if (!match?.[1]) {
    throw new Error(`${path.basename(metadataPath)} 缺少 path`)
  }
  return match[1].trim().replace(/^(['"])(.*)\1$/, "$2")
}

export function artifactUrl(feedUrl, artifactName) {
  const base = `${String(feedUrl || "").trim().replace(/\/+$/, "")}/`
  return `${base}${String(artifactName || "")
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/")}`
}

export function oldArtifactName(currentName, currentVersion, oldVersion) {
  if (!String(currentName).includes(currentVersion)) {
    throw new Error(`当前产物名不包含版本 ${currentVersion}: ${currentName}`)
  }
  return String(currentName).replace(currentVersion, oldVersion)
}

export function pickReleaseArtifacts(dir) {
  const names = readdirSync(dir)
  const metadata = names
    .filter((name) => WINDOWS_METADATA_RE.test(name) || MAC_METADATA_RE.test(name))
    .sort((a, b) => a.localeCompare(b))
  if (!metadata.length) {
    throw new Error("未找到 latest.yml / latest-mac.yml")
  }

  const selectedBinaries = new Set()
  const selectedBlockmaps = new Set()

  for (const metadataName of metadata) {
    const artifactName = referencedArtifact(path.join(dir, metadataName))
    if (!names.includes(artifactName)) {
      throw new Error(`${metadataName} 引用的产物不存在: ${artifactName}`)
    }
    selectedBinaries.add(artifactName)

    if (/\.(?:exe|dmg)$/i.test(artifactName)) {
      const blockmapName = `${artifactName}.blockmap`
      if (!names.includes(blockmapName)) {
        throw new Error(`${artifactName} 缺少配对 blockmap: ${blockmapName}`)
      }
      selectedBlockmaps.add(blockmapName)
    }
  }

  if (!selectedBinaries.size) {
    throw new Error(`未找到 Setup.exe 或 *-mac.dmg：${dir}`)
  }

  return [
    ...[...selectedBinaries].sort((a, b) => a.localeCompare(b)),
    ...[...selectedBlockmaps].sort((a, b) => a.localeCompare(b)),
    ...metadata,
  ].map((name) => path.join(dir, name))
}

import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const relativePath = specifier.slice(2)
    const withExtension = path.extname(relativePath) ? relativePath : `${relativePath}.ts`
    const resolved = pathToFileURL(path.join(projectRoot, withExtension)).href
    if (withExtension.endsWith(".json")) {
      return {
        shortCircuit: true,
        url: resolved,
        format: "json",
      }
    }
    return nextResolve(resolved, context)
  }

  if (specifier === "next/server") {
    return nextResolve("next/server.js", context)
  }

  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const result = await nextLoad(url, { ...context, format: "json" })
    return result
  }
  return nextLoad(url, context)
}

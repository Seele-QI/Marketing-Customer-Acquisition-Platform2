import { readFile } from "node:fs/promises"
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

  if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL?.startsWith("file:")) {
    const parentPath = fileURLToPath(context.parentURL)
    const baseDir = path.dirname(parentPath)
    for (const ext of [".ts", ".tsx", ".js"]) {
      const candidate = pathToFileURL(path.join(baseDir, specifier + ext)).href
      try {
        return await nextResolve(candidate, context)
      } catch {
        /* try next extension */
      }
    }
  }

  if (specifier === "next/server") {
    return nextResolve("next/server.js", context)
  }

  if (specifier === "next/headers") {
    return {
      shortCircuit: true,
      url: pathToFileURL(path.join(projectRoot, "tests/mocks/next-headers.mjs")).href,
      format: "module",
    }
  }

  // The npm `electron` package exposes a CommonJS launcher when loaded by
  // plain Node.js, so named imports such as `import { app } from "electron"`
  // fail before Electron-focused unit tests can run. Route those imports to
  // the deterministic test double for the shared Node test command.
  if (specifier === "electron") {
    return {
      shortCircuit: true,
      url: pathToFileURL(path.join(projectRoot, "tests/mocks/electron.mjs")).href,
      format: "module",
    }
  }

  return nextResolve(specifier, context)
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const json = JSON.parse(await readFile(fileURLToPath(url), "utf8"))
    return {
      shortCircuit: true,
      format: "module",
      source: `export default ${JSON.stringify(json)}`,
    }
  }
  return nextLoad(url, context)
}

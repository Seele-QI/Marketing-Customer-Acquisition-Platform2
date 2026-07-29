import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as baseLoader from "./alias-loader.mjs"

const testDir = path.dirname(fileURLToPath(import.meta.url))

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "electron") {
    return {
      shortCircuit: true,
      url: pathToFileURL(path.join(testDir, "mocks/electron.mjs")).href,
      format: "module",
    }
  }
  return baseLoader.resolve(specifier, context, nextResolve)
}

export const load = baseLoader.load

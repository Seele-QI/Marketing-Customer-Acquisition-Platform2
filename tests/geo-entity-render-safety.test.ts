import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const entityPanelUrl = new URL("../components/geo/geo-entity-panel.tsx", import.meta.url)

test("entity updates notify the parent outside the React state updater", async () => {
  const source = await readFile(entityPanelUrl, "utf8")

  assert.doesNotMatch(
    source,
    /setData\(\(prev\) => \{[\s\S]*?onChange\?\.\(next\)[\s\S]*?\}\)/,
    "calling onChange inside setData's updater can update the parent while React renders the child",
  )
  assert.match(source, /setData\(next\)\s+onChange\?\.\(next\)/)
})

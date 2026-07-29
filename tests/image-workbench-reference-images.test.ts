import assert from "node:assert/strict"
import test from "node:test"

import {
  canAddReference,
  generatedImageUrlToReference,
  sortPosterReferences,
  validateReferenceFile,
} from "@/lib/image-workbench/reference-images"

test("reference files accept JPEG PNG and WebP up to 10MB", () => {
  assert.equal(
    validateReferenceFile({ name: "a.png", type: "image/png", size: 10 }),
    "",
  )
  assert.match(
    validateReferenceFile({ name: "a.gif", type: "image/gif", size: 10 }),
    /仅支持 JPG、PNG、WebP/,
  )
  assert.match(
    validateReferenceFile({
      name: "large.png",
      type: "image/png",
      size: 10 * 1024 * 1024 + 1,
    }),
    /不能超过 10MB/,
  )
})

test("poster references keep subject before style", () => {
  const images = sortPosterReferences([
    {
      id: "style",
      name: "style.png",
      role: "style",
      mimeType: "image/png",
      dataBase64: "YQ==",
      previewUrl: "data:image/png;base64,YQ==",
    },
    {
      id: "subject",
      name: "subject.png",
      role: "subject",
      mimeType: "image/png",
      dataBase64: "Yg==",
      previewUrl: "data:image/png;base64,Yg==",
    },
  ])
  assert.deepEqual(images.map((image) => image.role), ["subject", "style"])
})

test("reference limits differ by mode", () => {
  assert.equal(canAddReference("poster", 1), true)
  assert.equal(canAddReference("poster", 2), false)
  assert.equal(canAddReference("image", 3), true)
  assert.equal(canAddReference("image", 4), false)
})

test("generated result can become a general reference", async () => {
  const reference = await generatedImageUrlToReference(
    "/static/image-workbench/example.png",
    "general",
    async () =>
      new Response(new Blob(["hello"], { type: "image/png" }), {
        status: 200,
      }),
  )
  assert.equal(reference.role, "general")
  assert.equal(reference.mimeType, "image/png")
  assert.match(reference.dataBase64, /^[A-Za-z0-9+/]+=*$/)
  assert.equal(reference.previewUrl, "/static/image-workbench/example.png")
})

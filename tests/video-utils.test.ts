import { describe, it } from "node:test"
import assert from "node:assert/strict"

describe("resolveMediaUrl", () => {
  it("resolves local static path via uvicorn port on Electron desktop", async () => {
    const prevNodeEnv = process.env.NODE_ENV
    const prevPublic = process.env.NEXT_PUBLIC_FASTAPI_URL
    process.env.NODE_ENV = "production"
    delete process.env.NEXT_PUBLIC_FASTAPI_URL

    const g = globalThis as typeof globalThis & {
      window?: { location: { origin: string; hostname: string; port: string } }
    }
    const prevWindow = g.window
    g.window = {
      electronAPI: { localFastapiBase: "http://127.0.0.1:8010", isElectron: true, platform: "win32" },
      location: {
        origin: "http://127.0.0.1:3010",
        hostname: "127.0.0.1",
        port: "3010",
      },
    }

    try {
      const mod = await import(`../lib/video/utils.ts?test=${Date.now()}`)
      const url = "/static/video-postprocess/pv_123/frames/frame_01.png"
      assert.equal(
        mod.resolveMediaUrl(url),
        "http://127.0.0.1:8010/static/video-postprocess/pv_123/frames/frame_01.png",
      )
    } finally {
      if (prevWindow === undefined) delete g.window
      else g.window = prevWindow
      process.env.NODE_ENV = prevNodeEnv
      if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_FASTAPI_URL
      else process.env.NEXT_PUBLIC_FASTAPI_URL = prevPublic
    }
  })

  it("builds FastAPI attachment URLs for generated videos and covers", async () => {
    const prevNodeEnv = process.env.NODE_ENV
    const prevPublic = process.env.NEXT_PUBLIC_FASTAPI_URL
    process.env.NODE_ENV = "production"
    delete process.env.NEXT_PUBLIC_FASTAPI_URL

    const g = globalThis as typeof globalThis & {
      window?: { location: { origin: string; hostname: string; port: string } }
    }
    const prevWindow = g.window
    g.window = {
      electronAPI: { localFastapiBase: "http://127.0.0.1:8010", isElectron: true, platform: "win32" },
      location: { origin: "http://127.0.0.1:3010", hostname: "127.0.0.1", port: "3010" },
    }

    try {
      const mod = await import(`../lib/video/utils.ts?download-test=${Date.now()}`)
      assert.equal(
        mod.resolveMediaDownloadUrl(
          "/static/video-generated/dhe_123/final.mp4",
          "economy-video.mp4",
        ),
        "http://127.0.0.1:8010/api/media/download?path=%2Fstatic%2Fvideo-generated%2Fdhe_123%2Ffinal.mp4&filename=economy-video.mp4",
      )
      assert.equal(
        mod.resolveMediaDownloadUrl(
          "/static/video-covers/dhe_123/cover.png",
          "economy-cover.png",
        ),
        "http://127.0.0.1:8010/api/media/download?path=%2Fstatic%2Fvideo-covers%2Fdhe_123%2Fcover.png&filename=economy-cover.png",
      )
    } finally {
      if (prevWindow === undefined) delete g.window
      else g.window = prevWindow
      process.env.NODE_ENV = prevNodeEnv
      if (prevPublic === undefined) delete process.env.NEXT_PUBLIC_FASTAPI_URL
      else process.env.NEXT_PUBLIC_FASTAPI_URL = prevPublic
    }
  })
})

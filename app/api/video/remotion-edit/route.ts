import { NextResponse } from "next/server";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { Props as EditProps } from "@/remotion/EditingComposition";
import { withAuth } from "@/lib/api/with-auth";
import { assertSafeRemotionAssets } from "@/lib/safe-remotion-asset";

export const maxDuration = 300;

const REMOTION_ENTRY = path.join(process.cwd(), "remotion", "index.ts");
const OUTPUT_DIR = path.join(process.cwd(), "public", "output");

/** Remotion 预设剪辑（与 FastAPI ffmpeg 剪辑 /api/video/edit 分离）。 */
export const POST = withAuth(async (request) => {
  let body: {
    videoUrl?: string;
    preset?: string;
    subtitleText?: string;
    bgMusicUrl?: string;
    brollUrls?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 });
  }

  const videoUrl = typeof body.videoUrl === "string" ? body.videoUrl : "";
  const preset = typeof body.preset === "string" ? body.preset : "smooth";
  const bgMusicUrl = typeof body.bgMusicUrl === "string" ? body.bgMusicUrl : "";
  const brollUrls = Array.isArray(body.brollUrls) ? body.brollUrls : [];

  if (!videoUrl) {
    return NextResponse.json(
      { detail: "缺少必填参数：videoUrl" },
      { status: 400 },
    );
  }

  const bad = assertSafeRemotionAssets([videoUrl, bgMusicUrl, ...brollUrls]);
  if (bad) {
    return NextResponse.json(
      { detail: { code: "BAD_ASSET_URL", message: `不受信任的媒体地址: ${bad}` } },
      { status: 400 },
    );
  }

  const validPresets = ["caption", "smooth", "dynamic", "cinematic", "subtle", "broll"];
  if (!validPresets.includes(preset)) {
    return NextResponse.json(
      { detail: `无效的预设：${preset}。有效值：${validPresets.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const bundleLocation = await bundle({ entryPoint: REMOTION_ENTRY });
    const inputProps: EditProps = {
      videoUrl,
      preset: preset as EditProps["preset"],
      subtitleText: typeof body.subtitleText === "string" ? body.subtitleText : "",
      bgMusicUrl,
      brollUrls,
    };

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "AutoEdit",
      inputProps,
    });

    const outputFile = path.join(OUTPUT_DIR, `edit-${Date.now()}.mp4`);
    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputFile,
      inputProps,
    });

    const filename = path.basename(outputFile);
    return NextResponse.json({
      editedVideoUrl: `/output/${filename}`,
      status: "success",
    });
  } catch (e) {
    console.error("[remotion-edit] Render error:", e);
    return NextResponse.json(
      { detail: "渲染失败，请稍后重试", status: "error" },
      { status: 500 },
    );
  }
});

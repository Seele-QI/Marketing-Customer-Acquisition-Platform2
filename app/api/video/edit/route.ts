import { NextResponse } from "next/server";
import path from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { Props as EditProps } from "@/remotion/EditingComposition";

export const maxDuration = 300; // 5 minutes max for rendering

const REMOTION_ENTRY = path.join(process.cwd(), "remotion", "index.ts");
const OUTPUT_DIR = path.join(process.cwd(), "public", "output");

export async function POST(request: Request) {
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

  if (!videoUrl) {
    return NextResponse.json(
      { detail: "缺少必填参数：videoUrl" },
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
    // 1. Bundle the Remotion project
    console.log(`[edit] Bundling Remotion project from ${REMOTION_ENTRY}…`);
    const bundleLocation = await bundle({ entryPoint: REMOTION_ENTRY });

    // 2. Select the composition
    console.log(`[edit] Selecting composition…`);
    const inputProps: EditProps = {
      videoUrl,
      preset: preset as EditProps["preset"],
      subtitleText: typeof body.subtitleText === "string" ? body.subtitleText : "",
      bgMusicUrl: typeof body.bgMusicUrl === "string" ? body.bgMusicUrl : "",
      brollUrls: Array.isArray(body.brollUrls) ? body.brollUrls : [],
    };

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "AutoEdit",
      inputProps,
    });

    // 3. Render the video
    const outputFile = path.join(OUTPUT_DIR, `edit-${Date.now()}.mp4`);
    console.log(`[edit] Rendering to ${outputFile}…`);

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputFile,
      inputProps,
    });

    // 4. Return the public URL
    const filename = path.basename(outputFile);
    const publicUrl = `/output/${filename}`;

    console.log(`[edit] Done: ${publicUrl}`);
    return NextResponse.json({
      editedVideoUrl: publicUrl,
      status: "success",
    });
  } catch (e) {
    console.error("[edit] Render error:", e);
    return NextResponse.json(
      {
        detail: `渲染失败：${e instanceof Error ? e.message : String(e)}`,
        status: "error",
      },
      { status: 500 },
    );
  }
}

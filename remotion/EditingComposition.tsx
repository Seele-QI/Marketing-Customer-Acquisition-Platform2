import React from "react";
import { z } from "zod";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

export const editingSchema = z.object({
  videoUrl: z.string(),
  preset: z.enum(["caption", "smooth", "dynamic", "cinematic", "subtle", "broll"]),
  subtitleText: z.string().optional(),
  bgMusicUrl: z.string().optional(),
  brollUrls: z.array(z.string()).optional(),
});

type Props = z.infer<typeof editingSchema>;
export type { Props };

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** 按句号/换行拆分为字幕片段 */
function splitSubtitles(text: string): string[] {
  return text
    .split(/[。\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 逐词渲染字幕行 */
const SubtitleLine: React.FC<{ text: string; startFrame: number }> = ({
  text,
  startFrame,
}) => {
  const frame = useCurrentFrame();
  const localFrame = frame - startFrame;
  const words = text.split("");

  const enter = spring({
    frame: localFrame,
    fps: 30,
    config: { damping: 200 },
    durationInFrames: 8,
  });

  const opacity = interpolate(
    localFrame,
    [0, 4, 35, 40],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <div
      style={{
        position: "absolute",
        bottom: 120,
        left: 0,
        right: 0,
        textAlign: "center",
        opacity,
        transform: `translateY(${interpolate(enter, [0, 1], [20, 0])}px)`,
      }}
    >
      <span
        style={{
          display: "inline-block",
          padding: "8px 24px",
          background: "rgba(0,0,0,0.72)",
          color: "#fff",
          fontSize: 40,
          fontWeight: 700,
          borderRadius: 12,
          letterSpacing: 2,
          lineHeight: 1.6,
        }}
      >
        {words.map((char, i) => {
          const charEnter = spring({
            frame: localFrame - i * 0.5,
            fps: 30,
            config: { damping: 200 },
            durationInFrames: 5,
          });
          return (
            <span
              key={i}
              style={{
                opacity: charEnter,
                display: "inline-block",
                transform: `translateY(${interpolate(charEnter, [0, 1], [8, 0])}px)`,
              }}
            >
              {char}
            </span>
          );
        })}
      </span>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/*  Preset: Caption (字幕增强)                                          */
/* ------------------------------------------------------------------ */

const CaptionEffect: React.FC<Props> = ({ videoUrl, subtitleText }) => {
  const subtitles = splitSubtitles(subtitleText || "");
  const framesPerCaption = 60; // 2 seconds per caption line

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo src={videoUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      {subtitles.map((text, i) => (
        <Sequence key={i} from={i * framesPerCaption} durationInFrames={framesPerCaption}>
          <SubtitleLine text={text} startFrame={i * framesPerCaption} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/*  Preset: Smooth (流畅剪辑 - fade in/out)                             */
/* ------------------------------------------------------------------ */

const SmoothEffect: React.FC<Props> = ({ videoUrl }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const opacity = interpolate(
    frame,
    [0, 15, durationInFrames - 15, durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo
        src={videoUrl}
        style={{ width: "100%", height: "100%", objectFit: "contain", opacity }}
      />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/*  Preset: Dynamic (动感快剪 - spring entry)                           */
/* ------------------------------------------------------------------ */

const DynamicEffect: React.FC<Props> = ({ videoUrl }) => {
  const frame = useCurrentFrame();

  const scale = spring({
    frame,
    fps: 30,
    config: { damping: 15, mass: 0.5 },
    durationInFrames: 20,
  });

  const s = interpolate(scale, [0, 1], [1.15, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo
        src={videoUrl}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          transform: `scale(${s})`,
        }}
      />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/*  Preset: Cinematic (电影质感 - letterbox + color grade)               */
/* ------------------------------------------------------------------ */

const CinematicEffect: React.FC<Props> = ({ videoUrl }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo
        src={videoUrl}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          filter: "saturate(1.2) contrast(1.1) brightness(1.05)",
        }}
      />
      {/* Letterbox bars */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 80, background: "#000" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 80, background: "#000" }} />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/*  Preset: Subtle (轻量美化 - brightness warm)                         */
/* ------------------------------------------------------------------ */

const SubtleEffect: React.FC<Props> = ({ videoUrl }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <OffthreadVideo
        src={videoUrl}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          filter: "brightness(1.08) contrast(1.05) saturate(1.05)",
        }}
      />
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/*  Preset: B-Roll (混剪 - 在视频片段间插入素材)                         */
/* ------------------------------------------------------------------ */

const BrollEffect: React.FC<Props> = ({ videoUrl, brollUrls }) => {
  const brolls = brollUrls || [];
  const segmentFrames = 50; // ~1.7s per segment

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Main video segments alternating with b-roll */}
      <Sequence from={0} durationInFrames={segmentFrames}>
        <OffthreadVideo src={videoUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </Sequence>
      {brolls.map((url, i) => (
        <React.Fragment key={i}>
          <Sequence from={(i * 2 + 1) * segmentFrames} durationInFrames={segmentFrames}>
            <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
              <Img src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div
                style={{
                  position: "absolute",
                  bottom: 40,
                  left: "50%",
                  transform: "translateX(-50%)",
                  padding: "4px 16px",
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  borderRadius: 6,
                  fontSize: 14,
                }}
              >
                素材 {i + 1}
              </div>
            </AbsoluteFill>
          </Sequence>
          <Sequence from={(i * 2 + 2) * segmentFrames} durationInFrames={segmentFrames}>
            <OffthreadVideo src={videoUrl} style={{ width: "100%", height: "100%", objectFit: "contain" }} />
          </Sequence>
        </React.Fragment>
      ))}
    </AbsoluteFill>
  );
};

/* ------------------------------------------------------------------ */
/*  Main Composition                                                    */
/* ------------------------------------------------------------------ */

export const EditingComposition: React.FC<Props> = (props) => {
  const PresetComponent = {
    caption: CaptionEffect,
    smooth: SmoothEffect,
    dynamic: DynamicEffect,
    cinematic: CinematicEffect,
    subtle: SubtleEffect,
    broll: BrollEffect,
  }[props.preset];

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <PresetComponent {...props} />
      {props.bgMusicUrl && <Audio src={props.bgMusicUrl} volume={0.3} />}
    </AbsoluteFill>
  );
};

"""
图文视频 / 视频混剪 ASR 字幕共享入口。

从配音音频（mp3/wav）提取 16k WAV → 阿里云 NLS 识别 →
有原文案时校对对齐（原文案断句 + ASR 时间戳）→ 生成 ASS 字幕。
"""

from __future__ import annotations

import os

from lib.subtitle_align import try_build_aligned_subtitle
from lib.subtitle_generator import max_chars_for_video_width, timed_sentences_to_subtitle
from lib.video_extract import extract_audio_from_local_video, transcribe_audio_with_timestamps

CLIP_SUBTITLE_STYLE = {
    "font_size": 68,
    "font_name": "宋体",
    "primary_colour": "&H0000C8FF",
    "bold": 1,
    "outline": 4,
    "margin_v_ratio": 0.22,
}

__all__ = [
    "CLIP_SUBTITLE_STYLE",
    "build_asr_ass_from_audio",
]


async def build_asr_ass_from_audio(
    audio_path: str,
    output_dir: str,
    filename_prefix: str,
    video_width: int = 1080,
    video_height: int = 1440,
    style: dict | None = None,
    script: str = "",
) -> str:
    """
    从配音音频生成带时间轴的 ASS 字幕文件。

    若提供 script，走「原文案校对 + ASR 时间戳」；否则回退纯 ASR 文本。

    Raises:
        Exception: ASR 或字幕生成失败时抛出，由调用方决定是否回退。
    """
    cfg = dict(style or CLIP_SUBTITLE_STYLE)
    os.makedirs(output_dir, exist_ok=True)

    asr_audio_dir = os.path.join(output_dir, "asr_audio")
    wav_path = extract_audio_from_local_video(audio_path, asr_audio_dir)

    font_size = int(cfg.get("font_size", 68))
    max_chars = max_chars_for_video_width(video_width, font_size)

    asr_result = await transcribe_audio_with_timestamps(
        wav_path,
        sentence_max_length=max_chars,
    )

    style_kwargs = dict(
        format="ass",
        video_width=video_width,
        video_height=video_height,
        font_name=str(cfg.get("font_name", "宋体")),
        font_size=font_size,
        bold=int(cfg.get("bold", 1)),
        primary_colour=str(cfg.get("primary_colour", "&H0000C8FF")),
        outline=int(cfg.get("outline", 4)),
        margin_v_ratio=float(cfg.get("margin_v_ratio", 0.22)),
        max_chars=max_chars,
    )

    aligned = try_build_aligned_subtitle(
        script,
        asr_result.sentences,
        output_dir,
        filename_prefix=filename_prefix,
        **style_kwargs,
    )
    if aligned:
        return aligned

    return timed_sentences_to_subtitle(
        sentences=asr_result.sentences,
        output_dir=output_dir,
        filename_prefix=filename_prefix,
        **style_kwargs,
    )

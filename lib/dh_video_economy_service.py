"""FFmpeg helpers for the economy digital-human pipeline."""
from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any, Awaitable, Callable
from urllib.parse import urlsplit


def select_runninghub_result_url(result: dict[str, Any], *, kind: str) -> str:
    """Pick an actual audio/video artifact instead of the first arbitrary output."""
    candidates: list[tuple[int, str]] = []
    for item in result.get("results") or []:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or "").strip()
        if not url:
            continue
        output_type = str(item.get("outputType") or item.get("output_type") or "").lower()
        path = urlsplit(url).path.lower()
        if kind == "audio":
            typed = "audio" in output_type
            extension = path.endswith((".mp3", ".wav", ".m4a", ".aac", ".flac", ".ogg"))
        elif kind == "video":
            typed = "video" in output_type or "mp4" in output_type
            extension = path.endswith(".mp4")
        else:
            raise ValueError(f"unsupported RunningHub result kind: {kind}")
        if typed or extension:
            candidates.append((2 if typed else 1, url))
    if not candidates:
        raise RuntimeError(f"RunningHub 成功结果中未找到有效{kind}文件")
    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


async def run_all_segments(
    segments: list[tuple[int, str]],
    worker: Callable[[int, str], Awaitable[Any]],
) -> list[Any]:
    """Start every segment immediately while preserving the original index order."""
    ordered = sorted(segments, key=lambda item: item[0])
    return list(await asyncio.gather(*(worker(index, path) for index, path in ordered)))


def build_finalize_command(
    *,
    ffmpeg_path: str,
    concat_video_path: str,
    clone_audio_path: str,
    output_path: str,
    duration_sec: float,
) -> list[str]:
    return [
        ffmpeg_path,
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        concat_video_path,
        "-i",
        clone_audio_path,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-t",
        f"{duration_sec:.3f}",
        "-shortest",
        "-c:v",
        "libx264",
        "-preset",
        "fast",
        "-crf",
        "20",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-movflags",
        "+faststart",
        output_path,
    ]


async def finalize_video_to_audio_duration(
    *,
    ffmpeg_path: str,
    concat_video_path: Path,
    clone_audio_path: Path,
    output_path: Path,
    duration_sec: float,
) -> Path:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    command = build_finalize_command(
        ffmpeg_path=ffmpeg_path,
        concat_video_path=str(concat_video_path),
        clone_audio_path=str(clone_audio_path),
        output_path=str(output_path),
        duration_sec=duration_sec,
    )
    process = await asyncio.create_subprocess_exec(
        *command,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await process.communicate()
    if process.returncode != 0 or not output_path.exists() or output_path.stat().st_size <= 0:
        message = stderr.decode("utf-8", errors="replace")[-2000:]
        raise RuntimeError(f"经济版数字人视频精确裁剪失败: {message}")
    return output_path

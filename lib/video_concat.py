"""Shared ffmpeg video concatenation for promo and digital-human pipelines."""

from __future__ import annotations

import os
import subprocess
import time
import logging

logger = logging.getLogger("video_concat")


def _concat_demuxer_path(video_path: str) -> str:
    """Path string for ffmpeg concat demuxer list file."""
    abs_path = os.path.abspath(video_path)
    # Windows: forward slashes only; escaping ':' breaks drive letters (F:/...)
    if os.name == "nt":
        return abs_path.replace("\\", "/")
    return abs_path.replace("\\", "/").replace(":", "\\:")


def concatenate_videos_ffmpeg(video_paths, output_path, ffmpeg_path="ffmpeg"):
    """Concatenate *video_paths* in order into *output_path* using ffmpeg concat demuxer."""
    if len(video_paths) == 1:
        subprocess.run(
            [ffmpeg_path, "-y", "-i", video_paths[0], "-c", "copy", output_path],
            check=True,
            capture_output=True,
            encoding="utf-8",
            errors="replace",
        )
        return output_path

    concat_list = os.path.join(
        os.path.dirname(output_path) or ".",
        f"concat_{int(time.time() * 1000)}.txt",
    )
    try:
        with open(concat_list, "w", encoding="utf-8") as f:
            for vp in video_paths:
                f.write(f"file '{_concat_demuxer_path(vp)}'\n")
        subprocess.run(
            [
                ffmpeg_path,
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                concat_list,
                "-c",
                "copy",
                output_path,
            ],
            check=True,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        logger.info("Concatenated %d videos -> %s", len(video_paths), output_path)
    finally:
        if os.path.exists(concat_list):
            os.remove(concat_list)
    return output_path

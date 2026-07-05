"""Split cloned audio into fixed-duration segments for digital human batch pipeline."""

from __future__ import annotations

import math
import os
import subprocess
from pathlib import Path

from lib.video_postprocess import _FFMPEG_EXE, probe_audio_duration

SEGMENT_DURATION_SEC = 20
MAX_DH_SEGMENTS = 30
SPLIT_IMPL_VERSION = "dh-split-v3"


class SegmentLimitExceeded(ValueError):
    """Raised when audio would produce more segments than MAX_DH_SEGMENTS."""


def plan_segment_count(
    audio_duration_sec: float,
    *,
    segment_sec: float = SEGMENT_DURATION_SEC,
) -> int:
    """Return the number of segments needed for *audio_duration_sec*."""
    if audio_duration_sec <= 0:
        return 1
    return max(1, math.ceil(audio_duration_sec / segment_sec))


def _run_ffmpeg_to_files(
    cmd: list[str],
    *,
    stderr_path: str,
    timeout: int = 120,
) -> tuple[int, str]:
    """Run ffmpeg writing stderr to a file (avoids Windows pipe capture issues)."""
    with open(stderr_path, "w", encoding="utf-8", errors="replace") as errf:
        try:
            proc = subprocess.run(
                cmd,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=errf,
                timeout=timeout,
                check=False,
            )
            rc = int(proc.returncode)
        except FileNotFoundError as e:
            errf.write(f"FileNotFoundError: {e}\n")
            return 127, str(e)
        except subprocess.TimeoutExpired:
            errf.write(f"TimeoutExpired after {timeout}s\n")
            return 124, f"timeout after {timeout}s"
    try:
        with open(stderr_path, "r", encoding="utf-8", errors="replace") as f:
            err_text = f.read()
    except OSError:
        err_text = ""
    return rc, err_text


def _normalize_to_wav(
    *,
    ffmpeg: str,
    input_path: str,
    wav_path: str,
    work_dir: str,
) -> None:
    """Convert arbitrary RH audio to mono 44.1kHz PCM wav."""
    stderr_path = os.path.join(work_dir, "normalize.stderr.txt")
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        input_path,
        "-vn",
        "-ac",
        "1",
        "-ar",
        "44100",
        "-c:a",
        "pcm_s16le",
        "-f",
        "wav",
        wav_path,
    ]
    rc, err_text = _run_ffmpeg_to_files(cmd, stderr_path=stderr_path, timeout=180)
    ok = (
        rc == 0
        and os.path.isfile(wav_path)
        and os.path.getsize(wav_path) > 44
    )
    if not ok:
        raise RuntimeError(
            f"[{SPLIT_IMPL_VERSION}] ffmpeg 规范化克隆音频失败 (rc={rc}): {err_text.strip()[:500]}"
        )


def _cut_wav_segment(
    *,
    ffmpeg: str,
    wav_path: str,
    out_path: str,
    start_sec: float,
    chunk_duration: float,
    idx: int,
    work_dir: str,
) -> str:
    stderr_path = os.path.join(work_dir, f"segment_{idx:03d}.stderr.txt")
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-nostdin",
        "-y",
        "-i",
        wav_path,
        "-ss",
        str(start_sec),
        "-t",
        str(chunk_duration),
        "-c",
        "copy",
        out_path,
    ]
    rc, err_text = _run_ffmpeg_to_files(cmd, stderr_path=stderr_path, timeout=120)
    ok = rc == 0 and os.path.isfile(out_path) and os.path.getsize(out_path) > 44
    if not ok:
        # Re-encode fallback (should rarely be needed for wav)
        cmd2 = [
            ffmpeg,
            "-hide_banner",
            "-nostdin",
            "-y",
            "-i",
            wav_path,
            "-ss",
            str(start_sec),
            "-t",
            str(chunk_duration),
            "-ac",
            "1",
            "-ar",
            "44100",
            "-c:a",
            "pcm_s16le",
            "-f",
            "wav",
            out_path,
        ]
        rc2, err2 = _run_ffmpeg_to_files(
            cmd2,
            stderr_path=os.path.join(work_dir, f"segment_{idx:03d}.reencode.stderr.txt"),
            timeout=120,
        )
        ok2 = rc2 == 0 and os.path.isfile(out_path) and os.path.getsize(out_path) > 44
        if not ok2:
            raise RuntimeError(
                f"[{SPLIT_IMPL_VERSION}] ffmpeg 音频切段失败 (segment {idx}): "
                f"copy_rc={rc} reencode_rc={rc2} err={(err2 or err_text).strip()[:400]}"
            )
    return out_path


def split_audio_segments(
    input_path: str,
    output_dir: str,
    segment_sec: float = SEGMENT_DURATION_SEC,
    *,
    ffmpeg_exe: str | None = None,
) -> list[tuple[int, str]]:
    """Split *input_path* into sequential wav segments.

    Strategy: normalize whole file to PCM wav, then cut by time.
    Returns ``[(segment_index, local_wav_path), ...]`` in time order.
    """
    ffmpeg = ffmpeg_exe or _FFMPEG_EXE

    if not input_path or not os.path.isfile(input_path):
        raise RuntimeError(
            f"[{SPLIT_IMPL_VERSION}] 克隆音频不存在: {input_path!r}"
        )
    input_size = os.path.getsize(input_path)
    if input_size < 256:
        raise RuntimeError(
            f"[{SPLIT_IMPL_VERSION}] 克隆音频过小 ({input_size} bytes)，可能下载损坏"
        )

    duration = probe_audio_duration(input_path)
    segment_count = plan_segment_count(duration, segment_sec=segment_sec)

    if segment_count > MAX_DH_SEGMENTS:
        raise SegmentLimitExceeded(
            f"音频时长 {duration:.1f}s 将产生 {segment_count} 段，"
            f"超过上限 {MAX_DH_SEGMENTS} 段（SEGMENT_LIMIT_EXCEEDED）"
        )

    Path(output_dir).mkdir(parents=True, exist_ok=True)
    work_dir = output_dir
    wav_path = os.path.join(work_dir, "normalized.wav")
    _normalize_to_wav(
        ffmpeg=ffmpeg,
        input_path=input_path,
        wav_path=wav_path,
        work_dir=work_dir,
    )

    # Re-probe duration from normalized wav for accurate cuts
    duration = probe_audio_duration(wav_path)
    segment_count = plan_segment_count(duration, segment_sec=segment_sec)

    results: list[tuple[int, str]] = []
    for idx in range(segment_count):
        start_sec = idx * segment_sec
        remaining = max(0.0, duration - start_sec)
        chunk_duration = min(segment_sec, remaining)
        if chunk_duration <= 0:
            break
        out_path = os.path.join(output_dir, f"segment_{idx:03d}.wav")
        written = _cut_wav_segment(
            ffmpeg=ffmpeg,
            wav_path=wav_path,
            out_path=out_path,
            start_sec=start_sec,
            chunk_duration=chunk_duration,
            idx=idx,
            work_dir=work_dir,
        )
        results.append((idx, written))

    if not results:
        raise RuntimeError(
            f"[{SPLIT_IMPL_VERSION}] 未生成任何音频分段 (duration={duration})"
        )

    return results

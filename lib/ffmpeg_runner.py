"""Shared ffmpeg/ffprobe subprocess runner with global concurrency limit."""

from __future__ import annotations

import os
import subprocess
import threading
from typing import Optional

_MAX = max(1, int(os.getenv("FFMPEG_MAX_CONCURRENT", "2")))
_SEM = threading.Semaphore(_MAX)

# Test hook: override via tests/test_ffmpeg_runner.py
_active_count = 0
_active_lock = threading.Lock()


def max_concurrent() -> int:
    return _MAX


def active_count() -> int:
    with _active_lock:
        return _active_count


def _run_subprocess(
    args: list[str],
    *,
    timeout: int,
    label: str = "",
) -> subprocess.CompletedProcess[str]:
    global _active_count
    with _SEM:
        with _active_lock:
            _active_count += 1
        try:
            return subprocess.run(
                args,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
            )
        finally:
            with _active_lock:
                _active_count -= 1


def run_ffmpeg(
    args: list[str],
    *,
    timeout: int = 900,
    label: str = "",
) -> subprocess.CompletedProcess[str]:
    """Run ffmpeg under the global Semaphore."""
    return _run_subprocess(args, timeout=timeout, label=label)


def run_ffprobe(
    args: list[str],
    *,
    timeout: int = 60,
    label: str = "",
) -> subprocess.CompletedProcess[str]:
    """Run ffprobe under the global Semaphore."""
    return _run_subprocess(args, timeout=timeout, label=label)


def reset_active_count_for_tests(value: int = 0) -> None:
    """Testing only."""
    global _active_count
    with _active_lock:
        _active_count = value

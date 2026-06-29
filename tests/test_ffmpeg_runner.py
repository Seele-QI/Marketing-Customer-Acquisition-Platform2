"""Tests for lib/ffmpeg_runner concurrency guard."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import lib.ffmpeg_runner as runner


def test_max_concurrent_default_at_least_one():
    assert runner.max_concurrent() >= 1


def test_run_ffmpeg_uses_semaphore():
    mock_sem = MagicMock()
    mock_sem.__enter__ = MagicMock(return_value=None)
    mock_sem.__exit__ = MagicMock(return_value=False)

    with patch.object(runner, "_SEM", mock_sem):
        with patch(
            "lib.ffmpeg_runner.subprocess.run",
            return_value=MagicMock(returncode=0, stdout="", stderr=""),
        ):
            runner.run_ffmpeg(["ffmpeg", "-version"], timeout=5)

    mock_sem.__enter__.assert_called_once()


def test_run_ffprobe_uses_semaphore():
    mock_sem = MagicMock()
    mock_sem.__enter__ = MagicMock(return_value=None)
    mock_sem.__exit__ = MagicMock(return_value=False)

    with patch.object(runner, "_SEM", mock_sem):
        with patch(
            "lib.ffmpeg_runner.subprocess.run",
            return_value=MagicMock(returncode=0, stdout="10.0", stderr=""),
        ):
            runner.run_ffprobe(["ffprobe", "-version"], timeout=5)

    mock_sem.__enter__.assert_called_once()

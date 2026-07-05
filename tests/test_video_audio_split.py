"""Unit tests for lib/video_audio_split.py."""

import os
from unittest.mock import patch

import pytest

from lib.video_audio_split import (
    MAX_DH_SEGMENTS,
    SEGMENT_DURATION_SEC,
    SPLIT_IMPL_VERSION,
    SegmentLimitExceeded,
    plan_segment_count,
    split_audio_segments,
)


def test_plan_segment_count_180_returns_9():
    assert plan_segment_count(180.0) == 9


def test_plan_segment_count_15_returns_1():
    assert plan_segment_count(15.0) == 1


def test_plan_segment_count_exact_multiple():
    assert plan_segment_count(40.0) == 2
    assert plan_segment_count(20.0) == 1


def test_plan_segment_count_zero_or_negative_defaults_to_one():
    assert plan_segment_count(0.0) == 1
    assert plan_segment_count(-5.0) == 1


@patch("lib.video_audio_split.probe_audio_duration")
@patch("lib.video_audio_split.os.path.getsize", return_value=4096)
@patch("lib.video_audio_split.os.path.isfile", return_value=True)
def test_split_raises_segment_limit_exceeded(mock_isfile, mock_getsize, mock_probe):
    mock_probe.return_value = (MAX_DH_SEGMENTS + 1) * SEGMENT_DURATION_SEC
    with pytest.raises(SegmentLimitExceeded) as exc_info:
        split_audio_segments("/tmp/long.mp3", "/tmp/out")
    assert "SEGMENT_LIMIT_EXCEEDED" in str(exc_info.value)


@patch("lib.video_audio_split._cut_wav_segment")
@patch("lib.video_audio_split._normalize_to_wav")
@patch("lib.video_audio_split.probe_audio_duration")
@patch("lib.video_audio_split.os.path.getsize", return_value=4096)
@patch("lib.video_audio_split.os.path.isfile", return_value=True)
def test_split_audio_segments_last_segment_uses_remaining_duration(
    mock_isfile,
    mock_getsize,
    mock_probe,
    mock_normalize,
    mock_cut,
):
    mock_probe.return_value = 35.0

    def _cut(**kwargs):
        return kwargs["out_path"]

    mock_cut.side_effect = _cut

    with patch("lib.video_audio_split.Path.mkdir"):
        results = split_audio_segments("/tmp/audio.mp3", "/tmp/segments", ffmpeg_exe="ffmpeg")

    assert len(results) == 2
    assert results[0][0] == 0
    assert results[1][0] == 1
    assert results[0][1].endswith("segment_000.wav")
    assert results[1][1].endswith("segment_001.wav")

    assert mock_normalize.called
    assert mock_cut.call_count == 2
    first_kwargs = mock_cut.call_args_list[0].kwargs
    second_kwargs = mock_cut.call_args_list[1].kwargs
    assert first_kwargs["start_sec"] == 0
    assert first_kwargs["chunk_duration"] == float(SEGMENT_DURATION_SEC)
    assert second_kwargs["start_sec"] == float(SEGMENT_DURATION_SEC)
    assert second_kwargs["chunk_duration"] == 15.0


@patch("lib.video_audio_split._cut_wav_segment")
@patch("lib.video_audio_split._normalize_to_wav")
@patch("lib.video_audio_split.probe_audio_duration")
@patch("lib.video_audio_split.os.path.getsize", return_value=4096)
@patch("lib.video_audio_split.os.path.isfile", return_value=True)
def test_split_single_short_segment(
    mock_isfile,
    mock_getsize,
    mock_probe,
    mock_normalize,
    mock_cut,
):
    mock_probe.return_value = 12.5
    mock_cut.side_effect = lambda **kwargs: kwargs["out_path"]

    with patch("lib.video_audio_split.Path.mkdir"):
        results = split_audio_segments("/tmp/short.mp3", "/tmp/out")

    assert len(results) == 1
    assert mock_cut.call_args.kwargs["chunk_duration"] == 12.5
    assert SPLIT_IMPL_VERSION.startswith("dh-split-")

"""Unit tests for lib/video_concat.py."""

import os
from unittest.mock import patch

from lib.video_concat import concatenate_videos_ffmpeg


@patch("lib.video_concat.subprocess.run")
def test_concatenate_single_video_copies(mock_run):
    out = concatenate_videos_ffmpeg(["/a/one.mp4"], "/a/out.mp4", ffmpeg_path="ffmpeg")
    assert out == "/a/out.mp4"
    mock_run.assert_called_once()
    args = mock_run.call_args[0][0]
    assert args == ["ffmpeg", "-y", "-i", "/a/one.mp4", "-c", "copy", "/a/out.mp4"]


@patch("lib.video_concat.os.remove")
@patch("lib.video_concat.time.time", return_value=1000.0)
@patch("lib.video_concat.subprocess.run")
@patch("lib.video_concat.os.path.exists", return_value=True)
@patch("builtins.open", create=True)
def test_concatenate_multiple_videos_writes_concat_list(
    mock_open, mock_exists, mock_run, _mock_time, _mock_remove, tmp_path
):
    output = str(tmp_path / "final.mp4")
    paths = [str(tmp_path / "seg0.mp4"), str(tmp_path / "seg1.mp4")]

    mock_file = mock_open.return_value.__enter__.return_value

    concatenate_videos_ffmpeg(paths, output, ffmpeg_path="ffmpeg")

    assert mock_run.call_count == 1
    ffmpeg_args = mock_run.call_args[0][0]
    assert ffmpeg_args[0] == "ffmpeg"
    assert "-f" in ffmpeg_args and "concat" in ffmpeg_args

    written_lines = [call.args[0] for call in mock_file.write.call_args_list]
    assert any("seg0.mp4" in line for line in written_lines)
    assert any("seg1.mp4" in line for line in written_lines)

    concat_list_path = os.path.join(str(tmp_path), "concat_1000000.txt")
    mock_exists.assert_called_with(concat_list_path)

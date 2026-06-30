"""image_video_render 预生成字幕路径测试。"""

import os
from unittest.mock import MagicMock, patch

import lib.image_video_postprocess as ivp


@patch.object(ivp, "_run_ffmpeg")
@patch.object(ivp, "_pick_bgm", return_value="/fake/bgm.mp3")
@patch.object(ivp, "_build_image_video_ffmpeg_command", return_value=["ffmpeg", "-version"])
@patch.object(ivp, "probe_audio_duration", return_value=10.0)
@patch.object(ivp, "build_ass_subtitles")
def test_image_video_render_skips_build_ass_when_subtitle_provided(
    mock_build_ass,
    _mock_probe,
    _mock_cmd,
    _mock_bgm,
    mock_ffmpeg,
):
    mock_ffmpeg.return_value = MagicMock(returncode=0, stderr="")

    with patch.object(ivp.os.path, "exists", return_value=True):
        with patch.object(ivp.os.path, "isfile", return_value=True):
            result = ivp.image_video_render(
                task_id="iv_test",
                output_dir="/tmp/iv_out",
                image_paths=["/fake/img1.png"],
                script="测试文案第一句。第二句。",
                voice_audio_path="/fake/voice.mp3",
                bgm_dir="/fake/bgm",
                subtitle_file_path="/tmp/iv_out/asr_iv_test.ass",
            )

    mock_build_ass.assert_not_called()
    assert result.ok is True


@patch.object(ivp, "_run_ffmpeg")
@patch.object(ivp, "_pick_bgm", return_value="/fake/bgm.mp3")
@patch.object(ivp, "_build_image_video_ffmpeg_command", return_value=["ffmpeg", "-version"])
@patch.object(ivp, "probe_audio_duration", return_value=10.0)
@patch.object(ivp, "build_ass_subtitles")
def test_image_video_render_calls_build_ass_without_subtitle(
    mock_build_ass,
    _mock_probe,
    _mock_cmd,
    _mock_bgm,
    mock_ffmpeg,
    tmp_path,
):
    mock_ffmpeg.return_value = MagicMock(returncode=0, stderr="")
    output_dir = str(tmp_path)
    final_path = os.path.join(output_dir, "iv_test_final.mp4")
    with open(final_path, "wb") as f:
        f.write(b"x" * 2048)

    result = ivp.image_video_render(
        task_id="iv_test",
        output_dir=output_dir,
        image_paths=[str(tmp_path / "img1.png")],
        script="测试文案。",
        voice_audio_path=str(tmp_path / "voice.mp3"),
        bgm_dir=str(tmp_path),
        subtitle_file_path="",
    )

    mock_build_ass.assert_called_once()
    assert result.ok is True

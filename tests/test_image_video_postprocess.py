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


@patch.object(ivp, "_run_ffmpeg")
@patch.object(ivp, "_pick_bgm")
@patch.object(ivp, "probe_audio_duration", return_value=10.0)
@patch.object(ivp, "build_ass_subtitles")
def test_image_video_render_skips_bgm_and_subs_when_disabled(
    mock_build_ass,
    _mock_probe,
    mock_bgm,
    mock_ffmpeg,
    tmp_path,
):
    mock_ffmpeg.return_value = MagicMock(returncode=0, stderr="")
    output_dir = str(tmp_path)
    final_path = os.path.join(output_dir, "iv_off_final.mp4")
    with open(final_path, "wb") as f:
        f.write(b"x" * 2048)

    captured: dict = {}

    def capture_cmd(**kwargs):
        captured.update(kwargs)
        return ["ffmpeg", "-version"]

    with patch.object(ivp, "_build_image_video_ffmpeg_command", side_effect=capture_cmd):
        result = ivp.image_video_render(
            task_id="iv_off",
            output_dir=output_dir,
            image_paths=[str(tmp_path / "img1.png"), str(tmp_path / "img2.png")],
            script="测试文案。",
            voice_audio_path=str(tmp_path / "voice.mp3"),
            bgm_dir=str(tmp_path),
            enable_bgm=False,
            enable_subtitles=False,
        )

    mock_bgm.assert_not_called()
    mock_build_ass.assert_not_called()
    assert result.ok is True
    assert captured.get("bgm_path") is None
    assert captured.get("ass_path") is None
    assert captured.get("bgm_volume") == 0.0


def test_build_image_video_cmd_no_bgm_no_subs(tmp_path):
    img1 = str(tmp_path / "a.png")
    img2 = str(tmp_path / "b.png")
    voice = str(tmp_path / "v.mp3")
    out = str(tmp_path / "o.mp4")
    for p in (img1, img2, voice):
        open(p, "wb").write(b"x")

    cmd = ivp._build_image_video_ffmpeg_command(
        image_paths=[img1, img2],
        durations=[5.0, 5.0],
        ass_path=None,
        voice_audio_path=voice,
        bgm_path=None,
        output_path=out,
        bgm_volume=0.0,
    )
    joined = " ".join(cmd)
    assert "subtitles=" not in joined
    assert "amix=" not in joined
    assert "[aout]" in joined

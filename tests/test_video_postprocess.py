import importlib
import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt"
os.environ["CREDIT_REGISTER_BONUS"] = "100"

import main  # noqa: E402
import lib.video_postprocess as video_postprocess  # noqa: E402
from lib.auth import CurrentUser  # noqa: E402
from lib.video_postprocess import (  # noqa: E402
    _clean_subtitle_text,
    build_ass_subtitles,
    burn_subtitle_ffmpeg,
    create_timeline_by_chars,
    resolve_target_duration,
    split_script_segments,
)

_FAKE_USER = CurrentUser(id=1, email_masked="t**@x", login_name="tester", nickname=None)


def _fake_request():
    return MagicMock()


def test_clean_subtitle_text_removes_punctuation():
    cleaned = _clean_subtitle_text("你好，世界。/AI字幕！")
    assert cleaned == "你好世界AI字幕"


def test_split_script_segments_splits_by_breaks_and_drops_empty_parts():
    """一句一字幕：只切句末标点（。！？）和换行，保留句中逗号供折行。"""
    segments = split_script_segments("第一句，第二句。\n\n第三句/第四句！？")
    assert segments == ["第一句，第二句", "第三句/第四句"]


def test_split_script_segments_keeps_clauses_when_no_sentence_end_punctuation():
    """一句一字幕：句中没有 。！？ 时保持完整（仍按 \n 切分）。"""
    segments = split_script_segments("你好，世界。我是张三。")
    assert segments == ["你好，世界", "我是张三"]


def test_split_script_segments_splits_on_newlines_only():
    """无句末标点时按换行切分（用户手输一段一行）。"""
    segments = split_script_segments("公转私三个字，\n多少老板踩过坑，\n")
    assert segments == ["公转私三个字，", "多少老板踩过坑，"]


def test_auto_wrap_prefers_punctuation_then_hardcut():
    """_auto_wrap 先按 ，、 切分再剥标点，24 字内不折行。"""
    from lib.video_postprocess import _auto_wrap
    # 短文本原样返回（已剥标点）
    assert _auto_wrap("你好世界") == "你好世界"
    # 中等长度（24 字内）原样返回
    assert _auto_wrap("这是一句测试文本不超过二十四个字") == "这是一句测试文本不超过二十四个字"
    # 优先按 ， 折行，展示文本不含逗号
    wrapped = _auto_wrap("这是一句测试文本，一句测试文本，两句测试文本，三句测试文本")
    assert "\\N" in wrapped  # 至少折了一次行
    assert "，" not in wrapped
    # 折行后每段长度不超过 24 字
    for part in wrapped.split("\\N"):
        assert len(part) <= 24


def test_build_ass_subtitles_uses_template_config_style(tmp_path):
    ass_path = tmp_path / "demo.ass"
    build_ass_subtitles("第一句。\n第二句。", str(ass_path), 10.0, 576, 1024)
    content = ass_path.read_text(encoding="utf-8-sig")
    style_lines = [line for line in content.splitlines() if line.startswith("Style: Default,")]
    assert len(style_lines) == 1
    parts = style_lines[0].split(",")
    assert parts[2] == "80"
    assert parts[7] == "1"
    assert "&H0000C8FF" in content
    assert ",43,&H00FFFFFF" not in content


def test_timeline_total_duration_matches_target():
    timeline = create_timeline_by_chars("第一句。\n第二句更长一点。", 40.0)
    assert timeline
    assert float(timeline[-1]["end"]) == 40.0
    total = sum(float(item["duration"]) for item in timeline)
    assert round(total, 3) == 40.0


def test_resolve_target_duration_prefers_audio_duration(monkeypatch):
    monkeypatch.setattr(video_postprocess, "probe_audio_duration", lambda _: 40.0)
    monkeypatch.setattr(video_postprocess, "probe_duration", lambda _: 55.0)
    assert resolve_target_duration("demo.mp4") == 40.0


def test_resolve_target_duration_does_not_exceed_video_duration(monkeypatch):
    monkeypatch.setattr(video_postprocess, "probe_audio_duration", lambda _: 55.0)
    monkeypatch.setattr(video_postprocess, "probe_duration", lambda _: 40.0)
    assert resolve_target_duration("demo.mp4") == 40.0


def test_ffprobe_falls_back_to_ffprobe_binary_when_local_tool_missing(monkeypatch):
    original_exists = video_postprocess.Path.exists

    def fake_exists(path_obj):
        if path_obj.name in {"ffprobe.exe", "ffmpeg.exe"}:
            return False
        return original_exists(path_obj)

    monkeypatch.setattr(video_postprocess.Path, "exists", fake_exists)
    reloaded = importlib.reload(video_postprocess)
    try:
        assert reloaded._FFMPEG_EXE == "ffmpeg"
        assert reloaded._FFPROBE_EXE == "ffprobe"
    finally:
        importlib.reload(video_postprocess)


@patch("lib.video_postprocess._run_ffmpeg")
@patch("lib.video_postprocess.has_audio_stream", return_value=True)
@patch("lib.video_postprocess._pick_bgm", return_value="C:/bgm/demo.mp3")
@patch("lib.video_postprocess.probe_resolution", return_value=(576, 1024))
def test_burn_subtitle_ffmpeg_uses_bgm_mix_and_no_visual_filters(
    _probe_resolution,
    _pick_bgm,
    _has_audio_stream,
    mock_run_ffmpeg,
    tmp_path,
):
    output_path = tmp_path / "final.mp4"
    ass_path = tmp_path / "demo.ass"
    ass_path.write_text("dummy", encoding="utf-8")
    output_path.write_bytes(b"ok")
    mock_run_ffmpeg.return_value = SimpleNamespace(returncode=0, stderr="")

    result = burn_subtitle_ffmpeg(
        "C:/video/input.mp4",
        str(ass_path),
        str(output_path),
        40.0,
        business_card_text="",
        bgm_dir="C:/bgm",
        preset="smooth",
        bgm_volume=0.32,
    )

    assert result.ok is True
    cmd = mock_run_ffmpeg.call_args.args[0]
    cmd_text = " ".join(cmd)
    assert "amix=inputs=2" in cmd_text
    assert "subtitles=" in cmd_text
    assert "drawtext=" not in cmd_text
    assert "eq=" not in cmd_text
    assert "curves=" not in cmd_text
    assert "boxblur=" not in cmd_text
    assert "C:/bgm/demo.mp3" in cmd_text


@patch("lib.video_postprocess._run_ffmpeg")
@patch("lib.video_postprocess.has_audio_stream", return_value=True)
@patch("lib.video_postprocess._pick_bgm")
@patch("lib.video_postprocess.probe_resolution", return_value=(576, 1024))
def test_burn_subtitle_ffmpeg_skips_bgm_when_disabled(
    _probe_resolution,
    mock_pick_bgm,
    _has_audio_stream,
    mock_run_ffmpeg,
    tmp_path,
):
    output_path = tmp_path / "final.mp4"
    ass_path = tmp_path / "demo.ass"
    ass_path.write_text("dummy", encoding="utf-8")
    output_path.write_bytes(b"ok")
    mock_run_ffmpeg.return_value = SimpleNamespace(returncode=0, stderr="")

    result = burn_subtitle_ffmpeg(
        "C:/video/input.mp4",
        str(ass_path),
        str(output_path),
        40.0,
        business_card_text="",
        bgm_dir="C:/bgm",
        bgm_volume=0.35,
        enable_bgm=False,
        enable_subtitles=True,
    )

    assert result.ok is True
    mock_pick_bgm.assert_not_called()
    cmd = mock_run_ffmpeg.call_args.args[0]
    cmd_text = " ".join(cmd)
    assert "amix=" not in cmd_text
    assert "subtitles=" in cmd_text
    assert "C:/bgm/demo.mp3" not in cmd_text


@patch("lib.video_postprocess._run_ffmpeg")
@patch("lib.video_postprocess.has_audio_stream", return_value=True)
@patch("lib.video_postprocess._pick_bgm", return_value="C:/bgm/demo.mp3")
@patch("lib.video_postprocess.probe_resolution", return_value=(576, 1024))
def test_burn_subtitle_ffmpeg_skips_subtitles_when_disabled(
    _probe_resolution,
    _pick_bgm,
    _has_audio_stream,
    mock_run_ffmpeg,
    tmp_path,
):
    output_path = tmp_path / "final.mp4"
    ass_path = tmp_path / "demo.ass"
    ass_path.write_text("dummy", encoding="utf-8")
    output_path.write_bytes(b"ok")
    mock_run_ffmpeg.return_value = SimpleNamespace(returncode=0, stderr="")

    result = burn_subtitle_ffmpeg(
        "C:/video/input.mp4",
        str(ass_path),
        str(output_path),
        40.0,
        business_card_text="",
        bgm_dir="C:/bgm",
        bgm_volume=0.32,
        enable_bgm=True,
        enable_subtitles=False,
    )

    assert result.ok is True
    cmd = mock_run_ffmpeg.call_args.args[0]
    cmd_text = " ".join(cmd)
    assert "amix=inputs=2" in cmd_text
    assert "subtitles=" not in cmd_text


@patch("lib.video_postprocess.build_ass_subtitles")
@patch("lib.video_postprocess.burn_subtitle_ffmpeg")
@patch("lib.video_postprocess.resolve_target_duration", return_value=10.0)
@patch("lib.video_postprocess.probe_resolution", return_value=(576, 1024))
def test_render_skips_ass_build_when_subtitles_disabled(
    _probe_resolution,
    _resolve_duration,
    mock_burn,
    mock_build_ass,
    tmp_path,
):
    from lib.video_postprocess import render_video_with_template

    input_video = tmp_path / "in.mp4"
    input_video.write_bytes(b"video")
    mock_burn.return_value = SimpleNamespace(ok=True, status="published", output_path=str(tmp_path / "out.mp4"), error="")

    result = render_video_with_template(
        task_id="t1",
        output_dir=str(tmp_path),
        script="你好。世界。",
        business_card_text="",
        bgm_dir=None,
        bgm_volume=0,
        input_video_path=str(input_video),
        keep_original=False,
        enable_bgm=False,
        enable_subtitles=False,
    )

    assert result.ok is True
    mock_build_ass.assert_not_called()
    kwargs = mock_burn.call_args.kwargs
    assert kwargs.get("enable_subtitles") is False
    assert kwargs.get("enable_bgm") is False


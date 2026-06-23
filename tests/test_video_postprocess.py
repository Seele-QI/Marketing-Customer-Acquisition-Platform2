import importlib
import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt"
os.environ["CREDIT_REGISTER_BONUS"] = "100"

import main  # noqa: E402
import lib.video_postprocess as video_postprocess  # noqa: E402
from lib.video_postprocess import (  # noqa: E402
    _clean_subtitle_text,
    burn_subtitle_ffmpeg,
    create_timeline_by_chars,
    resolve_target_duration,
    split_script_segments,
)


@patch("main.asyncio.create_task")
@patch("main._cleanup_temp")
@patch("main._base64_to_temp_file", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_video_generate_stores_default_postprocess_fields(
    mock_get_rh_client,
    mock_base64_to_temp_file,
    _mock_cleanup_temp,
    mock_create_task,
):
    def _fake_create_task(coro):
        coro.close()
        return object()

    image_path = "C:/tmp/input.png"
    audio_path = "C:/tmp/input.mp3"
    mock_base64_to_temp_file.side_effect = [image_path, audio_path]

    rh = SimpleNamespace(
        upload_file=AsyncMock(side_effect=["https://example.com/image.png", "https://example.com/audio.mp3"]),
        submit_audio_clone=AsyncMock(return_value="audio-clone-task"),
        wait_for_completion=AsyncMock(return_value={"results": [{"url": "https://example.com/audio-clone.mp3"}]}),
        submit_video=AsyncMock(return_value="video-task-123"),
    )
    mock_get_rh_client.return_value = rh
    mock_create_task.side_effect = _fake_create_task

    req = main.VideoGenerateRequest(
        image_base64="aW1hZ2U=",
        audio_base64="YXVkaW8=",
        script="第一句\n第二句",
    )

    resp = asyncio.run(main.video_generate(req))

    assert resp.task_id == "video-task-123"
    stored = main._task_store["video-task-123"]
    assert stored["preset"] == "default"
    assert stored["bgm_dir"] == ""
    assert stored["bgm_volume"] == 0.32
    assert stored["business_card_text"] == ""
    assert stored["video_prompt_mode"] == "natural"
    assert len(stored["video_prompt"].splitlines()) == 11


@patch("main.asyncio.create_task")
@patch("main._cleanup_temp")
@patch("main._base64_to_temp_file", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_video_generate_uses_custom_video_prompt_when_provided(
    mock_get_rh_client,
    mock_base64_to_temp_file,
    _mock_cleanup_temp,
    mock_create_task,
):
    def _fake_create_task(coro):
        coro.close()
        return object()

    mock_base64_to_temp_file.side_effect = ["C:/tmp/input.png", "C:/tmp/input.mp3"]

    rh = SimpleNamespace(
        upload_file=AsyncMock(side_effect=["https://example.com/image.png", "https://example.com/audio.mp3"]),
        submit_audio_clone=AsyncMock(return_value="audio-clone-task"),
        wait_for_completion=AsyncMock(return_value={"results": [{"url": "https://example.com/audio-clone.mp3"}]}),
        submit_video=AsyncMock(return_value="video-task-123"),
    )
    mock_get_rh_client.return_value = rh
    mock_create_task.side_effect = _fake_create_task
    custom_prompt = "\n".join(
        [
            "自定义第一行",
            "自定义第二行",
            "自定义第三行",
            "自定义第四行",
            "自定义第五行",
            "自定义第六行",
            "自定义第七行",
            "自定义第八行",
            "自定义第九行",
            "自定义第十行",
            "自定义第十一行",
        ]
    )

    req = main.VideoGenerateRequest(
        image_base64="aW1hZ2U=",
        audio_base64="YXVkaW8=",
        script="第一句\n第二句",
        gender="female",
        video_prompt=custom_prompt,
        video_prompt_mode="mode2",
    )

    asyncio.run(main.video_generate(req))

    assert rh.submit_video.await_args.args[2] == custom_prompt
    stored = main._task_store["video-task-123"]
    assert stored["video_prompt_mode"] == "mode2"
    assert stored["video_prompt"] == custom_prompt
    assert len(stored["video_prompt"].splitlines()) == 11


@patch("main.asyncio.create_task")
@patch("main._cleanup_temp")
@patch("main._base64_to_temp_file", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_video_generate_blank_custom_prompt_falls_back_to_natural_mode(
    mock_get_rh_client,
    mock_base64_to_temp_file,
    _mock_cleanup_temp,
    mock_create_task,
):
    def _fake_create_task(coro):
        coro.close()
        return object()

    mock_base64_to_temp_file.side_effect = ["C:/tmp/input.png", "C:/tmp/input.mp3"]

    rh = SimpleNamespace(
        upload_file=AsyncMock(side_effect=["https://example.com/image.png", "https://example.com/audio.mp3"]),
        submit_audio_clone=AsyncMock(return_value="audio-clone-task"),
        wait_for_completion=AsyncMock(return_value={"results": [{"url": "https://example.com/audio-clone.mp3"}]}),
        submit_video=AsyncMock(return_value="video-task-blank"),
    )
    mock_get_rh_client.return_value = rh
    mock_create_task.side_effect = _fake_create_task

    req = main.VideoGenerateRequest(
        image_base64="aW1hZ2U=",
        audio_base64="YXVdaW8=",
        script="第一句\n第二句",
        gender="male",
        video_prompt=" \n \t ",
        video_prompt_mode="mode3",
    )

    asyncio.run(main.video_generate(req))

    final_prompt = rh.submit_video.await_args.args[2]
    assert final_prompt.startswith("他对着镜头说话")
    assert len(final_prompt.splitlines()) == 11
    stored = main._task_store["video-task-blank"]
    assert stored["video_prompt"] == final_prompt
    assert stored["video_prompt_mode"] == "natural"


def test_clean_subtitle_text_removes_punctuation():
    cleaned = _clean_subtitle_text("你好，世界。/AI字幕！")
    assert cleaned == "你好世界AI字幕"


def test_split_script_segments_splits_by_breaks_and_drops_empty_parts():
    """一句一字幕：只切句末标点（。！？）和换行，不切句中逗号。"""
    # 注：_clean_subtitle_text 会剥离全角逗号和斜杠（非 CJK 范围字符）
    segments = split_script_segments("第一句，第二句。\n\n第三句/第四句！？")
    assert segments == ["第一句第二句", "第三句第四句"]


def test_split_script_segments_keeps_clauses_when_no_sentence_end_punctuation():
    """一句一字幕：句中没有 。！？ 时保持完整（含 仍按 \n 切分）。"""
    segments = split_script_segments("你好，世界。我是张三。")
    assert segments == ["你好世界", "我是张三"]


def test_split_script_segments_splits_on_newlines_only():
    """无句末标点时按换行切分（用户手输一段一行）。"""
    segments = split_script_segments("公转私三个字，\n多少老板踩过坑，\n")
    assert segments == ["公转私三个字", "多少老板踩过坑"]


def test_auto_wrap_prefers_punctuation_then_hardcut():
    """_auto_wrap 优先按 ，、 切分，24 字内不折行。"""
    from lib.video_postprocess import _auto_wrap
    # 短文本原样返回
    assert _auto_wrap("你好世界") == "你好世界"
    # 中等长度（24 字内）原样返回
    assert _auto_wrap("这是一句测试文本不超过二十四个字") == "这是一句测试文本不超过二十四个字"
    # 优先按 ， 折行（_clean_subtitle_text 在 _auto_wrap 内调用，会剥离 ，）
    wrapped = _auto_wrap("这是一句测试文本，一句测试文本，两句测试文本，三句测试文本")
    assert "\\N" in wrapped  # 至少折了一次行
    # 折行后每段长度不超过 24 字
    for part in wrapped.split("\\N"):
        assert len(part) <= 24


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


@patch("main.asyncio.to_thread", new_callable=AsyncMock)
@patch("main.httpx.AsyncClient")
def test_run_post_process_passes_bgm_related_arguments(mock_client_cls, mock_to_thread):
    task_id = "task-123"
    main._task_store[task_id] = {
        "task_id": task_id,
        "script": "第一句\n第二句",
        "business_card_text": "品牌名片",
        "bgm_dir": "bgm/smooth",
        "bgm_volume": 0.25,
        "preset": "default",
    }

    mock_client = mock_client_cls.return_value.__aenter__.return_value
    mock_response = type("Resp", (), {"content": b"video", "raise_for_status": lambda self: None})()
    mock_client.get = AsyncMock(return_value=mock_response)
    mock_to_thread.return_value = SimpleNamespace(ok=False, output_path=None, error="boom")

    asyncio.run(main._run_post_process(task_id, "https://example.com/video.mp4"))

    args = mock_to_thread.call_args.args
    kwargs = mock_to_thread.call_args.kwargs
    assert args[0].__name__ == "render_video_with_template"
    assert kwargs["script"] == "第一句\n第二句"
    assert kwargs["business_card_text"] == "品牌名片"
    assert kwargs["bgm_dir"] == "bgm/smooth"
    assert kwargs["bgm_volume"] == 0.25
    assert "input_video_path" in kwargs


def test_build_motion_prompt_falls_back_to_gender_default_when_custom_prompt_empty():
    prompt = main.build_motion_prompt("female", "")
    assert prompt.startswith("她对着镜头说话")
    assert len(prompt.splitlines()) == 11


def test_build_motion_prompt_keeps_valid_11_line_custom_prompt():
    custom_prompt = "\n".join([f"自定义第{i}行" for i in range(1, 12)])
    assert main.build_motion_prompt("female", custom_prompt) == custom_prompt


def test_build_motion_prompt_rejects_custom_prompt_when_line_count_is_not_11():
    custom_prompt = "\n".join([f"自定义第{i}行" for i in range(1, 10)])

    try:
        main.build_motion_prompt("female", custom_prompt)
    except ValueError as exc:
        assert "11" in str(exc)
    else:
        raise AssertionError("expected ValueError for invalid custom prompt line count")

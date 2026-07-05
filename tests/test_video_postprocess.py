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


@patch("main.consume_video_creation_segments", return_value=9200)
@patch("main.consume_voice_clone", return_value=9950)
@patch("main.require_user", return_value=_FAKE_USER)
@patch("main.asyncio.create_task")
@patch("main._cleanup_temp")
@patch("main._validate_cloned_audio")
@patch("main.asyncio.to_thread", new_callable=AsyncMock)
@patch("main.download_to_path", new_callable=AsyncMock)
@patch("main._base64_to_temp_file", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_video_generate_stores_default_postprocess_fields(
    mock_get_rh_client,
    mock_base64_to_temp_file,
    mock_download,
    mock_to_thread,
    _mock_validate_clone,
    _mock_cleanup_temp,
    mock_create_task,
    _mock_require_user,
    _mock_consume_clone,
    _mock_consume_video,
):
    def _fake_create_task(coro):
        coro.close()
        return object()

    image_path = "C:/tmp/input.png"
    audio_path = "C:/tmp/input.mp3"
    mock_base64_to_temp_file.side_effect = [image_path, audio_path]
    mock_download.return_value = 1024
    mock_to_thread.return_value = [(0, "C:/tmp/segments/segment_000.mp3")]

    rh = SimpleNamespace(
        upload_file=AsyncMock(
            side_effect=[
                "https://example.com/image.png",
                "https://example.com/audio.mp3",
                "https://example.com/segment0.mp3",
            ]
        ),
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

    resp = asyncio.run(main.video_generate(req, _fake_request()))

    assert resp.task_id.startswith("vg_")
    stored = main._task_store[resp.task_id]
    assert stored["preset"] == "default"
    assert stored["bgm_dir"] == ""
    assert stored["bgm_volume"] == 0.32
    assert stored["business_card_text"] == ""
    assert stored["video_prompt_mode"] == "natural"
    assert stored["user_id"] == _FAKE_USER.id
    assert len(stored["video_prompt"].splitlines()) == 5
    assert stored["segment_count"] == 1
    assert stored["segments_completed"] == 0
    assert rh.submit_video.await_count == 1


@patch("main.consume_video_creation_segments", return_value=9200)
@patch("main.consume_voice_clone", return_value=9950)
@patch("main.require_user", return_value=_FAKE_USER)
@patch("main.asyncio.create_task")
@patch("main._cleanup_temp")
@patch("main._validate_cloned_audio")
@patch("main.asyncio.to_thread", new_callable=AsyncMock)
@patch("main.download_to_path", new_callable=AsyncMock)
@patch("main._base64_to_temp_file", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_video_generate_uses_custom_video_prompt_when_provided(
    mock_get_rh_client,
    mock_base64_to_temp_file,
    mock_download,
    mock_to_thread,
    _mock_validate_clone,
    _mock_cleanup_temp,
    mock_create_task,
    _mock_require_user,
    _mock_consume_clone,
    _mock_consume_video,
):
    def _fake_create_task(coro):
        coro.close()
        return object()

    mock_base64_to_temp_file.side_effect = ["C:/tmp/input.png", "C:/tmp/input.mp3"]
    mock_download.return_value = 1024
    mock_to_thread.return_value = [(0, "C:/tmp/segments/segment_000.mp3")]

    rh = SimpleNamespace(
        upload_file=AsyncMock(
            side_effect=[
                "https://example.com/image.png",
                "https://example.com/audio.mp3",
                "https://example.com/segment0.mp3",
            ]
        ),
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

    resp = asyncio.run(main.video_generate(req, _fake_request()))

    assert rh.submit_video.await_args.args[2] == custom_prompt
    stored = main._task_store[resp.task_id]
    assert stored["video_prompt_mode"] == "mode2"
    assert stored["video_prompt"] == custom_prompt
    assert len(stored["video_prompt"].splitlines()) == 5


@patch("main.consume_video_creation_segments", return_value=9200)
@patch("main.consume_voice_clone", return_value=9950)
@patch("main.require_user", return_value=_FAKE_USER)
@patch("main.asyncio.create_task")
@patch("main._cleanup_temp")
@patch("main._validate_cloned_audio")
@patch("main.asyncio.to_thread", new_callable=AsyncMock)
@patch("main.download_to_path", new_callable=AsyncMock)
@patch("main._base64_to_temp_file", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_video_generate_blank_custom_prompt_falls_back_to_natural_mode(
    mock_get_rh_client,
    mock_base64_to_temp_file,
    mock_download,
    mock_to_thread,
    _mock_validate_clone,
    _mock_cleanup_temp,
    mock_create_task,
    _mock_require_user,
    _mock_consume_clone,
    _mock_consume_video,
):
    def _fake_create_task(coro):
        coro.close()
        return object()

    mock_base64_to_temp_file.side_effect = ["C:/tmp/input.png", "C:/tmp/input.mp3"]
    mock_download.return_value = 1024
    mock_to_thread.return_value = [(0, "C:/tmp/segments/segment_000.mp3")]

    rh = SimpleNamespace(
        upload_file=AsyncMock(
            side_effect=[
                "https://example.com/image.png",
                "https://example.com/audio.mp3",
                "https://example.com/segment0.mp3",
            ]
        ),
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

    resp = asyncio.run(main.video_generate(req, _fake_request()))

    final_prompt = rh.submit_video.await_args.args[2]
    assert final_prompt.startswith("他对着镜头说话")
    assert len(final_prompt.splitlines()) == 5
    stored = main._task_store[resp.task_id]
    assert stored["video_prompt"] == final_prompt
    assert stored["video_prompt_mode"] == "natural"


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


@patch("main._resolve_bgm_dir", return_value="bgm/smooth")
@patch("main.asyncio.to_thread", new_callable=AsyncMock)
@patch("main.download_to_path", new_callable=AsyncMock)
def test_run_post_process_passes_bgm_related_arguments(mock_download, mock_to_thread, _mock_bgm):
    task_id = "task-123"
    main._task_store[task_id] = {
        "task_id": task_id,
        "script": "第一句\n第二句",
        "business_card_text": "品牌名片",
        "bgm_dir": "bgm/smooth",
        "bgm_volume": 0.25,
        "preset": "default",
    }

    mock_download.return_value = 1024
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
    assert len(prompt.splitlines()) == 5


def test_build_motion_prompt_keeps_valid_5_line_custom_prompt():
    custom_prompt = "\n".join([f"自定义第{i}行" for i in range(1, 6)])
    assert main.build_motion_prompt("female", custom_prompt) == custom_prompt


def test_build_motion_prompt_rejects_custom_prompt_when_line_count_is_not_5():
    custom_prompt = "\n".join([f"自定义第{i}行" for i in range(1, 4)])

    try:
        main.build_motion_prompt("female", custom_prompt)
    except ValueError as exc:
        assert "5" in str(exc)
    else:
        raise AssertionError("expected ValueError for invalid custom prompt line count")


@patch("main.consume_video_creation_segments")
@patch("main.consume_voice_clone")
@patch("main.require_user", return_value=_FAKE_USER)
@patch("main.asyncio.create_task")
@patch("main._cleanup_temp")
@patch("main._validate_cloned_audio")
@patch("main.asyncio.to_thread", new_callable=AsyncMock)
@patch("main.download_to_path", new_callable=AsyncMock)
@patch("main._base64_to_temp_file", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_video_generate_submits_video_once_per_audio_segment(
    mock_get_rh_client,
    mock_base64_to_temp_file,
    mock_download,
    mock_to_thread,
    _mock_validate_clone,
    _mock_cleanup_temp,
    mock_create_task,
    _mock_require_user,
    mock_consume_clone,
    mock_consume_video,
):
    def _fake_create_task(coro):
        coro.close()
        return object()

    mock_base64_to_temp_file.side_effect = ["C:/tmp/input.png", "C:/tmp/input.mp3"]
    mock_download.return_value = 1024
    mock_to_thread.return_value = [
        (0, "C:/tmp/segments/segment_000.mp3"),
        (1, "C:/tmp/segments/segment_001.mp3"),
        (2, "C:/tmp/segments/segment_002.mp3"),
    ]

    rh = SimpleNamespace(
        upload_file=AsyncMock(
            side_effect=[
                "https://example.com/image.png",
                "https://example.com/audio.mp3",
                "https://example.com/segment0.mp3",
                "https://example.com/segment1.mp3",
                "https://example.com/segment2.mp3",
            ]
        ),
        submit_audio_clone=AsyncMock(return_value="audio-clone-task"),
        wait_for_completion=AsyncMock(return_value={"results": [{"url": "https://example.com/audio-clone.mp3"}]}),
        submit_video=AsyncMock(side_effect=["rh-seg-0", "rh-seg-1", "rh-seg-2"]),
    )
    mock_get_rh_client.return_value = rh
    mock_create_task.side_effect = _fake_create_task
    mock_consume_clone.return_value = 9950
    mock_consume_video.return_value = 9200

    req = main.VideoGenerateRequest(
        image_base64="aW1hZ2U=",
        audio_base64="YXVkaW8=",
        script="多段口播测试文案",
    )

    resp = asyncio.run(main.video_generate(req, _fake_request()))

    assert rh.submit_video.await_count == 3
    stored = main._task_store[resp.task_id]
    assert stored["segment_count"] == 3
    assert stored["rh_video_task_ids"] == ["rh-seg-0", "rh-seg-1", "rh-seg-2"]
    assert stored["credit_clone_cost"] == 10
    assert stored["credit_video_cost"] == 750
    mock_consume_clone.assert_called_once_with(
        user_id=_FAKE_USER.id,
        ref_id=f"{resp.task_id}:clone",
        note="口播音色克隆",
    )
    mock_consume_video.assert_called_once_with(
        user_id=_FAKE_USER.id,
        ref_id=f"{resp.task_id}:video",
        segment_count=3,
        note="口播视频生成 3 段",
    )
    assert mock_to_thread.await_count == 1
    assert rh.submit_audio_clone.await_count == 1

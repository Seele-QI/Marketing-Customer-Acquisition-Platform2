from __future__ import annotations

import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

from lib.dh_video_economy_service import (
    build_finalize_command,
    run_all_segments,
    select_runninghub_result_url,
)
from lib.runninghub_client import RunningHubClient


def _response(payload: dict):
    return SimpleNamespace(is_success=True, json=lambda: payload, text="")


def test_runninghub_client_uses_bearer_authorization_header():
    async def inspect_header():
        client = RunningHubClient("test-key")
        http = await client._get_client()
        try:
            return http.headers.get("Authorization")
        finally:
            await client.close()

    assert asyncio.run(inspect_header()) == "Bearer test-key"


def test_economy_audio_clone_uses_documented_ai_app_payload():
    client = RunningHubClient("test-key")
    http = AsyncMock()
    http.post.return_value = _response({"taskId": "clone-1"})
    client._client = http

    task_id = asyncio.run(
        client.submit_economy_audio_clone(
            "https://example.com/voice.mp3",
            "这是完整口播文案",
        )
    )

    assert task_id == "clone-1"
    url = http.post.call_args.args[0]
    payload = http.post.call_args.kwargs["json"]
    assert url.endswith("/openapi/v2/run/ai-app/1965614643077070850")
    assert payload["instanceType"] == "default"
    assert payload["usePersonalQueue"] == "false"
    assert payload["nodeInfoList"] == [
        {"nodeId": "13", "fieldName": "audio", "fieldValue": "https://example.com/voice.mp3"},
        {"nodeId": "15", "fieldName": "audio", "fieldValue": "https://example.com/voice.mp3"},
        {"nodeId": "14", "fieldName": "value", "fieldValue": "这是完整口播文案"},
    ]


def test_economy_video_uses_documented_ai_app_payload():
    client = RunningHubClient("test-key")
    http = AsyncMock()
    http.post.return_value = _response({"taskId": "video-1"})
    client._client = http

    task_id = asyncio.run(
        client.submit_economy_video(
            "https://example.com/avatar.png",
            "https://example.com/segment.wav",
            "人物自然地说话",
        )
    )

    assert task_id == "video-1"
    url = http.post.call_args.args[0]
    payload = http.post.call_args.kwargs["json"]
    assert url.endswith("/openapi/v2/run/ai-app/2073634796697378818")
    assert payload["instanceType"] == "plus"
    assert payload["usePersonalQueue"] == "false"
    assert payload["nodeInfoList"] == [
        {"nodeId": "186", "fieldName": "value", "fieldValue": "1024"},
        {"nodeId": "180", "fieldName": "image", "fieldValue": "https://example.com/avatar.png"},
        {"nodeId": "6", "fieldName": "audio", "fieldValue": "https://example.com/segment.wav"},
        {"nodeId": "7", "fieldName": "start_time", "fieldValue": "0:00"},
        {"nodeId": "7", "fieldName": "end_time", "fieldValue": "5:00"},
        {"nodeId": "114", "fieldName": "positive_prompt", "fieldValue": "人物自然地说话"},
    ]


def test_finalize_command_replaces_segment_audio_and_trims_to_clone_duration():
    cmd = build_finalize_command(
        ffmpeg_path="ffmpeg",
        concat_video_path="concat.mp4",
        clone_audio_path="clone.mp3",
        output_path="final.mp4",
        duration_sec=36.25,
    )

    assert cmd[:7] == ["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", "concat.mp4", "-i"]
    assert cmd[7] == "clone.mp3"
    assert ["-map", "0:v:0"] == cmd[8:10]
    assert ["-map", "1:a:0"] == cmd[10:12]
    assert "36.250" in cmd
    assert "-shortest" in cmd
    assert cmd[-1] == "final.mp4"


def test_result_selector_ignores_preview_and_chooses_requested_media_type():
    result = {
        "results": [
            {"url": "https://cdn.example.com/preview.png", "outputType": "image"},
            {"url": "https://cdn.example.com/final.mp4?token=x", "outputType": "video"},
            {"url": "https://cdn.example.com/voice.wav", "outputType": "audio"},
        ]
    }
    assert select_runninghub_result_url(result, kind="video").endswith("final.mp4?token=x")
    assert select_runninghub_result_url(result, kind="audio").endswith("voice.wav")


def test_all_segments_start_concurrently_but_results_keep_numeric_order():
    started: list[int] = []
    release = asyncio.Event()

    async def worker(index: int, path: str):
        started.append(index)
        if len(started) == 3:
            release.set()
        await asyncio.wait_for(release.wait(), timeout=1)
        await asyncio.sleep((2 - index) * 0.001)
        return f"{index}:{path}"

    result = asyncio.run(
        run_all_segments([(2, "segment_002.wav"), (0, "segment_000.wav"), (1, "segment_001.wav")], worker)
    )
    assert sorted(started) == [0, 1, 2]
    assert result == ["0:segment_000.wav", "1:segment_001.wav", "2:segment_002.wav"]

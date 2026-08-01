import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest
from fastapi.testclient import TestClient

from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt"
os.environ["RUNNINGHUB_API_KEY"] = "test-rh-key"

import main  # noqa: E402
from lib.runninghub_client import RunningHubClient, build_video_cover_prompt  # noqa: E402


client = TestClient(main.app)


@pytest.fixture(autouse=True)
def clear_cover_state():
    main._cover_task_store.clear()
    main._cover_pipeline_tasks.clear()
    main._cover_request_refs.clear()
    yield
    main._cover_task_store.clear()
    main._cover_pipeline_tasks.clear()
    main._cover_request_refs.clear()


def test_build_video_cover_prompt_includes_script():
    prompt = build_video_cover_prompt("今天分享三个护肤小技巧")
    assert "今天分享三个护肤小技巧" in prompt
    assert "短视频封面" in prompt


def test_image_channel_uses_independent_overseas_base_and_key():
    rh_client = RunningHubClient(
        "domestic-video-key",
        image_api_key="overseas-image-key",
        image_base_url="https://www.runninghub.ai/openapi/v2",
    )
    image_http_client = AsyncMock()
    image_http_client.post.return_value = SimpleNamespace(
        is_success=True,
        json=lambda: {"taskId": "image-task-1"},
    )
    rh_client._image_client = image_http_client

    task_id = asyncio.run(
        rh_client.submit_text_image(
            prompt="商业海报",
            aspect_ratio="3:4",
            resolution="1k",
        )
    )

    assert task_id == "image-task-1"
    assert image_http_client.post.call_args.args[0] == (
        "https://www.runninghub.ai/openapi/v2/rhart-image-g-2/text-to-image"
    )
    assert rh_client.image_api_key == "overseas-image-key"


def test_image_upload_and_query_stay_on_overseas_channel(tmp_path):
    source = tmp_path / "reference.png"
    source.write_bytes(b"png")
    rh_client = RunningHubClient(
        "domestic-video-key",
        image_api_key="overseas-image-key",
        image_base_url="https://www.runninghub.ai/openapi/v2",
    )
    image_http_client = AsyncMock()
    image_http_client.post.side_effect = [
        SimpleNamespace(
            is_success=True,
            json=lambda: {"data": {"download_url": "https://example.com/reference.png"}},
        ),
        SimpleNamespace(
            is_success=True,
            json=lambda: {"taskId": "image-task-1", "status": "RUNNING"},
        ),
    ]
    rh_client._image_client = image_http_client

    uploaded = asyncio.run(rh_client.upload_image_file(str(source)))
    status = asyncio.run(rh_client.query_image_task("image-task-1"))

    assert uploaded == "https://example.com/reference.png"
    assert status["status"] == "RUNNING"
    assert image_http_client.post.await_args_list[0].args[0] == (
        "https://www.runninghub.ai/openapi/v2/media/upload/binary"
    )
    assert image_http_client.post.await_args_list[1].args[0] == (
        "https://www.runninghub.ai/openapi/v2/query"
    )


def test_submit_cover_image_uses_runninghub_image_to_image_payload():
    rh_client = RunningHubClient("test-api-key")
    http_client = AsyncMock()
    http_client.post.return_value = SimpleNamespace(
        is_success=True,
        json=lambda: {"taskId": "cover-task-1"},
    )
    rh_client._image_client = http_client

    task_id = asyncio.run(
        rh_client.submit_cover_image(
            prompt="封面描述",
            image_urls=["https://example.com/input.png"],
            aspect_ratio="9:16",
            resolution="1k",
        )
    )

    assert task_id == "cover-task-1"
    assert http_client.post.call_args.args[0].endswith("/openapi/v2/rhart-image-g-2/image-to-image")
    assert http_client.post.call_args.kwargs["json"] == {
        "prompt": "封面描述",
        "imageUrls": ["https://example.com/input.png"],
        "aspectRatio": "9:16",
        "resolution": "1k",
    }


def test_submit_poster_image_uses_runninghub_text_to_image_payload():
    rh_client = RunningHubClient("test-api-key")
    http_client = AsyncMock()
    http_client.post.return_value = SimpleNamespace(
        is_success=True,
        json=lambda: {"taskId": "poster-rh-1"},
    )
    rh_client._image_client = http_client

    task_id = asyncio.run(
        rh_client.submit_text_image(
            prompt="商业海报",
            aspect_ratio="25:9",
            resolution="2k",
        )
    )

    assert task_id == "poster-rh-1"
    assert http_client.post.call_args.args[0].endswith(
        "/openapi/v2/rhart-image-g-2/text-to-image"
    )
    assert http_client.post.call_args.kwargs["json"] == {
        "prompt": "商业海报",
        "aspectRatio": "25:9",
        "resolution": "2k",
    }


def test_submit_image_to_image_uses_all_reference_urls():
    rh_client = RunningHubClient("test-api-key")
    http_client = AsyncMock()
    http_client.post.return_value = SimpleNamespace(
        is_success=True,
        json=lambda: {"taskId": "image-rh-1"},
    )
    rh_client._image_client = http_client

    task_id = asyncio.run(
        rh_client.submit_image_to_image(
            prompt="综合重绘",
            image_urls=[
                "https://example.com/subject.png",
                "https://example.com/style.png",
            ],
            aspect_ratio="16:9",
            resolution="2k",
        )
    )

    assert task_id == "image-rh-1"
    assert http_client.post.call_args.args[0].endswith(
        "/openapi/v2/rhart-image-g-2/image-to-image"
    )
    assert http_client.post.call_args.kwargs["json"] == {
        "prompt": "综合重绘",
        "imageUrls": [
            "https://example.com/subject.png",
            "https://example.com/style.png",
        ],
        "aspectRatio": "16:9",
        "resolution": "2k",
    }


def test_upload_file_retries_transient_network_failure(tmp_path):
    source = tmp_path / "cover.png"
    source.write_bytes(b"png")
    rh_client = RunningHubClient("test-api-key")
    http_client = AsyncMock()
    http_client.post.side_effect = [
        httpx.ConnectError("temporary disconnect"),
        SimpleNamespace(
            is_success=True,
            json=lambda: {"data": {"download_url": "https://example.com/cover.png"}},
        ),
    ]
    rh_client._client = http_client

    with patch("asyncio.sleep", new=AsyncMock()) as sleep:
        result = asyncio.run(rh_client.upload_file(str(source)))

    assert result == "https://example.com/cover.png"
    assert http_client.post.await_count == 2
    sleep.assert_awaited_once_with(1)


@patch("main.asyncio.create_task")
@patch("main._get_rh_client")
def test_video_cover_submit_returns_task_id(mock_get_rh_client, mock_create_task):
    def fake_create_task(coro):
        coro.close()
        return object()

    rh = SimpleNamespace(
        upload_file=AsyncMock(return_value="https://example.com/ref.png"),
        submit_cover_image=AsyncMock(return_value="rh-cover-1"),
        wait_for_completion=AsyncMock(return_value={"results": [{"url": "https://example.com/cover.png"}]}),
        close=AsyncMock(),
    )
    mock_get_rh_client.return_value = rh
    mock_create_task.side_effect = fake_create_task

    tiny_png_b64 = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    resp = client.post(
        "/api/video/cover",
        json={
            "script": "测试文案",
            "reference_image_base64": tiny_png_b64,
            "aspect_ratio": "9:16",
            "resolution": "1k",
        },
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["cover_task_id"].startswith("cover_")
    assert data["cover_task_id"] in main._cover_task_store


@patch("main.asyncio.create_task")
def test_video_cover_submit_is_idempotent_for_same_request_ref(mock_create_task):
    def fake_create_task(coro):
        coro.close()
        return object()

    mock_create_task.side_effect = fake_create_task
    tiny_png_b64 = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    payload = {
        "script": "测试文案",
        "reference_image_base64": tiny_png_b64,
        "aspect_ratio": "9:16",
        "resolution": "1k",
        "linked_task_id": "dhe_cover_retry",
        "source": "dh-video-economy",
        "request_ref": "cover-submit-retry-1",
    }

    first = client.post("/api/video/cover", json=payload)
    second = client.post("/api/video/cover", json=payload)

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert second.json()["cover_task_id"] == first.json()["cover_task_id"]
    assert mock_create_task.call_count == 1


@patch("main.download_to_path", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_video_cover_status_success(mock_get_rh_client, mock_download):
    cover_task_id = "cover_test_1"
    main._cover_task_store[cover_task_id] = {
        "cover_task_id": cover_task_id,
        "status": "success",
        "cover_url": "/static/video-covers/cover_test_1.png",
        "error": "",
        "stage_label": "封面生成完成",
    }

    resp = client.get(f"/api/video/cover/status?coverTaskId={cover_task_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["cover_url"] == "/static/video-covers/cover_test_1.png"

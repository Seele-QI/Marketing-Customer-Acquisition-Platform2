import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt"
os.environ["CREDIT_REGISTER_BONUS"] = "100"

import main  # noqa: E402
from lib.runninghub_client import RunningHubClient  # noqa: E402


client = TestClient(main.app)


@pytest.fixture(autouse=True)
def clear_video_cover_state():
    main._task_store.clear()
    main._poll_tasks.clear()
    yield
    main._task_store.clear()
    main._poll_tasks.clear()


def test_submit_cover_image_uses_runninghub_image_to_image_payload():
    rh_client = RunningHubClient("test-api-key")
    http_client = AsyncMock()
    http_client.post.return_value = SimpleNamespace(
        is_success=True,
        json=lambda: {"taskId": "cover-task-1"},
    )
    rh_client._client = http_client

    task_id = asyncio.run(
        rh_client.submit_cover_image(
            prompt="封面描述",
            image_urls=["https://example.com/input.png"],
            aspect_ratio="3:4",
            resolution="1k",
        )
    )

    assert task_id == "cover-task-1"
    assert http_client.post.call_args.args[0].endswith("/openapi/v2/rhart-image-g-2/image-to-image")
    assert http_client.post.call_args.kwargs["json"] == {
        "prompt": "封面描述",
        "imageUrls": ["https://example.com/input.png"],
        "aspectRatio": "3:4",
        "resolution": "1k",
    }


@patch("main._run_post_process", new_callable=AsyncMock)
@patch("main.asyncio.create_task")
@patch("main._get_rh_client")
def test_poll_video_task_marks_cover_running_and_success_without_breaking_video(
    mock_get_rh_client,
    mock_create_task,
    _mock_run_post_process,
):
    def fake_create_task(coro):
        coro.close()
        return object()

    task_id = "video-task-cover-1"
    main._task_store[task_id] = {
        "task_id": task_id,
        "status": "queued",
        "progress": 0,
        "video_url": "",
        "image_url": "https://example.com/original.png",
        "gender": "female",
        "cover_url": "",
        "cover_status": "idle",
        "cover_error": "",
        "cover_task_id": "",
        "post_stage": "",
        "post_progress": 0,
        "post_error": "",
        "error": "",
        "estimated_minutes": 30,
    }

    rh = SimpleNamespace(
        wait_for_completion=AsyncMock(
            side_effect=[
                {"results": [{"url": "https://example.com/video.mp4"}]},
                {"results": [{"url": "https://example.com/cover.png"}]},
            ]
        ),
        submit_cover_image=AsyncMock(return_value="cover-task-1"),
    )
    mock_get_rh_client.return_value = rh
    mock_create_task.side_effect = fake_create_task

    asyncio.run(main._poll_video_task(task_id))

    stored = main._task_store[task_id]
    assert stored["status"] in {"success", "post_processing"}
    assert stored["video_url"] == "https://example.com/video.mp4"
    assert stored["cover_status"] == "success"
    assert stored["cover_url"] == "https://example.com/cover.png"
    assert stored["cover_error"] == ""
    assert stored["cover_task_id"] == "cover-task-1"


@patch("main._run_post_process", new_callable=AsyncMock)
@patch("main.asyncio.create_task")
@patch("main._get_rh_client")
def test_poll_video_task_keeps_video_success_when_cover_generation_fails(
    mock_get_rh_client,
    mock_create_task,
    _mock_run_post_process,
):
    def fake_create_task(coro):
        coro.close()
        return object()

    task_id = "video-task-cover-failure"
    main._task_store[task_id] = {
        "task_id": task_id,
        "status": "queued",
        "progress": 0,
        "video_url": "",
        "image_url": "https://example.com/original.png",
        "gender": "female",
        "cover_url": "",
        "cover_status": "idle",
        "cover_error": "",
        "cover_task_id": "",
        "post_stage": "",
        "post_progress": 0,
        "post_error": "",
        "error": "",
        "estimated_minutes": 30,
    }

    rh = SimpleNamespace(
        wait_for_completion=AsyncMock(return_value={"results": [{"url": "https://example.com/video.mp4"}]}),
        submit_cover_image=AsyncMock(side_effect=RuntimeError("封面生成失败")),
    )
    mock_get_rh_client.return_value = rh
    mock_create_task.side_effect = fake_create_task

    asyncio.run(main._poll_video_task(task_id))

    stored = main._task_store[task_id]
    assert stored["status"] in {"success", "post_processing"}
    assert stored["video_url"] == "https://example.com/video.mp4"
    assert stored["error"] == ""
    assert stored["cover_status"] == "failed"
    assert stored["cover_error"] == "封面生成失败"


@patch("main._get_rh_client")
def test_video_cover_retry_returns_cover_success_without_changing_video_status(mock_get_rh_client):
    task_id = "video-task-cover-retry"
    main._task_store[task_id] = {
        "task_id": task_id,
        "status": "success",
        "progress": 100,
        "video_url": "https://example.com/video.mp4",
        "image_url": "https://example.com/original.png",
        "gender": "female",
        "cover_url": "",
        "cover_status": "failed",
        "cover_error": "封面生成失败",
        "cover_task_id": "",
        "error": "",
        "estimated_minutes": 0,
    }

    rh = SimpleNamespace(
        submit_cover_image=AsyncMock(return_value="cover-task-retry"),
        wait_for_completion=AsyncMock(return_value={"results": [{"url": "https://example.com/cover-retry.png"}]}),
    )
    mock_get_rh_client.return_value = rh

    resp = client.post("/api/video/cover", json={"task_id": task_id})

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data == {
        "cover_url": "https://example.com/cover-retry.png",
        "task_id": task_id,
        "status": "success",
    }
    assert main._task_store[task_id]["status"] == "success"
    assert main._task_store[task_id]["cover_url"] == "https://example.com/cover-retry.png"
    assert main._task_store[task_id]["cover_status"] == "success"
    assert main._task_store[task_id]["cover_error"] == ""
    assert main._task_store[task_id]["cover_task_id"] == "cover-task-retry"

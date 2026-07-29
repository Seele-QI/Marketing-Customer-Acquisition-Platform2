import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt"
os.environ["RUNNINGHUB_API_KEY"] = "test-rh-key"

import main  # noqa: E402


client = TestClient(main.app)
TINY_IMAGE = "aGVsbG8="


@pytest.fixture(autouse=True)
def clear_image_workbench_state():
    store = getattr(main, "_image_workbench_task_store", None)
    tasks = getattr(main, "_image_workbench_pipeline_tasks", None)
    if store is not None:
        store.clear()
    if tasks is not None:
        tasks.clear()
    yield
    if store is not None:
        for item in store.values():
            for path in item.get("reference_local_paths", []):
                main._cleanup_temp(path)
        store.clear()
    if tasks is not None:
        tasks.clear()


@patch("main.asyncio.create_task")
def test_image_workbench_submit_accepts_poster_references(mock_create_task):
    def fake_create_task(coro):
        coro.close()
        return object()

    mock_create_task.side_effect = fake_create_task
    response = client.post(
        "/api/image-workbench/generate",
        json={
            "mode": "poster",
            "prompt": "新品海报",
            "aspect_ratio": "3:4",
            "resolution": "2k",
            "count": 2,
            "reference_images": [
                {
                    "role": "subject",
                    "mime_type": "image/png",
                    "data_base64": TINY_IMAGE,
                },
                {
                    "role": "style",
                    "mime_type": "image/jpeg",
                    "data_base64": TINY_IMAGE,
                },
            ],
        },
    )

    assert response.status_code == 200, response.text
    task_id = response.json()["task_id"]
    assert task_id.startswith("image_")
    stored = main._image_workbench_task_store[task_id]
    assert stored["mode"] == "poster"
    assert len(stored["reference_local_paths"]) == 2


def test_image_workbench_rejects_fifth_general_reference():
    response = client.post(
        "/api/image-workbench/generate",
        json={
            "mode": "image",
            "prompt": "自由创作",
            "aspect_ratio": "1:1",
            "resolution": "1k",
            "count": 2,
            "reference_mode": "remix",
            "reference_images": [
                {
                    "role": "general",
                    "mime_type": "image/webp",
                    "data_base64": TINY_IMAGE,
                }
                for _ in range(5)
            ],
        },
    )
    assert response.status_code == 400
    assert "最多添加 4 张" in response.text


@pytest.mark.parametrize("mime_type", ["image/gif", "text/plain"])
def test_image_workbench_rejects_unsupported_reference_type(mime_type):
    response = client.post(
        "/api/image-workbench/generate",
        json={
            "mode": "image",
            "prompt": "自由创作",
            "aspect_ratio": "1:1",
            "resolution": "1k",
            "count": 2,
            "reference_images": [
                {
                    "role": "general",
                    "mime_type": mime_type,
                    "data_base64": TINY_IMAGE,
                }
            ],
        },
    )
    assert response.status_code == 400
    assert "格式" in response.text


def _seed_task(task_id: str, *, with_references: bool):
    main._image_workbench_task_store[task_id] = {
        "task_id": task_id,
        "mode": "image",
        "status": "queued",
        "image_urls": [],
        "warning": "",
        "error": "",
        "stage_label": "排队中",
        "prompt": "测试图片",
        "aspect_ratio": "16:9",
        "resolution": "2k",
        "count": 2,
        "reference_local_paths": ["one.png", "two.png"] if with_references else [],
    }


@patch("main._cleanup_temp")
@patch("main.download_to_path", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_image_workbench_pipeline_uses_text_to_image_without_references(
    mock_get_rh_client,
    mock_download,
    mock_cleanup,
):
    task_id = "image_text_1"
    _seed_task(task_id, with_references=False)
    rh = SimpleNamespace(
        upload_file=AsyncMock(),
        submit_text_image=AsyncMock(side_effect=["rh-1", "rh-2"]),
        submit_image_to_image=AsyncMock(),
        wait_for_completion=AsyncMock(
            side_effect=[
                {"results": [{"url": "https://example.com/one.png"}]},
                {"results": [{"url": "https://example.com/two.png"}]},
            ]
        ),
        close=AsyncMock(),
    )
    mock_get_rh_client.return_value = rh

    asyncio.run(main._run_image_workbench_pipeline(task_id))

    assert main._image_workbench_task_store[task_id]["status"] == "success"
    assert rh.submit_text_image.await_count == 2
    rh.submit_image_to_image.assert_not_awaited()
    rh.upload_file.assert_not_awaited()
    mock_cleanup.assert_not_called()


@patch("main._cleanup_temp")
@patch("main.download_to_path", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_image_workbench_pipeline_uploads_references_once_and_uses_image_to_image(
    mock_get_rh_client,
    mock_download,
    mock_cleanup,
):
    task_id = "image_refs_1"
    _seed_task(task_id, with_references=True)
    rh = SimpleNamespace(
        upload_file=AsyncMock(
            side_effect=[
                "https://example.com/input-one.png",
                "https://example.com/input-two.png",
            ]
        ),
        submit_text_image=AsyncMock(),
        submit_image_to_image=AsyncMock(side_effect=["rh-1", "rh-2"]),
        wait_for_completion=AsyncMock(
            side_effect=[
                {"results": [{"url": "https://example.com/result-one.png"}]},
                {"results": [{"url": "https://example.com/result-two.png"}]},
            ]
        ),
        close=AsyncMock(),
    )
    mock_get_rh_client.return_value = rh

    asyncio.run(main._run_image_workbench_pipeline(task_id))

    assert rh.upload_file.await_args_list[0].args == ("one.png",)
    assert rh.upload_file.await_args_list[1].args == ("two.png",)
    assert rh.submit_image_to_image.await_count == 2
    first_urls = rh.submit_image_to_image.await_args_list[0].kwargs["image_urls"]
    assert first_urls == [
        "https://example.com/input-one.png",
        "https://example.com/input-two.png",
    ]
    rh.submit_text_image.assert_not_awaited()
    mock_cleanup.assert_called_once_with("one.png", "two.png")


@patch("main._cleanup_temp")
@patch("main._get_rh_client")
def test_image_workbench_pipeline_fails_without_valid_result(
    mock_get_rh_client,
    mock_cleanup,
):
    task_id = "image_failed_1"
    _seed_task(task_id, with_references=False)
    rh = SimpleNamespace(
        upload_file=AsyncMock(),
        submit_text_image=AsyncMock(side_effect=["rh-1", "rh-2"]),
        submit_image_to_image=AsyncMock(),
        wait_for_completion=AsyncMock(
            side_effect=[
                {"results": []},
                {"results": None},
            ]
        ),
        close=AsyncMock(),
    )
    mock_get_rh_client.return_value = rh

    asyncio.run(main._run_image_workbench_pipeline(task_id))

    assert main._image_workbench_task_store[task_id]["status"] == "failed"
    assert main._image_workbench_task_store[task_id]["image_urls"] == []


@patch("main._cleanup_temp")
@patch("main._get_rh_client")
def test_image_workbench_status_never_exposes_provider_name(
    mock_get_rh_client,
    mock_cleanup,
):
    task_id = "image_provider_failure"
    _seed_task(task_id, with_references=False)
    rh = SimpleNamespace(
        upload_file=AsyncMock(),
        submit_text_image=AsyncMock(
            side_effect=main.RunningHubError(
                "RunningHub 服务异常，请前往 RunningHub 控制台检查"
            )
        ),
        submit_image_to_image=AsyncMock(),
        wait_for_completion=AsyncMock(),
        close=AsyncMock(),
    )
    mock_get_rh_client.return_value = rh

    asyncio.run(main._run_image_workbench_pipeline(task_id))

    stored = main._image_workbench_task_store[task_id]
    assert stored["status"] == "failed"
    assert "RunningHub" not in stored["error"]
    assert stored["error"] == "创作服务暂时繁忙，请稍后重试。"

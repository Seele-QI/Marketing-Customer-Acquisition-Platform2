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
from lib.runninghub_client import RunningHubError  # noqa: E402


client = TestClient(main.app)


@pytest.fixture(autouse=True)
def clear_poster_state():
    main._poster_task_store.clear()
    main._poster_pipeline_tasks.clear()
    yield
    main._poster_task_store.clear()
    main._poster_pipeline_tasks.clear()


@patch("main.asyncio.create_task")
def test_poster_submit_returns_isolated_task_id(mock_create_task):
    def fake_create_task(coro):
        coro.close()
        return object()

    mock_create_task.side_effect = fake_create_task
    response = client.post(
        "/api/poster/generate",
        json={
            "prompt": "一张新品首发商业海报",
            "aspect_ratio": "9:25",
            "resolution": "2k",
            "count": 2,
        },
    )

    assert response.status_code == 200, response.text
    task_id = response.json()["poster_task_id"]
    assert task_id.startswith("poster_")
    assert task_id in main._poster_task_store
    assert main._poster_task_store[task_id]["aspect_ratio"] == "9:25"


@pytest.mark.parametrize(
    ("payload", "detail"),
    [
        ({"prompt": "", "aspect_ratio": "3:4"}, "缺少提示词"),
        ({"prompt": "海报", "aspect_ratio": "7:11"}, "不支持的海报比例"),
        ({"prompt": "海报", "aspect_ratio": "3:4", "resolution": "4k"}, "不支持的分辨率"),
        ({"prompt": "海报", "aspect_ratio": "3:4", "count": 1}, "固定生成 2 张"),
    ],
)
def test_poster_submit_rejects_invalid_contract(payload, detail):
    response = client.post("/api/poster/generate", json=payload)
    assert response.status_code == 400
    assert detail in response.text


def test_poster_status_returns_cached_results():
    main._poster_task_store["poster_status_1"] = {
        "poster_task_id": "poster_status_1",
        "status": "success",
        "image_urls": ["/static/posters/poster_status_1-1.png"],
        "warning": "",
        "error": "",
        "stage_label": "海报生成完成",
        "aspect_ratio": "25:9",
    }

    response = client.get("/api/poster/status?posterTaskId=poster_status_1")
    assert response.status_code == 200
    assert response.json()["image_urls"] == ["/static/posters/poster_status_1-1.png"]
    assert response.json()["aspect_ratio"] == "25:9"


def _seed_running_task(task_id: str = "poster_pipeline_1"):
    main._poster_task_store[task_id] = {
        "poster_task_id": task_id,
        "status": "queued",
        "image_urls": [],
        "warning": "",
        "error": "",
        "stage_label": "排队中",
        "prompt": "测试海报",
        "aspect_ratio": "3:4",
        "resolution": "2k",
        "count": 2,
    }
    return task_id


@patch("main.download_to_path", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_poster_pipeline_keeps_two_successful_candidates(mock_get_rh_client, mock_download):
    task_id = _seed_running_task()
    rh = SimpleNamespace(
        submit_text_image=AsyncMock(side_effect=["rh-1", "rh-2"]),
        wait_for_image_completion=AsyncMock(
            side_effect=[
                {"results": [{"url": "https://example.com/one.png"}]},
                {"results": [{"url": "https://example.com/two.png"}]},
            ]
        ),
        close=AsyncMock(),
    )
    mock_get_rh_client.return_value = rh

    asyncio.run(main._run_poster_pipeline(task_id))

    stored = main._poster_task_store[task_id]
    assert stored["status"] == "success"
    assert stored["image_urls"] == [
        f"/static/posters/{task_id}-1.png",
        f"/static/posters/{task_id}-2.png",
    ]
    assert stored["warning"] == ""
    assert mock_download.await_count == 2
    rh.close.assert_awaited_once()


@patch("main.download_to_path", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_poster_pipeline_preserves_partial_success(mock_get_rh_client, mock_download):
    task_id = _seed_running_task("poster_partial_1")
    rh = SimpleNamespace(
        submit_text_image=AsyncMock(side_effect=["rh-1", "rh-2"]),
        wait_for_image_completion=AsyncMock(
            side_effect=[
                {"results": [{"url": "https://example.com/one.png"}]},
                RunningHubError("候选图生成失败"),
            ]
        ),
        close=AsyncMock(),
    )
    mock_get_rh_client.return_value = rh

    asyncio.run(main._run_poster_pipeline(task_id))

    stored = main._poster_task_store[task_id]
    assert stored["status"] == "success"
    assert stored["image_urls"] == [f"/static/posters/{task_id}-1.png"]
    assert "仅生成 1 张" in stored["warning"]
    rh.close.assert_awaited_once()


@patch("main._get_rh_client")
def test_poster_pipeline_fails_when_all_candidates_fail(mock_get_rh_client):
    task_id = _seed_running_task("poster_failed_1")
    rh = SimpleNamespace(
        submit_text_image=AsyncMock(side_effect=["rh-1", "rh-2"]),
        wait_for_image_completion=AsyncMock(
            side_effect=[
                RunningHubError("候选图一失败"),
                RunningHubError("候选图二失败"),
            ]
        ),
        close=AsyncMock(),
    )
    mock_get_rh_client.return_value = rh

    asyncio.run(main._run_poster_pipeline(task_id))

    stored = main._poster_task_store[task_id]
    assert stored["status"] == "failed"
    assert "候选图" in stored["error"]
    rh.close.assert_awaited_once()

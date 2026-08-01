import asyncio
import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt"
os.environ["RUNNINGHUB_API_KEY"] = "test-video-key"
os.environ["RUNNINGHUB_IMAGE_API_KEY"] = "test-overseas-image-key"
os.environ["RUNNINGHUB_IMAGE_BASE_URL"] = "https://www.runninghub.ai/openapi/v2"

import main  # noqa: E402


client = TestClient(main.app)


@pytest.fixture(autouse=True)
def clear_state():
    main._article_illustration_task_store.clear()
    main._article_illustration_pipeline_tasks.clear()
    main._article_illustration_request_index.clear()
    yield
    main._article_illustration_task_store.clear()
    main._article_illustration_pipeline_tasks.clear()
    main._article_illustration_request_index.clear()


def payload():
    return {
        "user_id": 7,
        "project_id": "project-a",
        "article_id": "article-a",
        "items": [
            {
                "illustration_id": "ill-one",
                "anchor_heading": "风险识别",
                "anchor_occurrence": 1,
                "alt": "风险识别示意图",
                "prompt": "企业财税风险识别编辑插图",
                "aspect_ratio": "16:9",
                "resolution": "1k",
            },
            {
                "illustration_id": "ill-two",
                "anchor_heading": "处理步骤",
                "anchor_occurrence": 1,
                "alt": "处理步骤示意图",
                "prompt": "企业财税处理步骤编辑插图",
                "aspect_ratio": "16:9",
                "resolution": "1k",
            },
        ],
    }


@patch("main.asyncio.create_task")
def test_submit_validates_and_deduplicates_scoped_request(mock_create_task):
    def fake_create_task(coro):
        coro.close()
        return object()

    mock_create_task.side_effect = fake_create_task
    first = client.post("/api/geo/article-illustrations/generate", json=payload())
    second = client.post("/api/geo/article-illustrations/generate", json=payload())

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["task_id"] == second.json()["task_id"]
    assert mock_create_task.call_count == 1


def test_status_requires_exact_user_project_article_scope():
    main._article_illustration_task_store["task-1"] = {
        "task_id": "task-1",
        "user_id": 7,
        "project_id": "project-a",
        "article_id": "article-a",
        "status": "running",
        "items": [],
        "warning": "",
        "error": "",
    }
    response = client.get(
        "/api/geo/article-illustrations/status",
        params={
            "taskId": "task-1",
            "userId": 8,
            "projectId": "project-a",
            "articleId": "article-a",
        },
    )
    assert response.status_code == 404


@patch("main.download_to_path", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_pipeline_uses_overseas_image_to_image_with_neutral_reference(
    mock_get_rh_client,
    mock_download,
):
    body = payload()
    task_id = "task-image-to-image"
    main._article_illustration_task_store[task_id] = main._new_article_illustration_record(
        task_id, main.ArticleIllustrationGenerateRequest(**body)
    )
    rh = SimpleNamespace(
        submit_image_to_image=AsyncMock(side_effect=["rh-one", "rh-two"]),
        submit_text_image=AsyncMock(),
        wait_for_image_completion=AsyncMock(
            side_effect=[
                {"results": [{"url": "https://example.com/one.png"}]},
                {"results": [{"url": "https://example.com/two.png"}]},
            ]
        ),
        close=AsyncMock(),
    )
    mock_get_rh_client.return_value = rh

    asyncio.run(main._run_article_illustration_pipeline(task_id))

    stored = main._article_illustration_task_store[task_id]
    assert stored["status"] == "success"
    assert rh.submit_image_to_image.await_count == 2
    rh.submit_text_image.assert_not_awaited()
    for call in rh.submit_image_to_image.await_args_list:
        assert call.kwargs["image_urls"][0].startswith("data:image/png;base64,")
    mock_get_rh_client.assert_called_once_with(image=True)


@patch("main.download_to_path", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_pipeline_retries_one_item_without_cancelling_siblings(
    mock_get_rh_client,
    mock_download,
):
    body = payload()
    task_id = "task-retry"
    main._article_illustration_task_store[task_id] = main._new_article_illustration_record(
        task_id, main.ArticleIllustrationGenerateRequest(**body)
    )
    rh = SimpleNamespace(
        submit_image_to_image=AsyncMock(
            side_effect=[
                main.RunningHubError("temporary"),
                "rh-two",
                "rh-one-retry",
            ]
        ),
        submit_text_image=AsyncMock(),
        wait_for_image_completion=AsyncMock(
            side_effect=[
                {"results": [{"url": "https://example.com/two.png"}]},
                {"results": [{"url": "https://example.com/one.png"}]},
            ]
        ),
        close=AsyncMock(),
    )
    mock_get_rh_client.return_value = rh

    with patch("main.asyncio.sleep", new_callable=AsyncMock):
        asyncio.run(main._run_article_illustration_pipeline(task_id))

    stored = main._article_illustration_task_store[task_id]
    assert stored["status"] == "success"
    assert rh.submit_image_to_image.await_count == 3
    assert all(item["status"] == "success" for item in stored["items"])


def test_retry_rejects_successful_or_foreign_item_ids():
    main._article_illustration_task_store["task-1"] = {
        "task_id": "task-1",
        "user_id": 7,
        "project_id": "project-a",
        "article_id": "article-a",
        "status": "success",
        "items": [
            {
                "illustration_id": "ill-one",
                "status": "success",
                "image_url": "/static/geo-article-illustrations/project-a/article-a/ill-one.png",
            },
            {"illustration_id": "ill-two", "status": "failed"},
        ],
        "warning": "",
        "error": "",
    }
    response = client.post(
        "/api/geo/article-illustrations/retry",
        json={
            "user_id": 7,
            "project_id": "project-a",
            "article_id": "article-a",
            "task_id": "task-1",
            "illustration_ids": ["ill-one", "foreign"],
        },
    )
    assert response.status_code == 400

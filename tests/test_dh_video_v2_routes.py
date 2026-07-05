"""dh-video-v2 路由烟测（不调用真实 Seedance）"""

from __future__ import annotations

import base64
import os
import time
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tests.conftest import setup_test_db

setup_test_db()
os.environ.setdefault("EMAIL_HASH_SALT", "test-salt")

TINY_PNG_B64 = (
    "data:image/png;base64,"
    + base64.b64encode(
        base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
        )
    ).decode()
)


@pytest.fixture
def client():
    from main import app

    return TestClient(app)


@pytest.fixture
def auth_headers():
    from tests.conftest import setup_test_db
    from lib import auth as auth_mod
    from lib.db import transaction

    setup_test_db()
    token = os.urandom(4).hex()
    email = f"dhv2_{token}@test.local"
    uid = auth_mod.get_or_create_user_by_hash(
        auth_mod.hash_email(email),
        f"d{token[:2]}**@test.local",
    )
    with transaction() as conn:
        conn.execute(
            "UPDATE credit_accounts SET balance = balance + 10000 WHERE user_id = ?",
            (uid,),
        )
    sid = auth_mod.create_session(uid, "pytest", "127.0.0.1")
    return {"Cookie": f"session_id={sid}"}


def test_plan_script_fastapi_deprecated(client, auth_headers):
    r = client.post(
        "/api/dh-video-v2/plan-script",
        headers=auth_headers,
        json={
            "script": "大家好，欢迎收看本期节目。",
            "creative_idea": "专业口播",
            "image_count": 1,
            "has_audio_ref": False,
        },
    )
    assert r.status_code == 501, r.text


def test_submit_skips_empty_dialogue_segments(client, auth_headers):
    fake_final = os.path.join(os.environ.get("TEMP", "/tmp"), "dhv2_test_final2.mp4")
    with open(fake_final, "wb") as f:
        f.write(b"\x00" * 20_000)

    captured: dict = {}

    async def _fake_pipeline(**kwargs):
        captured["segments"] = kwargs.get("segments")
        on_progress = kwargs.get("on_progress")
        on_segment_update = kwargs.get("on_segment_update")
        if on_segment_update:
            on_segment_update(0, "completed", {"local_path": fake_final})
        if on_progress:
            on_progress(1, 1, 0)
        return fake_final

    with patch(
        "lib.dh_video_v2_service.run_multi_segment_pipeline",
        new=AsyncMock(side_effect=_fake_pipeline),
    ):
        r = client.post(
            "/api/dh-video-v2/submit",
            headers=auth_headers,
            json={
                "provider": "seedance",
                "images_base64": [TINY_PNG_B64],
                "segments": [
                    {
                        "index": 0,
                        "dialogue": "有效口播",
                        "video_prompt": "@图1 口播",
                    },
                    {
                        "index": 1,
                        "dialogue": "",
                        "video_prompt": "应被跳过",
                    },
                ],
            },
        )
    assert r.status_code == 200, r.text
    assert captured.get("segments") is not None
    assert len(captured["segments"]) == 1
    assert captured["segments"][0]["dialogue"] == "有效口播"


def test_submit_queues_task(client, auth_headers):
    fake_final = os.path.join(os.environ.get("TEMP", "/tmp"), "dhv2_test_final.mp4")
    with open(fake_final, "wb") as f:
        f.write(b"\x00" * 20_000)

    async def _fake_pipeline(**kwargs):
        on_progress = kwargs.get("on_progress")
        on_segment_update = kwargs.get("on_segment_update")
        if on_segment_update:
            on_segment_update(0, "completed", {"local_path": fake_final})
        if on_progress:
            on_progress(1, 1, 0)
        return fake_final

    with patch(
        "lib.dh_video_v2_service.run_multi_segment_pipeline",
        new=AsyncMock(side_effect=_fake_pipeline),
    ):
        r = client.post(
            "/api/dh-video-v2/submit",
            headers=auth_headers,
            json={
                "provider": "seedance",
                "images_base64": [TINY_PNG_B64],
                "segments": [
                    {
                        "index": 0,
                        "dialogue": "测试口播",
                        "video_prompt": "@图1 当前图片为视频固定首帧 口播测试",
                    }
                ],
            },
        )
    assert r.status_code == 200, r.text
    task_id = r.json()["task_id"]
    assert task_id.startswith("dhv2_")

    body = {}
    for _ in range(40):
        s = client.get(f"/api/dh-video-v2/status?taskId={task_id}", headers=auth_headers)
        assert s.status_code == 200
        body = s.json()
        if body["status"] in ("completed", "failed", "partial_failed"):
            break
        time.sleep(0.1)

    assert body["status"] == "completed"
    assert body.get("video_url") or body.get("result_url")
    assert isinstance(body.get("segments"), list)
    assert len(body["segments"]) == 1


def test_status_includes_segments_on_partial_failed(client, auth_headers):
    fake_seg = os.path.join(os.environ.get("TEMP", "/tmp"), "dhv2_seg0.mp4")
    with open(fake_seg, "wb") as f:
        f.write(b"\x00" * 20_000)

    async def _fake_pipeline(**kwargs):
        on_segment_update = kwargs.get("on_segment_update")
        if on_segment_update:
            on_segment_update(0, "completed", {"local_path": fake_seg})
            on_segment_update(1, "timeout", {"error": "Seedance 任务超时"})
        return None

    with patch(
        "lib.dh_video_v2_service.run_multi_segment_pipeline",
        new=AsyncMock(side_effect=_fake_pipeline),
    ):
        r = client.post(
            "/api/dh-video-v2/submit",
            headers=auth_headers,
            json={
                "provider": "seedance",
                "images_base64": [TINY_PNG_B64],
                "segments": [
                    {"index": 0, "dialogue": "第一段", "video_prompt": "@图1 段1"},
                    {"index": 1, "dialogue": "第二段", "video_prompt": "@图1 段2"},
                ],
            },
        )
    task_id = r.json()["task_id"]

    body = {}
    for _ in range(40):
        s = client.get(f"/api/dh-video-v2/status?taskId={task_id}", headers=auth_headers)
        body = s.json()
        if body["status"] == "partial_failed":
            break
        time.sleep(0.1)

    assert body["status"] == "partial_failed"
    segs = body.get("segments") or []
    assert len(segs) == 2
    assert segs[0]["status"] == "completed"
    assert segs[1]["status"] == "timeout"
    assert not body.get("video_url")


@pytest.fixture
def auth_user_id(auth_headers):
    from lib.db import connect

    sid = auth_headers["Cookie"].split("session_id=", 1)[1]
    conn = connect()
    row = conn.execute("SELECT user_id FROM sessions WHERE id = ?", (sid,)).fetchone()
    assert row is not None
    return int(row["user_id"])


def test_retry_segment_endpoint(client, auth_headers, auth_user_id):
    from routes import dh_video_v2_routes as routes_mod

    task_id = "dhv2_test_retry"
    routes_mod._dh_video_v2_task_store[task_id] = {
        "task_id": task_id,
        "user_id": auth_user_id,
        "status": "partial_failed",
        "segment_count": 1,
        "segments": [
            {
                "index": 0,
                "status": "timeout",
                "dialogue": "测试",
                "video_prompt": "@图1 测试",
                "error": "超时",
            }
        ],
        "submit_meta": {"aspect_ratio": "9:16", "client_task_id": task_id},
    }

    with patch(
        "routes.dh_video_v2_routes._run_retry_segment",
        new=AsyncMock(),
    ):
        r = client.post(
            "/api/dh-video-v2/retry-segment",
            headers=auth_headers,
            json={"taskId": task_id, "segmentIndex": 0},
        )

    assert r.status_code == 200, r.text
    assert r.json().get("ok") is True

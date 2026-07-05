"""dh-video-v2 路由烟测（不调用真实 Seedance）"""

from __future__ import annotations

import base64
import os
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

    setup_test_db()
    token = os.urandom(4).hex()
    email = f"dhv2_{token}@test.local"
    uid = auth_mod.get_or_create_user_by_hash(
        auth_mod.hash_email(email),
        f"d{token[:2]}**@test.local",
    )
    sid = auth_mod.create_session(uid, "pytest", "127.0.0.1")
    return {"Cookie": f"session_id={sid}"}


def test_plan_script_local_fallback(client, auth_headers):
    r = client.post(
        "/api/dh-video-v2/plan-script",
        headers=auth_headers,
        json={
            "script": "大家好，欢迎收看本期节目。",
            "creative_idea": "专业口播",
            "image_count": 1,
            "has_audio_ref": False,
            "dialogue_slices": ["大家好，欢迎收看本期节目。"],
            "plan_duration": 15,
            "segment_count": 1,
        },
    )
    assert r.status_code == 200, r.text
    plan = r.json()["plan"]
    assert plan["segment_count"] == 1
    assert len(plan["segments"]) == 1
    assert plan["segments"][0]["video_prompt"]


def test_submit_queues_task(client, auth_headers):
    fake_final = os.path.join(os.environ.get("TEMP", "/tmp"), "dhv2_test_final.mp4")
    with open(fake_final, "wb") as f:
        f.write(b"\x00" * 20_000)

    async def _fake_pipeline(**kwargs):
        on_progress = kwargs.get("on_progress")
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

    import time

    for _ in range(40):
        s = client.get(f"/api/dh-video-v2/status?taskId={task_id}", headers=auth_headers)
        assert s.status_code == 200
        body = s.json()
        if body["status"] in ("completed", "failed"):
            break
        time.sleep(0.1)

    assert body["status"] == "completed"
    assert body.get("video_url") or body.get("result_url")

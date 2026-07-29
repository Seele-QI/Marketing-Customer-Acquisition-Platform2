from __future__ import annotations

import base64
import os
import time
import asyncio
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from tests.conftest import setup_test_db

setup_test_db()
os.environ.setdefault("EMAIL_HASH_SALT", "test-salt")


@pytest.fixture
def client():
    from main import app

    # main loads .env during import; force the test back to local SQLite auth.
    os.environ["CLOUD_API_URL"] = ""
    return TestClient(app)


def _auth_user(label: str, *, balance: int = 2000) -> tuple[dict[str, str], int]:
    from lib import auth as auth_mod
    from lib.db import transaction

    token = os.urandom(4).hex()
    uid = auth_mod.get_or_create_user_by_hash(
        auth_mod.hash_email(f"economy_{label}_{token}@test.local"),
        f"e{token[:2]}**@test.local",
    )
    with transaction() as conn:
        conn.execute("UPDATE credit_accounts SET balance = ? WHERE user_id = ?", (balance, uid))
    sid = auth_mod.create_session(uid, "pytest", "127.0.0.1")
    return {"Cookie": f"session_id={sid}"}, uid


def _payload() -> dict[str, str]:
    return {
        "image_base64": base64.b64encode(b"fake-image").decode(),
        "audio_base64": base64.b64encode(b"fake-audio").decode(),
        "script": "这是一段经济版数字人口播文案",
        "motion_prompt": "他自然地说话，偶尔使用克制的手势。",
    }


def test_submit_returns_local_task_immediately_and_status_is_owner_only(client):
    from routes import dh_video_economy_routes as routes_mod

    owner_headers, _ = _auth_user("owner")
    with patch.object(routes_mod, "_pipeline", new=AsyncMock()):
        response = client.post("/api/dh-video-economy/submit", headers=owner_headers, json=_payload())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "queued"
    assert body["task_id"].startswith("dhe_")

    own_status = client.get(
        f"/api/dh-video-economy/status?taskId={body['task_id']}", headers=owner_headers
    )
    assert own_status.status_code == 200
    assert own_status.json()["status"] == "queued"
    other_headers, _ = _auth_user("other")
    denied = client.get(
        f"/api/dh-video-economy/status?taskId={body['task_id']}", headers=other_headers
    )
    assert denied.status_code == 403


def test_retry_only_failed_segment_and_charges_each_attempt(client):
    from lib.db import connect
    from routes import dh_video_economy_routes as routes_mod

    headers, uid = _auth_user("retry", balance=1000)
    task_id = f"dhe_retry_{int(time.time() * 1000)}"
    routes_mod._tasks[task_id] = {
        "task_id": task_id,
        "user_id": uid,
        "status": "partial_failed",
        "segments": [{"index": 0, "status": "timeout", "retry_count": 0}],
    }
    conn = connect()
    before = int(conn.execute("SELECT balance FROM credit_accounts WHERE user_id = ?", (uid,)).fetchone()["balance"])
    conn.close()

    with patch.object(routes_mod, "_retry_segment", new=AsyncMock()):
        response = client.post(
            "/api/dh-video-economy/retry-segment",
            headers=headers,
            json={"taskId": task_id, "segmentIndex": 0},
        )
    assert response.status_code == 200, response.text
    conn = connect()
    after = int(conn.execute("SELECT balance FROM credit_accounts WHERE user_id = ?", (uid,)).fetchone()["balance"])
    conn.close()
    assert after == before - 250
    assert routes_mod._tasks[task_id]["segments"][0]["retry_count"] == 1


def test_cancel_marks_local_task_without_claiming_external_cancel(client):
    from routes import dh_video_economy_routes as routes_mod

    headers, uid = _auth_user("cancel")
    task_id = f"dhe_cancel_{int(time.time() * 1000)}"
    routes_mod._tasks[task_id] = {
        "task_id": task_id,
        "user_id": uid,
        "status": "processing",
        "segments": [],
        "cancel_requested": False,
    }
    response = client.post(
        "/api/dh-video-economy/cancel",
        headers=headers,
        json={"taskId": task_id},
    )
    assert response.status_code == 200
    task = routes_mod._tasks[task_id]
    assert task["status"] == "cancelled"
    assert "RunningHub" in task["error"]


def test_segment_submit_failure_is_recorded_without_aborting_other_workers(tmp_path):
    from routes import dh_video_economy_routes as routes_mod

    task_id = "dhe_worker_failure"
    routes_mod._tasks[task_id] = {
        "task_id": task_id,
        "stage": "segments",
        "segment_count": 1,
        "segments": [{"index": 0, "status": "pending"}],
        "image_remote_url": "https://example.com/avatar.png",
        "motion_prompt": "自然表达",
        "work_dir": str(tmp_path),
    }

    class FailingClient:
        async def upload_file(self, _path):
            raise RuntimeError("upload failed")

    result = asyncio.run(
        routes_mod._generate_segment(task_id, 0, str(tmp_path / "segment_000.wav"), FailingClient())
    )
    assert result is False
    assert routes_mod._tasks[task_id]["segments"][0]["status"] == "failed"
    assert "upload failed" in routes_mod._tasks[task_id]["segments"][0]["error"]


def test_clone_can_complete_but_insufficient_segment_balance_submits_no_video(tmp_path):
    from routes import dh_video_economy_routes as routes_mod

    _, uid = _auth_user("insufficient", balance=10)
    task_id = "dhe_insufficient_segments"
    work_dir = tmp_path / "work"
    work_dir.mkdir()
    audio_path = work_dir / "reference.mp3"
    image_path = work_dir / "avatar.png"
    audio_path.write_bytes(b"audio")
    image_path.write_bytes(b"image")
    routes_mod._tasks[task_id] = {
        "task_id": task_id,
        "user_id": uid,
        "status": "queued",
        "stage": "queued",
        "script": "足以产生两段的口播文案",
        "motion_prompt": "自然表达",
        "audio_path": str(audio_path),
        "image_path": str(image_path),
        "work_dir": str(work_dir),
        "final_dir": str(tmp_path / "final"),
        "segments": [],
        "cancel_requested": False,
    }

    class FakeRh:
        async def upload_file(self, path):
            return f"https://example.com/{os.path.basename(path)}"

        async def submit_economy_audio_clone(self, _audio, _script):
            return "clone-task"

        async def wait_for_completion(self, _task_id, **_kwargs):
            return {"results": [{"url": "https://example.com/clone.mp3", "outputType": "audio"}]}

        async def close(self):
            return None

    fake_generate = AsyncMock(return_value=True)
    with (
        patch("main._get_rh_client", return_value=FakeRh()),
        patch("lib.video_postprocess.probe_audio_duration", side_effect=[10.0, 36.0]),
        patch("lib.safe_http.download_to_path", new=AsyncMock(return_value=1024)),
        patch(
            "lib.video_audio_split.split_audio_segments",
            return_value=[(0, str(work_dir / "segment_000.wav")), (1, str(work_dir / "segment_001.wav"))],
        ),
        patch.object(routes_mod, "_generate_segment", new=fake_generate),
    ):
        asyncio.run(routes_mod._pipeline(task_id))

    task = routes_mod._tasks[task_id]
    assert task["status"] == "insufficient_credit"
    assert task["segment_count"] == 2
    assert fake_generate.await_count == 0


def test_segment_billing_configuration_error_is_not_mislabeled_as_insufficient_credit(tmp_path):
    from lib.credit import CreditError
    from routes import dh_video_economy_routes as routes_mod

    _, uid = _auth_user("billing_config", balance=1000)
    task_id = "dhe_billing_config_error"
    work_dir = tmp_path / "work"
    work_dir.mkdir()
    audio_path = work_dir / "reference.mp3"
    image_path = work_dir / "avatar.png"
    audio_path.write_bytes(b"audio")
    image_path.write_bytes(b"image")
    routes_mod._tasks[task_id] = {
        "task_id": task_id,
        "user_id": uid,
        "status": "queued",
        "stage": "queued",
        "script": "足以产生两个视频分段的口播文案",
        "motion_prompt": "自然表达",
        "audio_path": str(audio_path),
        "image_path": str(image_path),
        "work_dir": str(work_dir),
        "final_dir": str(tmp_path / "final"),
        "segments": [],
        "cancel_requested": False,
    }

    class FakeRh:
        async def upload_file(self, path):
            return f"https://example.com/{os.path.basename(path)}"

        async def submit_economy_audio_clone(self, _audio, _script):
            return "clone-task"

        async def wait_for_completion(self, _task_id, **_kwargs):
            return {"results": [{"url": "https://example.com/clone.mp3", "outputType": "audio"}]}

        async def close(self):
            return None

    def fake_consume_billing_event(*, billing_key, **_kwargs):
        if billing_key == "video.dh_economy_segment":
            raise CreditError("CLOUD_CONSUME_FAILED", "不支持的 billing_key", status=400)
        return {"balance": 990}

    fake_generate = AsyncMock(return_value=True)
    with (
        patch("main._get_rh_client", return_value=FakeRh()),
        patch("lib.video_postprocess.probe_audio_duration", side_effect=[10.0, 36.0]),
        patch("lib.safe_http.download_to_path", new=AsyncMock(return_value=1024)),
        patch(
            "lib.video_audio_split.split_audio_segments",
            return_value=[(0, str(work_dir / "segment_000.wav")), (1, str(work_dir / "segment_001.wav"))],
        ),
        patch("lib.api_auth.consume_voice_clone", return_value={"balance": 990}),
        patch("lib.api_auth.consume_billing_event", side_effect=fake_consume_billing_event),
        patch.object(routes_mod, "_generate_segment", new=fake_generate),
    ):
        asyncio.run(routes_mod._pipeline(task_id))

    task = routes_mod._tasks[task_id]
    assert task["status"] == "failed"
    assert task["stage"] == "billing"
    assert task["stage_label"] == "视频计费失败，未提交任何视频分段"
    assert task["segment_count"] == 2
    assert fake_generate.await_count == 0


def test_pipeline_charges_clone_then_all_segments_once(tmp_path):
    from lib.db import connect
    from routes import dh_video_economy_routes as routes_mod

    _, uid = _auth_user("staged_billing", balance=1000)
    task_id = "dhe_staged_billing"
    work_dir = tmp_path / "work"
    work_dir.mkdir()
    audio_path = work_dir / "reference.mp3"
    image_path = work_dir / "avatar.png"
    audio_path.write_bytes(b"audio")
    image_path.write_bytes(b"image")
    routes_mod._tasks[task_id] = {
        "task_id": task_id,
        "user_id": uid,
        "status": "queued",
        "stage": "queued",
        "script": "生成两段视频",
        "motion_prompt": "自然表达",
        "audio_path": str(audio_path),
        "image_path": str(image_path),
        "work_dir": str(work_dir),
        "final_dir": str(tmp_path / "final"),
        "segments": [],
        "cancel_requested": False,
    }

    class FakeRh:
        async def upload_file(self, path):
            return f"https://example.com/{os.path.basename(path)}"

        async def submit_economy_audio_clone(self, _audio, _script):
            return "clone-task"

        async def wait_for_completion(self, _task_id, **_kwargs):
            return {"results": [{"url": "https://example.com/clone.mp3", "outputType": "audio"}]}

        async def close(self):
            return None

    async def fake_generate(tid, index, _path, _rh):
        routes_mod._update_segment(tid, index, status="completed", local_path=f"segment_{index:03d}.mp4")
        return True

    async def fake_finalize(tid):
        routes_mod._patch(tid, status="completed", progress=100)
        return True

    with (
        patch("main._get_rh_client", return_value=FakeRh()),
        patch("lib.video_postprocess.probe_audio_duration", side_effect=[10.0, 36.0, 10.0, 36.0]),
        patch("lib.safe_http.download_to_path", new=AsyncMock(return_value=1024)),
        patch(
            "lib.video_audio_split.split_audio_segments",
            return_value=[(0, str(work_dir / "segment_000.wav")), (1, str(work_dir / "segment_001.wav"))],
        ),
        patch.object(routes_mod, "_generate_segment", new=AsyncMock(side_effect=fake_generate)) as generate,
        patch.object(routes_mod, "_finalize", new=AsyncMock(side_effect=fake_finalize)) as finalize,
    ):
        asyncio.run(routes_mod._pipeline(task_id))
        asyncio.run(routes_mod._pipeline(task_id))

    conn = connect()
    balance = int(conn.execute("SELECT balance FROM credit_accounts WHERE user_id = ?", (uid,)).fetchone()["balance"])
    conn.close()
    assert balance == 490
    assert generate.await_count == 4
    assert finalize.await_count == 2

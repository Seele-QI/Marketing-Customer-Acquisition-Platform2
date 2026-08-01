import os
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

import main


def test_manual_upload_returns_publishable_video_and_thumbnail_urls(tmp_path):
    main._manual_upload_store.clear()
    with (
        patch.object(main, "MANUAL_UPLOAD_ROOT", str(tmp_path)),
        patch.object(main, "require_user", return_value=SimpleNamespace(id=42)),
        patch.object(main, "_generate_manual_upload_thumbnail", new=AsyncMock(return_value=True)),
    ):
        response = TestClient(main.app).post(
            "/api/video/manual-upload",
            files={"file": ("sample.webm", b"fake-video", "video/webm")},
        )

    assert response.status_code == 200
    payload = response.json()
    upload_id = payload["upload_id"]
    assert payload["file_url"] == f"/static/manual-uploads/{upload_id}/source.webm"
    assert payload["thumbnail_url"] == f"/static/manual-uploads/{upload_id}/thumbnail.jpg"
    assert payload["original_name"] == "sample.webm"
    assert payload["size"] == len(b"fake-video")
    assert os.path.isfile(tmp_path / upload_id / "source.webm")
    assert main._manual_upload_store[upload_id]["user_id"] == 42


def test_manual_upload_keeps_video_when_thumbnail_generation_fails(tmp_path):
    with (
        patch.object(main, "MANUAL_UPLOAD_ROOT", str(tmp_path)),
        patch.object(main, "require_user", return_value=SimpleNamespace(id=9)),
        patch.object(main, "_generate_manual_upload_thumbnail", new=AsyncMock(return_value=False)),
    ):
        response = TestClient(main.app).post(
            "/api/video/manual-upload",
            files={"file": ("sample.mp4", b"fake-video", "video/mp4")},
        )

    assert response.status_code == 200
    assert response.json()["thumbnail_url"] == ""

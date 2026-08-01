import os

from fastapi.testclient import TestClient

from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt"
os.environ["CREDIT_REGISTER_BONUS"] = "100"

import main  # noqa: E402


def test_media_download_streams_attachment(tmp_path, monkeypatch):
    generated = tmp_path / "generated"
    target = generated / "dhe_123" / "final.mp4"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"video-bytes")
    monkeypatch.setattr(main, "GENERATED_VIDEO_CACHE_ROOT", str(generated))

    response = TestClient(main.app).get(
        "/api/media/download",
        params={
            "path": "/static/video-generated/dhe_123/final.mp4",
            "filename": "economy-video.mp4",
        },
    )

    assert response.status_code == 200
    assert response.content == b"video-bytes"
    assert "attachment" in response.headers["content-disposition"]
    assert "economy-video.mp4" in response.headers["content-disposition"]


def test_media_download_rejects_traversal(tmp_path, monkeypatch):
    generated = tmp_path / "generated"
    generated.mkdir()
    monkeypatch.setattr(main, "GENERATED_VIDEO_CACHE_ROOT", str(generated))

    response = TestClient(main.app).get(
        "/api/media/download",
        params={"path": "/static/video-generated/../secret.txt"},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "INVALID_MEDIA_PATH"

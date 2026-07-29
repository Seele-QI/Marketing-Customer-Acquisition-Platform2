from pathlib import Path

import pytest

from lib.publisher import video_path


def test_static_manual_upload_resolves_inside_configured_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    target = tmp_path / "video-cache" / "manual-uploads" / "demo.mp4"
    target.parent.mkdir(parents=True)
    target.write_bytes(b"video")

    resolved = video_path.resolve_local_video_path("/static/manual-uploads/demo.mp4")

    assert Path(resolved) == target.resolve()


def test_static_video_path_rejects_parent_traversal(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    outside = tmp_path / "outside.mp4"
    outside.write_bytes(b"video")

    with pytest.raises(ValueError, match="非法视频路径"):
        video_path.resolve_local_video_path("/static/manual-uploads/../../outside.mp4")


"""验证 main._ensure_path_in_trusted_root 拦截路径穿越 + ASS 注入。"""
import os
import tempfile

import pytest
from fastapi import HTTPException

from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt"
os.environ["CREDIT_REGISTER_BONUS"] = "100"

import main  # noqa: E402


def _make_real_file_inside(root: str, name: str = "ok.mp4") -> str:
    path = os.path.join(root, name)
    with open(path, "wb") as f:
        f.write(b"\x00")
    return path


@pytest.fixture
def trusted_root(monkeypatch):
    """临时把 _TRUSTED_MEDIA_ROOTS 指向一个干净的临时目录，测试结束自动复原。"""
    with tempfile.TemporaryDirectory() as tmp:
        real = os.path.realpath(tmp)
        monkeypatch.setattr(main, "_TRUSTED_MEDIA_ROOTS", (real,))
        yield real


def test_accepts_path_inside_post_process_root(trusted_root):
    f = _make_real_file_inside(trusted_root)
    out = main._ensure_path_in_trusted_root(f, field="video_path")
    assert out.startswith(trusted_root)


def test_rejects_outside_trusted_root(trusted_root):
    with tempfile.TemporaryDirectory() as outside:
        outside_file = _make_real_file_inside(outside, "evil.mp4")
        with pytest.raises(HTTPException) as exc:
            main._ensure_path_in_trusted_root(outside_file, field="video_path")
        assert exc.value.status_code == 400
        assert exc.value.detail["code"] == "PATH_OUTSIDE_ALLOWED"


def test_rejects_traversal_attempt(trusted_root):
    """`../../../etc/passwd` 应被 realpath 解析后落到根外，被拒。"""
    for tricky in (
        os.path.join(trusted_root, "..", "..", "windows", "system32", "hosts"),
        "C:/Windows/System32/drivers/etc/hosts",
        "/etc/passwd",
    ):
        with pytest.raises(HTTPException) as exc:
            main._ensure_path_in_trusted_root(tricky, field="subtitle_file_path")
        assert exc.value.status_code == 400


def test_rejects_empty():
    with pytest.raises(HTTPException):
        main._ensure_path_in_trusted_root("   ", field="video_path")


def test_rejects_null_byte_and_control_chars():
    with pytest.raises(HTTPException) as exc:
        main._ensure_path_in_trusted_root("/tmp/abc\x00.mp4", field="video_path")
    assert exc.value.detail["code"] == "PATH_INVALID_CHARS"

    with pytest.raises(HTTPException):
        main._ensure_path_in_trusted_root("/tmp/abc\ndef", field="video_path")


def test_subtitle_public_url_only_for_post_process_root(monkeypatch):
    with tempfile.TemporaryDirectory() as ppr:
        monkeypatch.setattr(main, "POST_PROCESS_ROOT", ppr)
        sub = _make_real_file_inside(ppr, "abc.ass")
        url = main._to_subtitle_public_url(sub, base_url="http://x")
        assert url.endswith("/static/video-postprocess/abc.ass")
        assert url.startswith("http://x/")

        # 不在 POST_PROCESS_ROOT 内 → 返回空，避免泄露绝对路径
        with tempfile.TemporaryDirectory() as outside:
            outside_sub = _make_real_file_inside(outside, "leak.ass")
            assert main._to_subtitle_public_url(outside_sub) == ""

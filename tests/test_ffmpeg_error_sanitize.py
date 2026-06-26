"""验证 main._sanitize_ffmpeg_error 把绝对路径脱敏并截断。"""
import os

from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt"
os.environ["CREDIT_REGISTER_BONUS"] = "100"

import main  # noqa: E402


def test_redacts_windows_path():
    s = "Cannot open F:/A-项目/21-对比合并中台/zhongtai-main/data/x.mp4: Permission denied"
    out = main._sanitize_ffmpeg_error(s)
    assert "F:/A" not in out
    assert "<path>" in out


def test_redacts_posix_path():
    s = "Error opening /var/lib/ffmpeg/cache/abc.wav as input"
    out = main._sanitize_ffmpeg_error(s)
    assert "/var/lib/" not in out
    assert "<path>" in out


def test_truncates_long_message():
    raw = "ffmpeg error:" + "X" * 5000
    out = main._sanitize_ffmpeg_error(raw, max_len=200)
    assert len(out) <= 210
    assert out.startswith("...")


def test_empty_returns_empty():
    assert main._sanitize_ffmpeg_error("") == ""
    assert main._sanitize_ffmpeg_error(None) == ""  # type: ignore[arg-type]


def test_collapses_whitespace():
    raw = "ffmpeg\n\n  error:   bad   codec\t\t"
    out = main._sanitize_ffmpeg_error(raw)
    assert "  " not in out
    assert "\n" not in out

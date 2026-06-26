"""验证 /api/copywriting/extract 的 URL 白名单 + 内网拦截。"""
import os

import pytest
from fastapi import HTTPException

from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt"
os.environ["CREDIT_REGISTER_BONUS"] = "100"

import main  # noqa: E402


def test_allowed_host_passes():
    assert main._validate_extract_url("https://www.douyin.com/video/123") == "https://www.douyin.com/video/123"
    assert main._validate_extract_url("https://b23.tv/abc") == "https://b23.tv/abc"


def test_rejects_unknown_host():
    with pytest.raises(HTTPException) as exc:
        main._validate_extract_url("https://evil.example.com/malicious")
    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "URL_HOST_NOT_ALLOWED"


def test_rejects_non_http_scheme():
    for url in ("file:///etc/passwd", "gopher://x.y", "ftp://abc.com"):
        with pytest.raises(HTTPException) as exc:
            main._validate_extract_url(url)
        assert exc.value.status_code == 400
        assert exc.value.detail["code"] in ("BAD_URL_SCHEME", "BAD_URL_HOST")


def test_rejects_bare_ip():
    with pytest.raises(HTTPException) as exc:
        main._validate_extract_url("http://127.0.0.1/admin")
    assert exc.value.status_code == 400
    assert exc.value.detail["code"] in ("URL_PRIVATE_IP", "URL_BARE_IP")


def test_rejects_internal_ip():
    for ip in ("http://10.0.0.1/", "http://192.168.1.1/", "http://169.254.169.254/latest/meta-data/"):
        with pytest.raises(HTTPException) as exc:
            main._validate_extract_url(ip)
        assert exc.value.status_code == 400


def test_rejects_empty_url():
    with pytest.raises(HTTPException) as exc:
        main._validate_extract_url("   ")
    assert exc.value.status_code == 400

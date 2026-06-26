"""验证 lib.safe_http 的 SSRF + 大小拦截。"""
import asyncio
import os
import tempfile

import httpx
import pytest

from lib.safe_http import SafeHttpError, download_to_path, _check_target_host


def test_check_target_host_accepts_public_https():
    assert _check_target_host("https://cdn.example.com/x.mp4") == "https://cdn.example.com/x.mp4"


def test_check_target_host_rejects_loopback_v4():
    with pytest.raises(SafeHttpError):
        _check_target_host("http://127.0.0.1/x")


def test_check_target_host_rejects_loopback_v6():
    with pytest.raises(SafeHttpError):
        _check_target_host("http://[::1]/x")


def test_check_target_host_rejects_private_ranges():
    for url in (
        "http://10.0.0.5/x",
        "http://192.168.1.1/x",
        "http://172.16.0.1/x",
        "http://169.254.169.254/latest/meta-data/",
        "http://0.0.0.0/x",
    ):
        with pytest.raises(SafeHttpError):
            _check_target_host(url)


def test_check_target_host_rejects_localhost_name():
    with pytest.raises(SafeHttpError):
        _check_target_host("http://localhost:8000/x")
    with pytest.raises(SafeHttpError):
        _check_target_host("http://service.internal/x")


def test_check_target_host_rejects_non_http():
    for url in ("file:///etc/passwd", "ftp://x.y/", "gopher://x"):
        with pytest.raises(SafeHttpError):
            _check_target_host(url)


def test_download_aborts_on_oversize_response(monkeypatch):
    """模拟远端返回 >max_bytes 的数据，下载应中断且不留临时文件。"""

    class _FakeStreamResponse:
        def __init__(self):
            self.status_code = 200
            self.headers = {}
            self.url = httpx.URL("https://cdn.example.com/big.bin")

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def aiter_bytes(self, chunk_size=64 * 1024):
            yield b"x" * (chunk_size)
            yield b"y" * (chunk_size)
            yield b"z" * (chunk_size)

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        def stream(self, method, url):
            return _FakeStreamResponse()

    monkeypatch.setattr("lib.safe_http.httpx.AsyncClient", _FakeClient)

    async def _run():
        with tempfile.TemporaryDirectory() as d:
            dest = os.path.join(d, "out.bin")
            with pytest.raises(SafeHttpError):
                await download_to_path(
                    "https://cdn.example.com/big.bin",
                    dest,
                    max_bytes=64 * 1024,  # 小于上面 yield 的总量
                    timeout=5.0,
                )
            assert not os.path.exists(dest)
            assert not os.path.exists(dest + ".download")

    asyncio.run(_run())


def test_download_writes_file_when_under_limit(monkeypatch):
    payload = b"hello world" * 100

    class _FakeStreamResponse:
        def __init__(self):
            self.status_code = 200
            self.headers = {"content-length": str(len(payload))}
            self.url = httpx.URL("https://cdn.example.com/ok.bin")

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def aiter_bytes(self, chunk_size=64 * 1024):
            yield payload

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        def stream(self, method, url):
            return _FakeStreamResponse()

    monkeypatch.setattr("lib.safe_http.httpx.AsyncClient", _FakeClient)

    async def _run():
        with tempfile.TemporaryDirectory() as d:
            dest = os.path.join(d, "ok.bin")
            n = await download_to_path(
                "https://cdn.example.com/ok.bin", dest,
                max_bytes=10 * 1024 * 1024, timeout=5.0,
            )
            assert n == len(payload)
            assert open(dest, "rb").read() == payload

    asyncio.run(_run())


def test_download_rejects_content_length_too_large(monkeypatch):
    class _FakeStreamResponse:
        def __init__(self):
            self.status_code = 200
            self.headers = {"content-length": str(50 * 1024 * 1024)}
            self.url = httpx.URL("https://cdn.example.com/decl.bin")

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def aiter_bytes(self, chunk_size=64 * 1024):
            yield b""  # never reached

    class _FakeClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        def stream(self, method, url):
            return _FakeStreamResponse()

    monkeypatch.setattr("lib.safe_http.httpx.AsyncClient", _FakeClient)

    async def _run():
        with tempfile.TemporaryDirectory() as d:
            dest = os.path.join(d, "decl.bin")
            with pytest.raises(SafeHttpError):
                await download_to_path(
                    "https://cdn.example.com/decl.bin", dest,
                    max_bytes=1024, timeout=5.0,
                )

    asyncio.run(_run())

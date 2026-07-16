"""Unit tests for DH v2 video download helpers."""

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import httpx

from lib.dh_video_v2_service import (
    _is_likely_mp4,
    download_video_file,
)


def test_is_likely_mp4_ftyp() -> None:
    data = b"\x00\x00\x00\x18ftypisom\x00\x00\x00\x00"
    assert _is_likely_mp4(data) is True
    assert _is_likely_mp4(data, "video/mp4") is True


def test_is_likely_mp4_rejects_html() -> None:
    assert _is_likely_mp4(b"<html>error</html>") is False


def test_download_cdn_403_then_no_auth_success() -> None:
    """CDN 403 + Bearer 失败后，无 Authorization 重试成功。"""

    async def _run() -> None:
        mp4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 2000
        cdn_url = "https://cdn.example.com/video.mp4"

        mock_resp_403 = MagicMock()
        mock_resp_403.status_code = 403
        mock_resp_403.headers = {"content-type": "text/html"}
        mock_resp_403.text = "Forbidden"
        mock_resp_403.content = b"Forbidden"
        err_403 = httpx.HTTPStatusError("403", request=MagicMock(), response=mock_resp_403)

        mock_resp_ok = MagicMock()
        mock_resp_ok.status_code = 200
        mock_resp_ok.headers = {"content-type": "video/mp4"}
        mock_resp_ok.content = mp4
        mock_resp_ok.raise_for_status = MagicMock()

        call_headers: list[dict | None] = []

        async def fake_get(url: str, headers: dict | None = None):
            call_headers.append(headers)
            if headers and "Authorization" in headers:
                raise err_403
            return mock_resp_ok

        mock_client = AsyncMock()
        mock_client.get = fake_get
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with tempfile.TemporaryDirectory() as tmp:
            dest = str(Path(tmp) / "out.mp4")
            with patch("lib.dh_video_v2_service.get_seedance_endpoint") as mock_ep:
                mock_ep.return_value = MagicMock(
                    api_key="test-key",
                    base_url="https://api.example.com",
                )
                with patch("lib.dh_video_v2_service._http_client", return_value=mock_client):
                    path = await download_video_file(
                        cdn_url,
                        dest,
                        upstream_id="",
                        retries=1,
                        debug_context="test",
                    )
            assert path == dest
            assert Path(dest).read_bytes() == mp4
            assert any(h is not None and "Authorization" in h for h in call_headers)
            assert any(h == {} for h in call_headers)

    asyncio.run(_run())


def test_download_content_endpoint_fallback() -> None:
    """poll URL 失败时 fallback 到 /v1/videos/{id}/content。"""

    async def _run() -> None:
        mp4 = b"\x00\x00\x00\x18ftypisom" + b"\x00" * 2000
        poll_url = "https://cdn.example.com/bad.mp4"
        content_url = "https://api.example.com/v1/videos/task-1/content"

        mock_resp_fail = MagicMock()
        mock_resp_fail.status_code = 404
        mock_resp_fail.headers = {"content-type": "text/plain"}
        mock_resp_fail.text = "not found"
        mock_resp_fail.content = b"not found"
        err_404 = httpx.HTTPStatusError("404", request=MagicMock(), response=mock_resp_fail)

        mock_resp_ok = MagicMock()
        mock_resp_ok.status_code = 200
        mock_resp_ok.headers = {"content-type": "video/mp4"}
        mock_resp_ok.content = mp4
        mock_resp_ok.raise_for_status = MagicMock()

        urls_called: list[str] = []

        async def fake_get(url: str, headers: dict | None = None):
            urls_called.append(url)
            if poll_url in url:
                raise err_404
            return mock_resp_ok

        mock_client = AsyncMock()
        mock_client.get = fake_get
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with tempfile.TemporaryDirectory() as tmp:
            dest = str(Path(tmp) / "out.mp4")
            with patch("lib.dh_video_v2_service.get_seedance_endpoint") as mock_ep:
                mock_ep.return_value = MagicMock(
                    api_key="test-key",
                    base_url="https://api.example.com",
                )
                with patch("lib.dh_video_v2_service._http_client", return_value=mock_client):
                    path = await download_video_file(
                        poll_url,
                        dest,
                        upstream_id="task-1",
                        retries=1,
                        debug_context="test",
                    )
            assert path == dest
            assert content_url in urls_called

    asyncio.run(_run())

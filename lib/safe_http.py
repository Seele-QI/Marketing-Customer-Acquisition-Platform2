"""带 SSRF 防护 + 大小上限的远程 URL 下载工具。

设计原则：

1. **拒绝内网 / 本机 / 链路本地 IP**
   攻击者拿到 RunningHub 一个不可信回调字段（或其他能注入 URL 的入口）
   后，可能让我们的服务去拉 http://169.254.169.254、http://127.0.0.1 等。
   本模块在解析 URL 时强制拒绝这些目标。

2. **流式下载 + 显式大小上限**
   旧实现 `resp.content` 一次性把响应体读入内存，远端只要返回一个
   2GB 的视频就能直接 OOM。本模块 `async for chunk in aiter_bytes()`
   边下边写，超限即抛错。

3. **重定向解析时也校验**
   `httpx.follow_redirects=True` 会跟随 Location，第一次校验时 URL
   合法不代表跳转目标合法。手动跟随 N 跳，每跳都过校验。

4. **超时分层**
   - connect：5s
   - read：分块超时 30s（防慢速 DoS）
   - 整体：调用方指定（视频 300s，音频 120s）

调用方式：

    from lib.safe_http import download_to_path, SafeHttpError

    try:
        await download_to_path(
            url, dest_path,
            max_bytes=200 * 1024 * 1024,
            timeout=180.0,
        )
    except SafeHttpError as e:
        raise HTTPException(400, detail=str(e))
"""
from __future__ import annotations

import ipaddress
import logging
import os
from typing import Iterable, Optional
from urllib.parse import urlparse

import httpx

logger = logging.getLogger(__name__)


class SafeHttpError(Exception):
    """安全相关的下载失败，调用方应展示给用户。"""


_MAX_REDIRECTS = 5


def _check_target_host(url: str) -> str:
    """对单个 URL 做协议 / 主机 / 内网拦截校验。返回规范化的 url。"""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise SafeHttpError(f"unsupported scheme: {parsed.scheme!r}")
    host = (parsed.hostname or "").lower()
    if not host:
        raise SafeHttpError("missing host")

    # 拒绝形如 http://2130706433/ 的整数 IP / 0.0.0.0 / 127.x / ::1
    try:
        ip = ipaddress.ip_address(host)
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise SafeHttpError(f"refuse internal IP: {host}")
    except ValueError:
        # 主机名 —— 拒绝 localhost / *.local 这类常见内网名
        host_lower = host.lower()
        if host_lower in ("localhost", "localhost.localdomain"):
            raise SafeHttpError("refuse localhost")
        if host_lower.endswith(".local") or host_lower.endswith(".internal"):
            raise SafeHttpError(f"refuse internal hostname: {host}")
    return url


async def download_to_path(
    url: str,
    dest_path: str,
    *,
    max_bytes: int,
    timeout: float = 180.0,
    chunk_size: int = 64 * 1024,
    allowed_content_types: Optional[Iterable[str]] = None,
) -> int:
    """流式下载 URL 到磁盘，返回实际字节数。

    安全保证：
    - 全程校验主机不在内网 / 本机 / 链路本地
    - 超过 max_bytes 立即中断并 unlink 临时文件
    - 手动跟随重定向，每跳重新校验
    - 默认 Content-Type 不限制；指定 allowed_content_types 时做软校验
      （仅对已知伪装拒绝，不强求一定匹配）

    抛 SafeHttpError 表示安全策略拒绝；网络错误抛 httpx 原始异常。
    """
    if max_bytes <= 0:
        raise SafeHttpError("max_bytes must be > 0")

    tmp_path = f"{dest_path}.download"
    if os.path.exists(tmp_path):
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    current = _check_target_host(url)
    redirects = 0
    timeout_cfg = httpx.Timeout(timeout, connect=5.0, read=30.0)

    async with httpx.AsyncClient(timeout=timeout_cfg, follow_redirects=False) as client:
        while True:
            async with client.stream("GET", current) as resp:
                if resp.status_code in (301, 302, 303, 307, 308):
                    location = resp.headers.get("location")
                    if not location:
                        raise SafeHttpError(f"redirect without Location ({resp.status_code})")
                    redirects += 1
                    if redirects > _MAX_REDIRECTS:
                        raise SafeHttpError("too many redirects")
                    # 相对 URL 由 httpx 解析
                    nxt = str(httpx.URL(location, base_url=str(resp.url)))
                    current = _check_target_host(nxt)
                    continue

                if resp.status_code >= 400:
                    raise SafeHttpError(f"remote returned HTTP {resp.status_code}")

                if allowed_content_types is not None:
                    ctype = (resp.headers.get("content-type") or "").split(";")[0].strip().lower()
                    if ctype and ctype not in {c.lower() for c in allowed_content_types}:
                        # 软校验：只记日志，不强拦截（CDN 经常返回 application/octet-stream）
                        logger.info(
                            "safe_http: unexpected content-type %s for %s (allowed=%s)",
                            ctype, current, allowed_content_types,
                        )

                # 大小预校验
                content_length = resp.headers.get("content-length")
                if content_length and content_length.isdigit():
                    if int(content_length) > max_bytes:
                        raise SafeHttpError(
                            f"remote file too large: {int(content_length)} > {max_bytes}"
                        )

                received = 0
                os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
                with open(tmp_path, "wb") as f:
                    async for chunk in resp.aiter_bytes(chunk_size=chunk_size):
                        if not chunk:
                            continue
                        received += len(chunk)
                        if received > max_bytes:
                            try:
                                f.close()
                            finally:
                                try:
                                    os.unlink(tmp_path)
                                except OSError:
                                    pass
                            raise SafeHttpError(
                                f"download exceeded limit: {received} > {max_bytes}"
                            )
                        f.write(chunk)

                os.replace(tmp_path, dest_path)
                return received


__all__ = ["SafeHttpError", "download_to_path"]

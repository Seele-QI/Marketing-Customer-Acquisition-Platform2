"""Network transport helpers for RunningHub CDN downloads."""

from __future__ import annotations

import ipaddress
from collections.abc import Awaitable, Callable

import httpcore
import httpx
from httpcore._backends.auto import AutoBackend


_ALIDNS_DOH = "https://dns.alidns.com/resolve"
_RUNNINGHUB_CDN_SUFFIXES = (
    ".myqcloud.com",
    ".file.myqcloud.com",
)


async def _resolve_public_ipv4(host: str) -> str:
    async with httpx.AsyncClient(timeout=10.0, trust_env=False) as client:
        response = await client.get(_ALIDNS_DOH, params={"name": host, "type": "A"})
        response.raise_for_status()
        answers = response.json().get("Answer") or []
    for answer in answers:
        if int(answer.get("type") or 0) != 1:
            continue
        value = str(answer.get("data") or "").strip()
        try:
            address = ipaddress.ip_address(value)
        except ValueError:
            continue
        if address.version == 4 and address.is_global:
            return value
    raise httpx.ConnectError(f"RunningHub CDN public DNS returned no usable A record for {host}")


class RunningHubDnsBackend(httpcore.AsyncNetworkBackend):
    """Resolve affected Tencent COS hosts through public DoH while preserving TLS SNI."""

    def __init__(
        self,
        *,
        backend: httpcore.AsyncNetworkBackend | None = None,
        resolver: Callable[[str], Awaitable[str]] | None = None,
    ) -> None:
        self._backend = backend or AutoBackend()
        self._resolver = resolver or _resolve_public_ipv4
        self._cache: dict[str, str] = {}

    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        socket_options=None,
    ):
        target = host
        if host.lower().endswith(_RUNNINGHUB_CDN_SUFFIXES):
            target = self._cache.get(host) or await self._resolver(host)
            self._cache[host] = target
        return await self._backend.connect_tcp(
            target,
            port,
            timeout=timeout,
            local_address=local_address,
            socket_options=socket_options,
        )

    async def connect_unix_socket(self, path: str, timeout: float | None = None, socket_options=None):
        return await self._backend.connect_unix_socket(
            path,
            timeout=timeout,
            socket_options=socket_options,
        )

    async def sleep(self, seconds: float) -> None:
        await self._backend.sleep(seconds)


def runninghub_async_transport() -> httpx.AsyncHTTPTransport:
    transport = httpx.AsyncHTTPTransport(retries=1)
    transport._pool = httpcore.AsyncConnectionPool(  # type: ignore[attr-defined]
        retries=1,
        network_backend=RunningHubDnsBackend(),
    )
    return transport


__all__ = ["RunningHubDnsBackend", "runninghub_async_transport"]

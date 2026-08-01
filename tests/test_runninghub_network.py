from __future__ import annotations

import asyncio

from lib.runninghub_network import RunningHubDnsBackend


class FakeBackend:
    def __init__(self) -> None:
        self.hosts: list[str] = []

    async def connect_tcp(self, host, port, **kwargs):
        self.hosts.append(host)
        return object()

    async def connect_unix_socket(self, path, **kwargs):
        return object()

    async def sleep(self, seconds):
        return None


def test_runninghub_cos_uses_public_dns_result() -> None:
    delegate = FakeBackend()

    async def resolve(_host: str) -> str:
        return "175.6.91.141"

    backend = RunningHubDnsBackend(backend=delegate, resolver=resolve)
    asyncio.run(
        backend.connect_tcp(
            "rh-images-switch-1252422369.cos.ap-guangzhou.myqcloud.com",
            443,
        )
    )

    assert delegate.hosts == ["175.6.91.141"]


def test_unrelated_hosts_keep_system_dns_path() -> None:
    delegate = FakeBackend()

    async def resolve(_host: str) -> str:
        raise AssertionError("resolver must not be called")

    backend = RunningHubDnsBackend(backend=delegate, resolver=resolve)
    asyncio.run(backend.connect_tcp("www.runninghub.ai", 443))

    assert delegate.hosts == ["www.runninghub.ai"]

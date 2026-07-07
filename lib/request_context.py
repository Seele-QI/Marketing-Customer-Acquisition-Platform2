"""请求上下文（桌面混合模式云端扣费需要 session cookie）。"""
from __future__ import annotations

from contextvars import ContextVar
from typing import Optional

_request_ctx: ContextVar[Optional[object]] = ContextVar("fastapi_request", default=None)


def set_current_request(request) -> object:
    return _request_ctx.set(request)


def reset_current_request(token: object) -> None:
    _request_ctx.reset(token)


def get_current_request():
    return _request_ctx.get()

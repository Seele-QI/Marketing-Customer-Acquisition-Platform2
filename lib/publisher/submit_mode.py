"""Per-request final-submit policy for browser publishers."""
from __future__ import annotations

from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator

MANUAL_CONFIRM = "manual_confirm"
AUTO_SUBMIT = "auto_submit"
VALID_SUBMIT_MODES = {MANUAL_CONFIRM, AUTO_SUBMIT}

_current_submit_mode: ContextVar[str] = ContextVar(
    "distribution_submit_mode",
    default=MANUAL_CONFIRM,
)


def normalize_submit_mode(value: str | None) -> str:
    mode = str(value or MANUAL_CONFIRM).strip().lower()
    if mode not in VALID_SUBMIT_MODES:
        raise ValueError("submitMode 必须为 manual_confirm 或 auto_submit")
    return mode


def current_submit_mode() -> str:
    return _current_submit_mode.get()


@contextmanager
def submit_mode_scope(value: str | None) -> Iterator[str]:
    mode = normalize_submit_mode(value)
    token = _current_submit_mode.set(mode)
    try:
        yield mode
    finally:
        _current_submit_mode.reset(token)

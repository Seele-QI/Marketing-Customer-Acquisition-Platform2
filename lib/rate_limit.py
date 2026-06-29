"""通用限频。基于独立 `rate_events` 表 + (scope, key) 主键。

历史 Bug：旧实现把 `ip:{ip}` 作为 email_hash 写入 `email_tokens` 的查询条件，
但 `email_tokens` 只会被 `save_email_token` 写入真实 email_hash，导致 IP 限频
**永远不会触发**。本次重写引入独立表，且必须显式调用 `record()`。

调用约定：
    from lib.rate_limit import check_email, check_ip, record

    ok, _ = check_email(email_hash)
    if not ok: return {...}  # 限频
    ok, _ = check_ip(ip)
    if not ok: return {...}
    # ... 执行业务 ...
    record("email", email_hash)
    record("ip", ip)
"""
import time
from typing import Tuple

from lib.db import connect, transaction

# (window_seconds, max_count)
EMAIL_LIMITS = [
    (60, 1),
    (3600, 5),
    (86400, 10),
]
IP_LIMITS = [
    (3600, 10),
    (86400, 50),
]
CENTRAL_ACTIVATE_IP_LIMITS = [
    (60, 10),
]


def _ensure_schema() -> None:
    conn = connect()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS rate_events (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                scope      TEXT NOT NULL,
                key        TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_rate_events_lookup
                ON rate_events (scope, key, created_at);
            """
        )
        conn.commit()
    finally:
        conn.close()


_ensure_schema()


def _count_since(scope: str, key: str, since_ms: int) -> int:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM rate_events WHERE scope = ? AND key = ? AND created_at >= ?",
            (scope, key, since_ms),
        ).fetchone()
        return int(row[0])
    finally:
        conn.close()


def record(scope: str, key: str) -> None:
    """记录一次事件。调用方在校验通过后调用。"""
    if not scope or not key:
        return
    now = int(time.time() * 1000)
    with transaction() as conn:
        conn.execute(
            "INSERT INTO rate_events (scope, key, created_at) VALUES (?, ?, ?)",
            (scope, key, now),
        )
        cutoff = now - 7 * 86400 * 1000
        conn.execute(
            "DELETE FROM rate_events WHERE scope = ? AND key = ? AND created_at < ?",
            (scope, key, cutoff),
        )


def check_email(email_hash: str) -> Tuple[bool, str]:
    if not email_hash:
        return True, ""
    now = int(time.time() * 1000)
    for window_s, limit in EMAIL_LIMITS:
        since = now - window_s * 1000
        if _count_since("email", email_hash, since) >= limit:
            mins = max(1, window_s // 60)
            return False, f"操作过于频繁，请 {mins} 分钟后再试"
    return True, ""


def check_ip(ip: str) -> Tuple[bool, str]:
    if not ip:
        return True, ""
    now = int(time.time() * 1000)
    for window_s, limit in IP_LIMITS:
        since = now - window_s * 1000
        if _count_since("ip", ip, since) >= limit:
            mins = max(1, window_s // 60)
            return False, f"该 IP 请求过于频繁，请 {mins} 分钟后再试"
    return True, ""


def check_scoped(scope: str, key: str, limits: list[tuple[int, int]]) -> Tuple[bool, str]:
    if not key:
        return True, ""
    now = int(time.time() * 1000)
    for window_s, limit in limits:
        since = now - window_s * 1000
        if _count_since(scope, key, since) >= limit:
            mins = max(1, window_s // 60)
            return False, f"请求过于频繁，请 {mins} 分钟后再试"
    return True, ""

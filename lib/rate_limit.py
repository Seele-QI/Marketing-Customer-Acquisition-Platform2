"""邮箱/IP 限频。用于 send-link 入口。"""
import time
from typing import Tuple

from lib.db import connect

EMAIL_LIMITS = [
    (60, 1),
    (3600, 5),
    (86400, 10),
]
IP_LIMITS = [
    (3600, 10),
]


def _count_since(key: str, since_ts: int) -> int:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM email_tokens WHERE email_hash = ? AND created_at >= ?",
            (key, since_ts),
        ).fetchone()
        return int(row[0])
    finally:
        conn.close()


def check_email(email_hash: str) -> Tuple[bool, str]:
    now = int(time.time() * 1000)
    for window_s, limit in EMAIL_LIMITS:
        since = now - window_s * 1000
        if _count_since(email_hash, since) >= limit:
            mins = window_s // 60
            return False, f"操作过于频繁，请 {mins} 分钟后再试"
    return True, ""


def check_ip(ip: str) -> Tuple[bool, str]:
    if not ip:
        return True, ""
    now = int(time.time() * 1000)
    for window_s, limit in IP_LIMITS:
        since = now - window_s * 1000
        if _count_since(f"ip:{ip}", since) >= limit:
            mins = window_s // 60
            return False, f"该 IP 请求过于频繁，请 {mins} 分钟后再试"
    return True, ""
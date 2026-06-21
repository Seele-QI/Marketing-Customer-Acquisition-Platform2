"""邮箱/IP/用户限频。send-link 用邮箱+IP 限频,consume 用按 user_id 限频。"""
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
USER_CONSUME_LIMITS = [
    (60, 30),       # 1 分钟 30 次
    (3600, 300),    # 1 小时 300 次
]


def _count_email_tokens_since(key: str, since_ts: int) -> int:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM email_tokens WHERE email_hash = ? AND created_at >= ?",
            (key, since_ts),
        ).fetchone()
        return int(row[0])
    finally:
        conn.close()


def _count_consume_since(user_id: int, since_ts: int) -> int:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM credit_ledger WHERE user_id = ? AND type = 'consume' AND created_at >= ?",
            (user_id, since_ts),
        ).fetchone()
        return int(row[0])
    finally:
        conn.close()


def check_email(email_hash: str) -> Tuple[bool, str]:
    now = int(time.time() * 1000)
    for window_s, limit in EMAIL_LIMITS:
        since = now - window_s * 1000
        if _count_email_tokens_since(email_hash, since) >= limit:
            mins = window_s // 60
            return False, f"操作过于频繁，请 {mins} 分钟后再试"
    return True, ""


def check_ip(ip: str) -> Tuple[bool, str]:
    if not ip:
        return True, ""
    now = int(time.time() * 1000)
    for window_s, limit in IP_LIMITS:
        since = now - window_s * 1000
        if _count_email_tokens_since(f"ip:{ip}", since) >= limit:
            mins = window_s // 60
            return False, f"该 IP 请求过于频繁，请 {mins} 分钟后再试"
    return True, ""


def check_consume(user_id: int) -> Tuple[bool, str]:
    """按 user_id 限频 consume 入口,基于 credit_ledger 中 type='consume' 的条数。"""
    now = int(time.time() * 1000)
    for window_s, limit in USER_CONSUME_LIMITS:
        since = now - window_s * 1000
        if _count_consume_since(user_id, since) >= limit:
            mins = window_s // 60
            return False, f"扣分操作过于频繁，请 {mins} 分钟后再试"
    return True, ""
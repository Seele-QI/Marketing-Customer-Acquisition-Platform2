"""平台连接服务：对接用户账号库与发布模块。"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from typing import Any, Dict, List, Optional

from lib.crypto_utils import decrypt_cookie, encrypt_cookie
from lib.publisher.cookies import parse_cookie_payload

_ACCOUNTS_DB = (
    (os.getenv("CREDIT_DB_OVERRIDE") or "").strip()
    or os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "accounts.db")
)

PLATFORM_SPECS: Dict[str, Dict[str, Any]] = {
    "douyin": {"name": "抖音", "supports_browser": True, "supports_oauth": False},
    "xiaohongshu": {"name": "小红书", "supports_browser": True, "supports_oauth": False},
    "kuaishou": {"name": "快手", "supports_browser": True, "supports_oauth": False},
    "shipinhao": {"name": "视频号", "supports_browser": True, "supports_oauth": False},
}


def _init_accounts_db() -> None:
    os.makedirs(os.path.dirname(_ACCOUNTS_DB), exist_ok=True)
    conn = sqlite3.connect(_ACCOUNTS_DB)
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL DEFAULT 0,
                platform TEXT NOT NULL,
                nickname TEXT DEFAULT '',
                cookie_encrypted TEXT NOT NULL,
                cookie_iv TEXT NOT NULL,
                login_status TEXT DEFAULT 'unknown',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _list_user_accounts(user_id: int) -> Dict[str, dict]:
    _init_accounts_db()
    conn = sqlite3.connect(_ACCOUNTS_DB)
    try:
        rows = conn.execute(
            "SELECT id, platform, nickname, login_status, updated_at FROM accounts WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    finally:
        conn.close()
    return {
        r[1]: {
            "id": r[0],
            "platform": r[1],
            "nickname": r[2] or "",
            "login_status": r[3],
            "updated_at": r[4],
        }
        for r in rows
    }


def get_all_platforms(user_id: int) -> List[Dict[str, Any]]:
    bound = _list_user_accounts(user_id)
    out: List[Dict[str, Any]] = []
    for platform_id, spec in PLATFORM_SPECS.items():
        acc = bound.get(platform_id)
        out.append(
            {
                "platform_id": platform_id,
                "platform_name": spec["name"],
                "supports_oauth": spec["supports_oauth"],
                "status": "connected" if acc else "disconnected",
                "connected": bool(acc),
                "account_info": {"nickname": acc["nickname"]} if acc else None,
            }
        )
    return out


_COOKIE_DOMAINS = {
    "douyin": ".douyin.com",
    "xiaohongshu": ".xiaohongshu.com",
    "kuaishou": ".kuaishou.com",
    "shipinhao": ".weixin.qq.com",
}


def _credentials_to_cookie_json(credentials: Dict[str, str], platform: str = "") -> str:
    if not credentials:
        raise ValueError("凭证不能为空")
    raw = credentials.get("__cookie_json")
    if raw:
        return raw
    domain = _COOKIE_DOMAINS.get((platform or "").strip().lower(), "")
    return json.dumps(
        [
            {"name": k, "value": v, "domain": domain, "path": "/"}
            for k, v in credentials.items()
            if not str(k).startswith("__")
        ],
        ensure_ascii=False,
    )


def save_platform_credentials(
    user_id: int,
    platform: str,
    credentials: Dict[str, str],
    *,
    nickname: str = "",
) -> None:
    platform = platform.strip().lower()
    if platform not in PLATFORM_SPECS:
        raise ValueError(f"不支持的平台: {platform}")
    cookie_json = _credentials_to_cookie_json(credentials)
    encrypted, iv = encrypt_cookie(cookie_json)
    now = time.time()
    account_id = str(uuid.uuid4())[:8]
    _init_accounts_db()
    conn = sqlite3.connect(_ACCOUNTS_DB)
    try:
        conn.execute("DELETE FROM accounts WHERE user_id = ? AND platform = ?", (user_id, platform))
        conn.execute(
            "INSERT INTO accounts (id, user_id, platform, nickname, cookie_encrypted, cookie_iv, login_status, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (account_id, user_id, platform, nickname[:64], encrypted, iv, "valid", now, now),
        )
        conn.commit()
    finally:
        conn.close()


def _sync_profile_cookie_file(user_id: int, platform: str, cookie_payload: str) -> None:
    """每个中台用户独立 Cookie 文件，避免多账号串号。"""
    if platform not in ("douyin", "xiaohongshu", "kuaishou", "shipinhao"):
        return
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    from lib.publisher.profile_paths import user_cookie_file

    path = user_cookie_file(root, user_id, platform)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(cookie_payload)


def save_cookie_payload(user_id: int, platform: str, cookie_payload: str, *, nickname: str = "") -> None:
    payload = (cookie_payload or "").strip()
    if not payload:
        raise ValueError("Cookie 不能为空")
    try:
        data = json.loads(payload)
        if isinstance(data, list):
            save_platform_credentials(user_id, platform, {"__cookie_json": payload}, nickname=nickname)
            _sync_profile_cookie_file(user_id, platform, payload)
            return
    except json.JSONDecodeError:
        pass
    parsed = parse_cookie_payload(payload)
    if parsed:
        save_platform_credentials(user_id, platform, parsed, nickname=nickname)
        _sync_profile_cookie_file(user_id, platform, payload)
        return
    save_platform_credentials(user_id, platform, {"__cookie_json": payload}, nickname=nickname)


def save_cookie_string(user_id: int, platform: str, cookie_string: str) -> None:
    creds: Dict[str, str] = {}
    for item in (cookie_string or "").split(";"):
        item = item.strip()
        if not item or "=" not in item:
            continue
        k, v = item.split("=", 1)
        creds[k.strip()] = v.strip()
    if not creds:
        raise ValueError("未解析到有效 Cookie")
    save_platform_credentials(user_id, platform, creds)


def disconnect_platform(user_id: int, platform_id: str) -> bool:
    _init_accounts_db()
    conn = sqlite3.connect(_ACCOUNTS_DB)
    try:
        cur = conn.execute(
            "DELETE FROM accounts WHERE user_id = ? AND platform = ?",
            (user_id, platform_id.strip().lower()),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def get_account_cookie_json(user_id: int, platform: str) -> Optional[str]:
    _init_accounts_db()
    conn = sqlite3.connect(_ACCOUNTS_DB)
    try:
        row = conn.execute(
            "SELECT cookie_encrypted, cookie_iv FROM accounts WHERE user_id = ? AND platform = ? ORDER BY updated_at DESC LIMIT 1",
            (user_id, platform),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    return decrypt_cookie(row[0], row[1])

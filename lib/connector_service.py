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
    "douyin": {"name": "抖音", "capabilities": ["video"], "release_status": "beta"},
    "xiaohongshu": {"name": "小红书", "capabilities": ["video", "geo_article"], "release_status": "testing"},
    "kuaishou": {"name": "快手", "capabilities": ["video"], "release_status": "testing"},
    "shipinhao": {"name": "视频号", "capabilities": ["video"], "release_status": "testing"},
    "zhihu": {"name": "知乎", "capabilities": ["geo_article"], "release_status": "testing"},
    "weibo": {"name": "微博", "capabilities": ["geo_article"], "release_status": "testing"},
    "dianping": {"name": "大众点评", "capabilities": ["geo_article"], "release_status": "testing"},
    "ctrip": {"name": "携程", "capabilities": ["geo_article"], "release_status": "testing"},
    "sohu": {"name": "搜狐", "capabilities": ["geo_article"], "release_status": "testing"},
    "toutiao": {"name": "今日头条", "capabilities": ["geo_article"], "release_status": "testing"},
    "baijiahao": {"name": "百家号", "capabilities": ["geo_article"], "release_status": "testing"},
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
                platform_user_id TEXT DEFAULT '',
                verified_at REAL,
                cookie_encrypted TEXT NOT NULL,
                cookie_iv TEXT NOT NULL,
                login_status TEXT DEFAULT 'unknown',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
            """
        )
        columns = {row[1] for row in conn.execute("PRAGMA table_info(accounts)").fetchall()}
        if "user_id" not in columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0")
        if "platform_user_id" not in columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN platform_user_id TEXT DEFAULT ''")
        if "verified_at" not in columns:
            conn.execute("ALTER TABLE accounts ADD COLUMN verified_at REAL")
        conn.execute(
            "UPDATE accounts SET login_status = 'unverified' "
            "WHERE verified_at IS NULL AND login_status = 'valid'"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_accounts_user_platform ON accounts(user_id, platform)"
        )
        conn.commit()
    finally:
        conn.close()


def _list_user_accounts(user_id: int) -> Dict[str, dict]:
    _init_accounts_db()
    conn = sqlite3.connect(_ACCOUNTS_DB)
    try:
        rows = conn.execute(
            "SELECT id, platform, nickname, platform_user_id, verified_at, login_status, updated_at "
            "FROM accounts WHERE user_id = ?",
            (user_id,),
        ).fetchall()
    finally:
        conn.close()
    return {
        r[1]: {
            "id": r[0],
            "platform": r[1],
            "nickname": r[2] or "",
            "platform_user_id": r[3] or "",
            "verified_at": r[4],
            "login_status": r[5],
            "updated_at": r[6],
        }
        for r in rows
    }


def get_all_platforms(user_id: int) -> List[Dict[str, Any]]:
    bound = _list_user_accounts(user_id)
    out: List[Dict[str, Any]] = []
    for platform_id, spec in PLATFORM_SPECS.items():
        acc = bound.get(platform_id)
        verified = bool(
            acc
            and acc["login_status"] == "valid"
            and acc["verified_at"]
            and acc["nickname"].strip()
        )
        if verified:
            verification_status = "verified"
        elif acc and acc["login_status"] in {"expired", "invalid", "login_expired"}:
            verification_status = "expired"
        elif acc:
            verification_status = "unverified"
        else:
            verification_status = "disconnected"
        out.append(
            {
                "platform_id": platform_id,
                "platform_name": spec["name"],
                "supports_oauth": False,
                "supports_browser": True,
                "capabilities": spec["capabilities"],
                "release_status": spec["release_status"],
                "connection_health": "connected" if verified else verification_status,
                "requires_manual_action": True,
                "status": "connected" if verified else verification_status,
                "connected": verified,
                "verification_status": verification_status,
                "account_info": {
                    "nickname": acc["nickname"],
                    "platform_user_id": acc["platform_user_id"],
                    "verified_at": acc["verified_at"],
                } if acc else None,
            }
        )
    return out


_COOKIE_DOMAINS = {
    "douyin": ".douyin.com",
    "xiaohongshu": ".xiaohongshu.com",
    "kuaishou": ".kuaishou.com",
    "shipinhao": ".weixin.qq.com",
    "zhihu": ".zhihu.com",
    "weibo": ".weibo.com",
    "dianping": ".dianping.com",
    "ctrip": ".ctrip.com",
    "sohu": ".sohu.com",
    "toutiao": ".toutiao.com",
    "baijiahao": ".baidu.com",
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
    platform_user_id: str = "",
    verified: Optional[bool] = None,
) -> Dict[str, Any]:
    platform = platform.strip().lower()
    if platform not in PLATFORM_SPECS:
        raise ValueError(f"不支持的平台: {platform}")
    cookie_json = _credentials_to_cookie_json(credentials, platform)
    encrypted, iv = encrypt_cookie(cookie_json)
    now = time.time()
    account_id = str(uuid.uuid4())[:8]
    _init_accounts_db()
    conn = sqlite3.connect(_ACCOUNTS_DB)
    try:
        existing = conn.execute(
            "SELECT nickname, platform_user_id, verified_at, login_status FROM accounts "
            "WHERE user_id = ? AND platform = ? ORDER BY updated_at DESC LIMIT 1",
            (user_id, platform),
        ).fetchone()
        clean_nickname = (nickname or "").strip()[:64]
        clean_platform_user_id = (platform_user_id or "").strip()[:128]
        if verified is True:
            if not clean_nickname:
                raise ValueError("无法确认平台账号昵称，账号未绑定")
            verified_at = now
            login_status = "valid"
        elif verified is None and existing and existing[2] and existing[3] == "valid" and existing[0]:
            clean_nickname = clean_nickname or existing[0]
            clean_platform_user_id = clean_platform_user_id or existing[1] or ""
            verified_at = existing[2]
            login_status = "valid"
        else:
            verified_at = None
            login_status = "unverified"
        conn.execute("DELETE FROM accounts WHERE user_id = ? AND platform = ?", (user_id, platform))
        conn.execute(
            "INSERT INTO accounts (id, user_id, platform, nickname, platform_user_id, verified_at, "
            "cookie_encrypted, cookie_iv, login_status, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (account_id, user_id, platform, clean_nickname, clean_platform_user_id, verified_at,
             encrypted, iv, login_status, now, now),
        )
        conn.commit()
        return {
            "id": account_id,
            "platform": platform,
            "nickname": clean_nickname,
            "platform_user_id": clean_platform_user_id,
            "verified_at": verified_at,
            "login_status": login_status,
        }
    finally:
        conn.close()


def _sync_profile_cookie_file(user_id: int, platform: str, cookie_payload: str) -> None:
    """每个中台用户独立 Cookie 文件，避免多账号串号。"""
    if platform not in PLATFORM_SPECS:
        return
    root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    from lib.publisher.profile_paths import user_cookie_file

    path = user_cookie_file(root, user_id, platform)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        f.write(cookie_payload)


def save_cookie_payload(
    user_id: int,
    platform: str,
    cookie_payload: str,
    *,
    nickname: str = "",
    platform_user_id: str = "",
    verified: Optional[bool] = None,
) -> Dict[str, Any]:
    payload = (cookie_payload or "").strip()
    if not payload:
        raise ValueError("Cookie 不能为空")
    try:
        data = json.loads(payload)
        if isinstance(data, list):
            account = save_platform_credentials(
                user_id, platform, {"__cookie_json": payload}, nickname=nickname,
                platform_user_id=platform_user_id, verified=verified,
            )
            _sync_profile_cookie_file(user_id, platform, payload)
            return account
    except json.JSONDecodeError:
        pass
    parsed = parse_cookie_payload(payload)
    if parsed:
        account = save_platform_credentials(
            user_id, platform, parsed, nickname=nickname,
            platform_user_id=platform_user_id, verified=verified,
        )
        _sync_profile_cookie_file(user_id, platform, payload)
        return account
    return save_platform_credentials(
        user_id, platform, {"__cookie_json": payload}, nickname=nickname,
        platform_user_id=platform_user_id, verified=verified,
    )


def save_cookie_string(
    user_id: int,
    platform: str,
    cookie_string: str,
    *,
    nickname: str = "",
    platform_user_id: str = "",
    verified: Optional[bool] = None,
) -> Dict[str, Any]:
    creds: Dict[str, str] = {}
    for item in (cookie_string or "").split(";"):
        item = item.strip()
        if not item or "=" not in item:
            continue
        k, v = item.split("=", 1)
        creds[k.strip()] = v.strip()
    if not creds:
        raise ValueError("未解析到有效 Cookie")
    return save_platform_credentials(
        user_id, platform, creds, nickname=nickname,
        platform_user_id=platform_user_id, verified=verified,
    )


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

"""桌面混合模式：本地 FastAPI 将 session / 扣费委托给云端 CLOUD_API_URL。"""
from __future__ import annotations

import logging
import os
import time
from typing import Optional

import httpx

from lib.auth import SESSION_COOKIE, CurrentUser

logger = logging.getLogger(__name__)

# create + list 等短时间连打时复用 /api/auth/me，避免每次都打云端（最多 ~15s）。
_AUTH_CACHE_TTL_SEC = 8.0
_auth_cache: dict[str, tuple[float, CurrentUser]] = {}


def cloud_api_base() -> str:
    return (os.getenv("CLOUD_API_URL") or "").strip().rstrip("/")


def is_cloud_hybrid_mode() -> bool:
    return bool(cloud_api_base())


def invalidate_remote_auth_cache(session_id: str | None = None) -> None:
    """登出或鉴权失败时清理缓存。"""
    if session_id is None:
        _auth_cache.clear()
        return
    _auth_cache.pop(session_id, None)


def get_current_user_remote(request) -> Optional[CurrentUser]:
    base = cloud_api_base()
    if not base:
        return None
    sid = request.cookies.get(SESSION_COOKIE)
    if not sid:
        return None

    cached = _auth_cache.get(sid)
    if cached is not None:
        expires_at, user = cached
        if time.monotonic() < expires_at:
            return user
        _auth_cache.pop(sid, None)

    try:
        # trust_env=False：忽略 Windows 系统代理（如 127.0.0.1:10808）。
        # 代理关闭时 httpx 默认仍会走系统代理 → WinError 10061 → 误报「请先登录」。
        with httpx.Client(timeout=15.0, follow_redirects=False, trust_env=False) as client:
            resp = client.get(
                f"{base}/api/auth/me",
                cookies={SESSION_COOKIE: sid},
            )
            if resp.status_code != 200:
                invalidate_remote_auth_cache(sid)
                return None
            data = resp.json()
            user = data.get("user") or {}
            uid = user.get("id")
            if not isinstance(uid, int):
                invalidate_remote_auth_cache(sid)
                return None
            current = CurrentUser(
                id=uid,
                email_masked=str(user.get("email_masked") or ""),
                login_name=str(user.get("login_name") or ""),
                nickname=user.get("nickname"),
            )
            try:
                from lib.local_user_shadow import ensure_local_user_shadow

                ensure_local_user_shadow(current)
            except Exception as shadow_exc:
                logger.warning("local user shadow failed for id=%s: %s", uid, shadow_exc)
            _auth_cache[sid] = (time.monotonic() + _AUTH_CACHE_TTL_SEC, current)
            return current
    except Exception as exc:
        logger.warning("cloud auth me failed: %s", exc)
        invalidate_remote_auth_cache(sid)
        return None


def consume_remote(
    request,
    *,
    scene: str,
    ref_id: str,
    note: str = "",
    cost: int | None = None,
) -> int:
    """通过云端 /api/credit/consume 扣费（携带 session cookie）。"""
    base = cloud_api_base()
    if not base:
        raise RuntimeError("CLOUD_API_URL not configured")
    sid = request.cookies.get(SESSION_COOKIE)
    if not sid:
        raise RuntimeError("missing session cookie")
    payload: dict = {"scene": scene, "ref_id": ref_id, "note": note}
    if cost is not None:
        payload["cost"] = cost
    with httpx.Client(timeout=30.0, follow_redirects=False, trust_env=False) as client:
        resp = client.post(
            f"{base}/api/credit/consume",
            json=payload,
            cookies={SESSION_COOKIE: sid},
        )
        if resp.status_code == 402:
            from lib.credit import CreditError

            raise CreditError("INSUFFICIENT_CREDIT", "积分不足", status=402)
        if resp.status_code >= 400:
            try:
                detail = resp.json().get("detail", {})
                msg = detail.get("message") if isinstance(detail, dict) else str(detail)
            except Exception:
                msg = resp.text[:200]
            from lib.credit import CreditError

            raise CreditError("CLOUD_CONSUME_FAILED", msg or f"HTTP {resp.status_code}", status=resp.status_code)
        data = resp.json()
        balance = data.get("balance")
        if not isinstance(balance, int):
            raise RuntimeError("invalid cloud consume response")
        return balance

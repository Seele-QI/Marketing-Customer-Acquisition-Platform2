"""多平台发布调度。"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sqlite3
from typing import Any, Dict, List, Optional

from lib.crypto_utils import decrypt_cookie
from lib.publisher.cookies import parse_cookie_payload
from lib.publisher.douyin import publish_douyin_video
from lib.publisher.douyin_open_api import can_use_open_api, publish_douyin_open_api
from lib.publisher.types import PublishResult
from lib.publisher.video_path import resolve_local_video_path
from lib.publisher.shipinhao import publish_shipinhao_video
from lib.publisher.kuaishou import publish_kuaishou_video
from lib.publisher.xiaohongshu import publish_xiaohongshu_video

logger = logging.getLogger("publisher.manager")

PUBLISH_TIMEOUT_S = int(os.environ.get("PUBLISH_TIMEOUT_S", "900"))

PLATFORM_LABELS = {
    "douyin": "抖音",
    "xiaohongshu": "小红书",
    "kuaishou": "快手",
    "shipinhao": "视频号",
}

_ACCOUNTS_DB = (
    (os.getenv("CREDIT_DB_OVERRIDE") or "").strip()
    or os.path.join(
        os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
        "data",
        "accounts.db",
    )
)


def _credentials_for_connector(raw: str) -> Dict[str, Any]:
    creds: Dict[str, Any] = dict(parse_cookie_payload(raw))
    try:
        data = json.loads(raw)
        if isinstance(data, list):
            creds["cookies"] = data
    except json.JSONDecodeError:
        pass
    return creds


def _project_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _load_user_cookie(user_id: int, platform: str) -> tuple[Dict[str, str], str]:
    from lib.connector_service import _init_accounts_db
    _init_accounts_db()
    conn = sqlite3.connect(_ACCOUNTS_DB)
    try:
        row = conn.execute(
            """
            SELECT cookie_encrypted, cookie_iv FROM accounts
            WHERE user_id = ? AND platform = ? AND login_status = 'valid'
              AND verified_at IS NOT NULL AND TRIM(nickname) != ''
            ORDER BY updated_at DESC LIMIT 1
            """,
            (user_id, platform),
        ).fetchone()
    finally:
        conn.close()
    if not row or not row[0]:
        raise ValueError(f"未绑定{PLATFORM_LABELS.get(platform, platform)}账号")
    raw = decrypt_cookie(row[0], row[1])
    return parse_cookie_payload(raw), raw


def list_bound_platforms(user_id: int) -> List[Dict[str, Any]]:
    from lib.connector_service import _init_accounts_db
    _init_accounts_db()
    conn = sqlite3.connect(_ACCOUNTS_DB)
    try:
        rows = conn.execute(
            """
            SELECT platform, nickname, updated_at FROM accounts
            WHERE user_id = ? AND login_status = 'valid'
              AND verified_at IS NOT NULL AND TRIM(nickname) != ''
            ORDER BY platform
            """,
            (user_id,),
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            "platform": r[0],
            "label": PLATFORM_LABELS.get(r[0], r[0]),
            "nickname": r[1] or "",
            "updated_at": r[2],
        }
        for r in rows
    ]


async def publish_to_platform(
    *,
    user_id: int,
    platform: str,
    video_url: str,
    title: str,
    description: str,
) -> PublishResult:
    platform = (platform or "").strip().lower()
    if platform not in PLATFORM_LABELS:
        return PublishResult(success=False, platform=platform, error=f"不支持的平台: {platform}")

    try:
        _, cookie_raw = _load_user_cookie(user_id, platform)
        creds = _credentials_for_connector(cookie_raw)
        video_path = resolve_local_video_path(video_url)
    except Exception as exc:
        return PublishResult(success=False, platform=platform, error=str(exc))

    if platform == "douyin":
        flat_creds = {k: str(v) for k, v in creds.items() if k != "cookies" and v is not None}
        if can_use_open_api(flat_creds):
            result = await publish_douyin_open_api(
                video_path=video_path,
                title=title,
                description=description,
                credentials=flat_creds,
            )
            if result.success:
                return result
            logger.warning("douyin open api failed, fallback playwright: %s", result.error)
        if "sessionid" not in flat_creds and not (cookie_raw or "").strip():
            return PublishResult(
                success=False,
                platform=platform,
                error="抖音未绑定：请用浏览器登录，或在账号绑定粘贴开放平台 JSON（含 open_id、access_token）",
            )
        return await publish_douyin_video(
            video_path,
            title,
            description,
            flat_creds,
            project_root=_project_root(),
            cookie_raw=cookie_raw,
            user_id=user_id,
        )
    if platform == "xiaohongshu":
        flat_creds = {k: v for k, v in creds.items() if k != "cookies"}
        try:
            return await asyncio.wait_for(
                publish_xiaohongshu_video(
                    video_path,
                    title,
                    description,
                    flat_creds,
                    project_root=_project_root(),
                    cookie_raw=cookie_raw,
                    user_id=user_id,
                ),
                timeout=PUBLISH_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            return PublishResult(
                success=False,
                platform=platform,
                error=f"小红书发布超时（>{PUBLISH_TIMEOUT_S // 60} 分钟），请查看 Chrome 窗口是否需手动登录或点发布",
            )
    if platform == "kuaishou":
        flat_creds = {k: v for k, v in creds.items() if k != "cookies"}
        try:
            return await asyncio.wait_for(
                publish_kuaishou_video(
                    video_path,
                    title,
                    description,
                    flat_creds,
                    project_root=_project_root(),
                    cookie_raw=cookie_raw,
                    user_id=user_id,
                ),
                timeout=PUBLISH_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            return PublishResult(
                success=False,
                platform=platform,
                error=f"快手发布超时（>{PUBLISH_TIMEOUT_S // 60} 分钟），请查看 Chrome 窗口是否需扫码登录或点发布",
            )
    if platform == "shipinhao":
        flat_creds = {k: v for k, v in creds.items() if k != "cookies"}
        try:
            return await asyncio.wait_for(
                publish_shipinhao_video(
                    video_path,
                    title,
                    description,
                    flat_creds,
                    project_root=_project_root(),
                    cookie_raw=cookie_raw,
                    user_id=user_id,
                ),
                timeout=PUBLISH_TIMEOUT_S,
            )
        except asyncio.TimeoutError:
            return PublishResult(
                success=False,
                platform=platform,
                error=f"视频号发表超时（>{PUBLISH_TIMEOUT_S // 60} 分钟），请查看 Chrome 窗口是否需微信扫码或点「发表」",
            )

    return PublishResult(success=False, platform=platform, error="未知平台")


async def publish_to_all(
    *,
    user_id: int,
    platforms: Optional[List[str]],
    video_url: str,
    title: str,
    description: str,
) -> List[Dict[str, Any]]:
    bound = {p["platform"] for p in list_bound_platforms(user_id)}
    targets = [p.strip().lower() for p in (platforms or []) if p.strip()]
    if not targets:
        targets = sorted(bound)
    else:
        targets = [p for p in targets if p in bound]

    results: List[Dict[str, Any]] = []
    total = len(targets)
    for index, platform in enumerate(targets, start=1):
        logger.info("sequential publish %s/%s platform=%s", index, total, platform)
        result = await publish_to_platform(
            user_id=user_id,
            platform=platform,
            video_url=video_url,
            title=title,
            description=description,
        )
        item = result.to_dict()
        item["sequential_index"] = index
        item["sequential_total"] = total
        results.append(item)
        if not result.success:
            logger.info("sequential publish stopped: %s not successful", platform)
            break
    return results

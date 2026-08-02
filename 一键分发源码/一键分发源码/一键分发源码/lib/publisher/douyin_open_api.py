"""抖音开放平台 API 发布（参考 E:\\douyin-master SDK）。

流程：/video/upload/ → /video/create/
需账号绑定里保存 open_id + access_token（OAuth 授权），无需 Playwright 手机验证。
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
from typing import Any, Dict, Optional

import httpx

from lib.publisher.types import PublishResult

logger = logging.getLogger("publisher.douyin_open_api")

OPEN_API_BASE = "https://open.douyin.com"
CHUNK_SIZE = 8 * 1024 * 1024  # 8MB 分片


def _sdk_root() -> str:
    return (os.getenv("DOUYIN_SDK_PATH") or r"E:\douyin-master").strip()


def can_use_open_api(creds: Dict[str, Any]) -> bool:
    return bool(str(creds.get("access_token") or "").strip() and str(creds.get("open_id") or "").strip())


def _api_error(payload: Any) -> Optional[str]:
    if not isinstance(payload, dict):
        return None
    data = payload.get("data")
    if isinstance(data, dict):
        err = data.get("error_code")
        if isinstance(err, dict) and err.get("error_code") not in (0, "0", None):
            desc = data.get("description")
            if isinstance(desc, dict):
                return str(desc.get("description") or desc)
            return str(err)
        if isinstance(err, int) and err != 0:
            return str(data.get("description") or f"error_code={err}")
    extra = payload.get("extra")
    if isinstance(extra, dict) and extra.get("error_code") not in (0, "0", None):
        return str(extra.get("description") or extra.get("sub_description") or extra)
    return None


def _publish_with_sdk(
    *,
    video_path: str,
    title: str,
    description: str,
    open_id: str,
    access_token: str,
) -> PublishResult:
    sdk_root = _sdk_root()
    if sdk_root and sdk_root not in sys.path and os.path.isdir(sdk_root):
        sys.path.insert(0, sdk_root)
    from douyin.open.video_create.api.video_publish_api import VideoPublishApi
    from douyin.open.video_create.model.video_create_body import VideoCreateBody

    api = VideoPublishApi()
    upload_resp = api.video_upload_post(video_path, open_id, access_token)
    upload_dict = upload_resp.to_dict() if hasattr(upload_resp, "to_dict") else upload_resp
    err = _api_error(upload_dict)
    if err:
        return PublishResult(success=False, platform="douyin", error=f"开放平台上传失败: {err}")

    video_id = None
    try:
        video_id = upload_dict["data"]["video"]["video_id"]
    except (TypeError, KeyError):
        pass
    if not video_id:
        return PublishResult(success=False, platform="douyin", error="开放平台上传未返回 video_id")

    text = title.strip()
    if description.strip():
        text = f"{text}\n{description.strip()}" if text else description.strip()
    body = VideoCreateBody(video_id=video_id, text=text[:1000], cover_tsp=1.0)
    create_resp = api.video_create_post(open_id, access_token, body=body)
    create_dict = create_resp.to_dict() if hasattr(create_resp, "to_dict") else create_resp
    err = _api_error(create_dict)
    if err:
        return PublishResult(success=False, platform="douyin", error=f"开放平台发布失败: {err}")

    item_id = None
    try:
        item_id = create_dict["data"]["item_id"]
        if isinstance(item_id, dict):
            item_id = item_id.get("item_id") or item_id.get("encrypted_item_id")
    except (TypeError, KeyError):
        pass

    return PublishResult(
        success=True,
        platform="douyin",
        post_id=str(item_id or video_id),
        url="https://creator.douyin.com/creator/content/manage",
        metadata={"publish_mode": "open_api", "video_id": video_id},
    )


def _upload_video_httpx(client: httpx.Client, video_path: str, open_id: str, access_token: str) -> str:
    size = os.path.getsize(video_path)
    if size <= CHUNK_SIZE:
        with open(video_path, "rb") as f:
            resp = client.post(
                f"{OPEN_API_BASE}/video/upload/",
                params={"open_id": open_id, "access_token": access_token},
                files={"video": (os.path.basename(video_path), f, "video/mp4")},
                timeout=600.0,
            )
        resp.raise_for_status()
        payload = resp.json()
        err = _api_error(payload)
        if err:
            raise RuntimeError(err)
        video_id = payload.get("data", {}).get("video", {}).get("video_id")
        if not video_id:
            raise RuntimeError(f"upload response missing video_id: {json.dumps(payload, ensure_ascii=False)[:500]}")
        return str(video_id)

    init_resp = client.post(
        f"{OPEN_API_BASE}/video/part/init/",
        params={"open_id": open_id, "access_token": access_token},
        timeout=60.0,
    )
    init_resp.raise_for_status()
    init_payload = init_resp.json()
    err = _api_error(init_payload)
    if err:
        raise RuntimeError(err)
    upload_id = init_payload.get("data", {}).get("upload_id")
    if not upload_id:
        raise RuntimeError("part init missing upload_id")

    part_number = 1
    with open(video_path, "rb") as f:
        while True:
            chunk = f.read(CHUNK_SIZE)
            if not chunk:
                break
            part_resp = client.post(
                f"{OPEN_API_BASE}/video/part/upload/",
                params={
                    "open_id": open_id,
                    "access_token": access_token,
                    "upload_id": upload_id,
                    "part_number": part_number,
                },
                files={"video": (f"part{part_number}.mp4", chunk, "video/mp4")},
                timeout=600.0,
            )
            part_resp.raise_for_status()
            part_payload = part_resp.json()
            err = _api_error(part_payload)
            if err:
                raise RuntimeError(err)
            part_number += 1

    complete_resp = client.post(
        f"{OPEN_API_BASE}/video/part/complete/",
        params={"open_id": open_id, "access_token": access_token, "upload_id": upload_id},
        timeout=120.0,
    )
    complete_resp.raise_for_status()
    complete_payload = complete_resp.json()
    err = _api_error(complete_payload)
    if err:
        raise RuntimeError(err)
    video_id = complete_payload.get("data", {}).get("video", {}).get("video_id")
    if not video_id:
        raise RuntimeError("part complete missing video_id")
    return str(video_id)


def _publish_with_httpx(
    *,
    video_path: str,
    title: str,
    description: str,
    open_id: str,
    access_token: str,
) -> PublishResult:
    text = title.strip()
    if description.strip():
        text = f"{text}\n{description.strip()}" if text else description.strip()
    with httpx.Client(timeout=600.0) as client:
        video_id = _upload_video_httpx(client, video_path, open_id, access_token)
        create_resp = client.post(
            f"{OPEN_API_BASE}/video/create/",
            params={"open_id": open_id, "access_token": access_token},
            json={"video_id": video_id, "text": text[:1000], "cover_tsp": 1.0},
            timeout=120.0,
        )
        create_resp.raise_for_status()
        payload = create_resp.json()
        err = _api_error(payload)
        if err:
            return PublishResult(success=False, platform="douyin", error=f"开放平台发布失败: {err}")
        item_id = payload.get("data", {}).get("item_id")
        if isinstance(item_id, dict):
            item_id = item_id.get("item_id") or item_id.get("encrypted_item_id")
    return PublishResult(
        success=True,
        platform="douyin",
        post_id=str(item_id or video_id),
        url="https://creator.douyin.com/creator/content/manage",
        metadata={"publish_mode": "open_api", "video_id": video_id},
    )


def publish_douyin_open_api_sync(
    *,
    video_path: str,
    title: str,
    description: str,
    credentials: Dict[str, Any],
) -> PublishResult:
    open_id = str(credentials.get("open_id") or "").strip()
    access_token = str(credentials.get("access_token") or "").strip()
    if not open_id or not access_token:
        return PublishResult(success=False, platform="douyin", error="缺少 open_id 或 access_token")

    sdk_root = _sdk_root()
    if os.path.isdir(sdk_root):
        try:
            return _publish_with_sdk(
                video_path=video_path,
                title=title,
                description=description,
                open_id=open_id,
                access_token=access_token,
            )
        except Exception as exc:
            logger.warning("douyin SDK publish failed, fallback httpx: %s", exc)

    try:
        return _publish_with_httpx(
            video_path=video_path,
            title=title,
            description=description,
            open_id=open_id,
            access_token=access_token,
        )
    except Exception as exc:
        logger.exception("douyin open api publish failed")
        return PublishResult(success=False, platform="douyin", error=f"开放平台发布异常: {exc}")


async def publish_douyin_open_api(
    *,
    video_path: str,
    title: str,
    description: str,
    credentials: Dict[str, Any],
) -> PublishResult:
    return await asyncio.to_thread(
        publish_douyin_open_api_sync,
        video_path=video_path,
        title=title,
        description=description,
        credentials=credentials,
    )

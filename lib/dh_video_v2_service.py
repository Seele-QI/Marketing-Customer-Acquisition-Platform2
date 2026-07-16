# -*- coding: utf-8 -*-
"""数字人视频创作（新）— aicost Seedance 2.0 Fast 客户端 + 多段拼接"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import logging
import os
import re
import subprocess
import tempfile
import time
from dataclasses import dataclass
from typing import Any, Callable

import httpx

from lib.video_concat import concatenate_videos_ffmpeg

logger = logging.getLogger("dh_video_v2_service")

DEFAULT_BASE_URL = "https://www.aicost.xyz"
SEEDANCE_AICOST_MODEL = "seedance2.0-fast"
DEFAULT_PRIMARY_MODEL = "SD2.0-480p-fast"
SEGMENT_SEC = 15
POLL_INTERVAL = 5.0
SEEDANCE_FIRST_FRAME_SUFFIX = "\n\n@图1 当前图片为视频固定首帧"
SEEDANCE_MAX_IMAGES = 9
SEEDANCE_MAX_AUDIOS = 3

TERMINAL_OK = {"completed", "succeeded", "success", "SUCCESS"}
TERMINAL_FAIL = {"failed", "failure", "error", "cancelled", "rejected", "timeout", "expired"}


@dataclass(frozen=True)
class SeedanceEndpoint:
    """Seedance 上游渠道：首选 NewAPI + aicost 备选。"""

    name: str
    base_url: str
    api_key: str
    model: str
    media_mode: str = "base64"  # url：先 /v1/assets/uploads；base64：直传 images_base64


def _is_fast_seedance_model(model: str) -> bool:
    """是否走 duration=auto（fast 系）。裸 seedance2.0 / sd2.0 仍用固定秒数。"""
    m = (model or "").strip()
    if not m:
        return False
    lower = m.lower()
    if lower == "seedance2.0-fast":
        return True
    # sd2-福利 / sd2-xxx
    if m.startswith("sd2-") or lower.startswith("sd2-"):
        return True
    # SD2.0-480p-fast / sd2.0-*-fast（须含 fast，避免误伤 seedance2.0）
    if "fast" in lower and (
        lower.startswith("sd2.0")
        or lower.startswith("seedance2.0")
        or "480p-fast" in lower
        or "720p-fast" in lower
    ):
        return True
    return False


def _normalize_media_mode(raw: str | None, default: str = "url") -> str:
    mode = (raw or default).strip().lower()
    return mode if mode in ("url", "base64") else default


def _append_seedance_tier(
    out: list[SeedanceEndpoint],
    *,
    name: str,
    base_url: str,
    api_key: str,
    model: str,
    media_mode: str,
) -> None:
    base = (base_url or "").strip().rstrip("/")
    key = (api_key or "").strip()
    if not base or not key:
        return
    out.append(
        SeedanceEndpoint(
            name=name,
            base_url=base,
            api_key=key,
            model=(model or SEEDANCE_AICOST_MODEL).strip(),
            media_mode=_normalize_media_mode(media_mode),
        )
    )


def list_seedance_endpoints() -> list[SeedanceEndpoint]:
    """首选 → 次选 → 三选；次选/三选缺省时兼容旧 env 别名。"""
    out: list[SeedanceEndpoint] = []

    _append_seedance_tier(
        out,
        name="primary",
        base_url=os.getenv("SEEDANCE_PRIMARY_BASE_URL") or "",
        api_key=os.getenv("SEEDANCE_PRIMARY_API_KEY") or "",
        model=(os.getenv("SEEDANCE_PRIMARY_MODEL") or DEFAULT_PRIMARY_MODEL).strip(),
        media_mode=os.getenv("SEEDANCE_PRIMARY_MEDIA_MODE") or "url",
    )

    sec_base = (os.getenv("SEEDANCE_SECONDARY_BASE_URL") or os.getenv("SEEDANCE_BASE_URL") or "").strip()
    sec_key = (os.getenv("SEEDANCE_SECONDARY_API_KEY") or os.getenv("SEEDANCE_API_KEY") or os.getenv("AICOST_API_KEY") or "").strip()
    sec_model = (os.getenv("SEEDANCE_SECONDARY_MODEL") or SEEDANCE_AICOST_MODEL).strip()
    sec_media = os.getenv("SEEDANCE_SECONDARY_MEDIA_MODE") or "base64"
    _append_seedance_tier(
        out,
        name="secondary",
        base_url=sec_base or DEFAULT_BASE_URL,
        api_key=sec_key,
        model=sec_model,
        media_mode=sec_media,
    )

    ter_base = (os.getenv("SEEDANCE_TERTIARY_BASE_URL") or os.getenv("XINGHE_BASE_URL") or DEFAULT_BASE_URL).strip()
    ter_key = (os.getenv("SEEDANCE_TERTIARY_API_KEY") or os.getenv("XINGHE_API_KEY") or "").strip()
    ter_model = (os.getenv("SEEDANCE_TERTIARY_MODEL") or SEEDANCE_AICOST_MODEL).strip()
    ter_media = os.getenv("SEEDANCE_TERTIARY_MEDIA_MODE") or "base64"
    _append_seedance_tier(
        out,
        name="tertiary",
        base_url=ter_base,
        api_key=ter_key,
        model=ter_model,
        media_mode=ter_media,
    )

    # 去重：同一 base_url+api_key 只保留首次出现
    seen: set[tuple[str, str]] = set()
    deduped: list[SeedanceEndpoint] = []
    for ep in out:
        sig = (ep.base_url, ep.api_key)
        if sig in seen:
            continue
        seen.add(sig)
        deduped.append(ep)
    return deduped


def get_seedance_endpoint(name: str | None = None) -> SeedanceEndpoint:
    endpoints = list_seedance_endpoints()
    if not endpoints:
        raise RuntimeError("SEEDANCE_API_KEY 未配置")
    if name:
        for ep in endpoints:
            if ep.name == name:
                return ep
    return endpoints[0]


def segment_poll_timeout() -> float:
    raw = (os.getenv("DH_V2_SEGMENT_POLL_TIMEOUT") or "3000").strip()
    try:
        return max(60.0, float(raw))
    except ValueError:
        return 3000.0


def task_timeout() -> float:
    """整任务超时（秒），默认 3000 = 50 分钟。"""
    raw = (os.getenv("DH_V2_TASK_TIMEOUT") or os.getenv("DH_V2_SEGMENT_POLL_TIMEOUT") or "3000").strip()
    try:
        return max(60.0, float(raw))
    except ValueError:
        return 3000.0


# 兼容旧引用
MAX_POLL_WAIT = segment_poll_timeout()


def _api_key() -> str:
    return (os.getenv("SEEDANCE_API_KEY") or os.getenv("AICOST_API_KEY") or "").strip()


def _base_url() -> str:
    return (os.getenv("SEEDANCE_BASE_URL") or DEFAULT_BASE_URL).rstrip("/")


def _ffmpeg_exe() -> str:
    local = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "tools",
        "ffmpeg",
        "bin",
        "ffmpeg.exe",
    )
    if os.path.isfile(local):
        return local
    return os.environ.get("FFMPEG_EXE") or "ffmpeg"


def _pick_video_url(data: dict) -> str:
    for key in ("result_url", "video_url", "url", "stable_video_url"):
        v = data.get(key)
        if isinstance(v, str) and v.strip():
            return v.strip()
    inner = data.get("data")
    if isinstance(inner, dict):
        for key in ("result_url", "video_url", "url", "stable_video_url"):
            v = inner.get(key)
            if isinstance(v, str) and v.strip():
                return v.strip()
    for bucket in ("results", "data"):
        items = data.get(bucket)
        if isinstance(items, list):
            for item in items:
                if isinstance(item, dict):
                    u = (item.get("url") or "").strip()
                    if u:
                        return u
    return ""


def _normalize_status(raw: str) -> str:
    return (raw or "unknown").strip().lower()


def _ensure_data_url(raw: str, default_mime: str) -> str:
    """纯 base64 → data URL（接口两种格式均支持，data URL 与 verify 脚本一致）。"""
    s = (raw or "").strip()
    if not s:
        return s
    if s.startswith("data:"):
        return s
    return f"data:{default_mime};base64,{s}"


def _normalize_images_base64(items: list[str] | None) -> list[str] | None:
    if not items:
        return None
    out: list[str] = []
    for item in items:
        s = (item or "").strip()
        if not s:
            continue
        out.append(_ensure_data_url(s, "image/jpeg"))
    return out or None


def _normalize_audios_base64(items: list[str] | None) -> list[str] | None:
    if not items:
        return None
    out: list[str] = []
    for item in items:
        s = (item or "").strip()
        if not s:
            continue
        mp3_bytes = _prepare_audio_mp3_bytes(s)
        b64 = base64.b64encode(mp3_bytes).decode("ascii")
        out.append(f"data:audio/mpeg;base64,{b64}")
    return out or None


def resolve_seedance_mode(
    mode: str | None,
    *,
    image_count: int,
    has_audio: bool = False,
) -> str:
    """数字人视频创作：有参考图一律首帧图生（可叠加音频参考），禁止误走文生。"""
    del mode, has_audio  # dh-v2 产品固定首帧语义
    if image_count < 1:
        return "text"
    return "first_frame"


def finalize_seedance_prompt(
    prompt: str,
    *,
    mode: str,
    image_count: int,
    has_audio: bool = False,
) -> str:
    """按 seedance 文档补全 @图1 / 首帧 / @音频1 语义，避免上游判为文生视频。"""
    p = (prompt or "").strip()
    if image_count < 1 or mode == "text":
        return p

    if mode == "first_frame":
        if "@图1" not in p:
            p = f"参考 @图1 中的人物形象与场景，{p}" if p else "参考 @图1 中的人物形象与场景"
        if "当前图片为视频固定首帧" not in p and "固定首帧" not in p:
            p += SEEDANCE_FIRST_FRAME_SUFFIX
    elif mode == "multimodal":
        if "@图1" not in p:
            p = f"参考 @图1 中的人物与场景，{p}" if p else "参考 @图1 中的人物与场景"

    if has_audio and "@音频1" not in p:
        p += " @音频1 驱动口型节奏"

    return p


def _attach_seedance_base64_fields(
    payload: dict[str, Any],
    *,
    images_base64: list[str] | None,
    audios_base64: list[str] | None,
) -> None:
    """aicost 等渠道：直传 base64（勿写入 reference_images/images 别名，避免网关误判）。"""
    imgs = _normalize_images_base64(images_base64)
    if imgs:
        payload["images_base64"] = imgs[:SEEDANCE_MAX_IMAGES]

    auds = _normalize_audios_base64(audios_base64)
    if auds:
        payload["audios_base64"] = auds[:SEEDANCE_MAX_AUDIOS]


def _attach_seedance_url_fields(
    payload: dict[str, Any],
    *,
    image_urls: list[str] | None,
    audio_urls: list[str] | None,
) -> None:
    """7tai 等渠道：仅公网 URL（须先 POST /v1/assets/uploads）。"""
    imgs = [u.strip() for u in (image_urls or []) if str(u or "").strip().startswith(("http://", "https://"))]
    if imgs:
        imgs = imgs[:SEEDANCE_MAX_IMAGES]
        payload["reference_image_urls"] = imgs
        payload["image_urls"] = imgs
        if len(imgs) == 1:
            payload["image_url"] = imgs[0]

    auds = [u.strip() for u in (audio_urls or []) if str(u or "").strip().startswith(("http://", "https://"))]
    if auds:
        auds = auds[:SEEDANCE_MAX_AUDIOS]
        payload["audio_urls"] = auds
        payload["reference_audio_urls"] = auds
        payload["reference_audios"] = auds
        if len(auds) == 1:
            payload["audio_url"] = auds[0]
            payload["reference_audio"] = auds[0]


def _strip_inline_media_fields(payload: dict[str, Any]) -> None:
    """URL 模式：移除一切 base64/内联字段，避免 7tai 误判为本地素材。"""
    for key in (
        "images_base64",
        "image_base64",
        "audios_base64",
        "audio_base64",
        "audio_base64s",
        "reference_images",
        "images",
    ):
        payload.pop(key, None)


def _mime_to_ext(mime: str, default: str) -> str:
    m = (mime or "").lower()
    if "png" in m:
        return "png"
    if "webp" in m:
        return "webp"
    if "gif" in m:
        return "gif"
    if "mp4" in m or "m4a" in m or "x-m4a" in m:
        return "m4a"
    if "wav" in m:
        return "wav"
    if "mpeg" in m or "mp3" in m:
        return "mp3"
    if "jpeg" in m or "jpg" in m:
        return "jpg"
    return default


def _decode_media_item(raw: str, *, default_mime: str, default_ext: str) -> tuple[bytes, str, str]:
    s = (raw or "").strip()
    if not s:
        raise ValueError("素材为空")
    m = re.match(r"^data:([^;]+);base64,(.+)$", s, re.I | re.S)
    if m:
        mime = m.group(1).strip() or default_mime
        data = base64.b64decode(m.group(2).strip())
        return data, mime, _mime_to_ext(mime, default_ext)
    data = base64.b64decode(s)
    return data, default_mime, default_ext


def _default_audio_mime_ext(raw: str) -> tuple[str, str]:
    s = (raw or "").strip().lower()
    if "audio/mp4" in s or "audio/x-m4a" in s or "audio/m4a" in s:
        return "audio/mp4", "m4a"
    if "audio/wav" in s or "audio/x-wav" in s:
        return "audio/wav", "wav"
    if "audio/mpeg" in s or "audio/mp3" in s:
        return "audio/mpeg", "mp3"
    return "audio/mpeg", "mp3"


def _looks_like_mp3(data: bytes) -> bool:
    if len(data) < 4:
        return False
    if data[:3] == b"ID3":
        return True
    return data[0] == 0xFF and (data[1] & 0xE0) == 0xE0


def _prepare_audio_mp3_bytes(raw: str) -> bytes:
    """Seedance audio_url 仅稳定支持 MP3；m4a/wav 等先 ffmpeg 转码再上传/提交。"""
    data, mime, ext = _decode_media_item(raw, default_mime="audio/mpeg", default_ext="mp3")
    if ext == "mp3" and mime in ("audio/mpeg", "audio/mp3") and _looks_like_mp3(data):
        return data

    ffmpeg = _ffmpeg_exe()
    with tempfile.TemporaryDirectory(prefix="dhv2_audio_") as tmp:
        src_path = os.path.join(tmp, f"input.{ext}")
        dst_path = os.path.join(tmp, "output.mp3")
        with open(src_path, "wb") as f:
            f.write(data)
        cmd = [
            ffmpeg,
            "-hide_banner",
            "-nostdin",
            "-y",
            "-i",
            src_path,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "44100",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "2",
            dst_path,
        ]
        try:
            proc = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=120,
            )
        except FileNotFoundError as e:
            raise RuntimeError(f"未找到 ffmpeg，无法转换参考音频: {e}") from e
        except subprocess.TimeoutExpired as e:
            raise RuntimeError("参考音频转 MP3 超时") from e
        if proc.returncode != 0 or not os.path.isfile(dst_path):
            err = (proc.stderr or proc.stdout or "ffmpeg 失败").strip()[:400]
            raise RuntimeError(f"参考音频转 MP3 失败: {err}")
        mp3_data = open(dst_path, "rb").read()
        if len(mp3_data) < 128:
            raise RuntimeError("参考音频转 MP3 后文件过小")
        logger.info(
            "参考音频已转 MP3 (%s → mp3, %s bytes → %s bytes)",
            ext,
            len(data),
            len(mp3_data),
        )
        return mp3_data


UPLOAD_CACHE_AUDIO_CODEC = "mp3"


def _uploaded_media_cache_path(refs_dir: str) -> str:
    return os.path.join(refs_dir, "seedance_uploaded_urls.json")


def _load_uploaded_media_cache(
    refs_dir: str,
    endpoint_name: str,
    *,
    image_count: int,
    audio_count: int,
) -> tuple[list[str], list[str]] | None:
    path = _uploaded_media_cache_path(refs_dir)
    if not os.path.isfile(path):
        return None
    try:
        import json

        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        block = data.get(endpoint_name) if isinstance(data, dict) else None
        if not isinstance(block, dict):
            return None
        if block.get("audio_codec") != UPLOAD_CACHE_AUDIO_CODEC:
            return None
        image_urls = block.get("image_urls") or []
        audio_urls = block.get("audio_urls") or []
        if not isinstance(image_urls, list) or not isinstance(audio_urls, list):
            return None
        if len(image_urls) != image_count or len(audio_urls) != audio_count:
            return None
        if image_count and not all(str(u).startswith(("http://", "https://")) for u in image_urls):
            return None
        if audio_count and not all(str(u).startswith(("http://", "https://")) for u in audio_urls):
            return None
        return [str(u) for u in image_urls], [str(u) for u in audio_urls]
    except Exception:
        return None


def _save_uploaded_media_cache(
    refs_dir: str,
    endpoint_name: str,
    *,
    image_urls: list[str],
    audio_urls: list[str],
) -> None:
    import json

    os.makedirs(refs_dir, exist_ok=True)
    path = _uploaded_media_cache_path(refs_dir)
    data: dict[str, Any] = {}
    if os.path.isfile(path):
        try:
            with open(path, encoding="utf-8") as f:
                loaded = json.load(f)
            if isinstance(loaded, dict):
                data = loaded
        except Exception:
            data = {}
    data[endpoint_name] = {
        "image_urls": image_urls,
        "audio_urls": audio_urls,
        "audio_codec": UPLOAD_CACHE_AUDIO_CODEC,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)


def _media_fingerprint(raw: str) -> str:
    data, _, _ = _decode_media_item(raw, default_mime="application/octet-stream", default_ext="bin")
    return hashlib.sha256(data).hexdigest()[:24]


def _pick_asset_url(data: dict[str, Any]) -> str:
    for key in ("url", "file_url", "public_url", "download_url", "asset_url"):
        v = data.get(key)
        if isinstance(v, str) and v.strip().startswith(("http://", "https://")):
            return v.strip()
    inner = data.get("data")
    if isinstance(inner, dict):
        for key in ("url", "file_url", "public_url", "download_url", "asset_url"):
            v = inner.get(key)
            if isinstance(v, str) and v.strip().startswith(("http://", "https://")):
                return v.strip()
    if isinstance(inner, str) and inner.strip().startswith(("http://", "https://")):
        return inner.strip()
    raise RuntimeError(f"素材上传响应无公网 URL: {str(data)[:400]}")


_asset_url_cache: dict[tuple[str, str, str], str] = {}


async def upload_seedance_asset_to_url(
    ep: SeedanceEndpoint,
    *,
    raw: str,
    kind: str,
    default_mime: str,
    default_ext: str,
) -> str:
    """7tai：POST /v1/assets/uploads → 公网 URL（同任务内缓存，避免多段重复上传）。"""
    if kind == "audio":
        data = _prepare_audio_mp3_bytes(raw)
        mime, ext = "audio/mpeg", "mp3"
        fingerprint = hashlib.sha256(data).hexdigest()[:24]
    else:
        fingerprint = _media_fingerprint(raw)
        data, mime, ext = _decode_media_item(raw, default_mime=default_mime, default_ext=default_ext)

    cache_key = (ep.name, kind, fingerprint)
    cached = _asset_url_cache.get(cache_key)
    if cached:
        return cached

    filename = f"dhv2_{kind}_{fingerprint[:8]}.{ext}"
    upload_url = f"{ep.base_url}/v1/assets/uploads"
    headers = {"Authorization": f"Bearer {ep.api_key}"}

    async with _http_client(timeout=180.0) as client:
        resp = await client.post(
            upload_url,
            headers=headers,
            files={"file": (filename, data, mime)},
            data={"type": kind, "asset_type": kind},
        )
        if resp.status_code >= 400:
            resp2 = await client.post(
                upload_url,
                headers={**headers, "Content-Type": "application/json"},
                json={
                    "filename": filename,
                    "content_type": mime,
                    "type": kind,
                    "asset_type": kind,
                    "data": base64.b64encode(data).decode("ascii"),
                },
            )
            if resp2.status_code >= 400:
                raise RuntimeError(
                    f"素材上传失败 multipart({resp.status_code}): {resp.text[:300]}; "
                    f"json({resp2.status_code}): {resp2.text[:300]}"
                )
            public_url = _pick_asset_url(resp2.json())
        else:
            public_url = _pick_asset_url(resp.json())

    _asset_url_cache[cache_key] = public_url
    logger.info("Seedance 素材已上传 %s kind=%s url=%s", ep.name, kind, public_url[:80])
    return public_url


async def _upload_reference_media_urls(
    ep: SeedanceEndpoint,
    *,
    images_base64: list[str] | None,
    audios_base64: list[str] | None,
    refs_dir: str | None = None,
) -> tuple[list[str], list[str]]:
    image_items = [str(x) for x in (images_base64 or []) if str(x or "").strip()]
    audio_items = [str(x) for x in (audios_base64 or []) if str(x or "").strip()]

    if refs_dir:
        cached = _load_uploaded_media_cache(
            refs_dir,
            ep.name,
            image_count=len(image_items),
            audio_count=len(audio_items),
        )
        if cached:
            return cached

    image_urls: list[str] = []
    for raw in image_items:
        image_urls.append(
            await upload_seedance_asset_to_url(
                ep,
                raw=raw,
                kind="image",
                default_mime="image/jpeg",
                default_ext="jpg",
            )
        )
    audio_urls: list[str] = []
    for raw in audio_items:
        audio_urls.append(
            await upload_seedance_asset_to_url(
                ep,
                raw=raw,
                kind="audio",
                default_mime="audio/mpeg",
                default_ext="mp3",
            )
        )

    if refs_dir:
        _save_uploaded_media_cache(
            refs_dir,
            ep.name,
            image_urls=image_urls,
            audio_urls=audio_urls,
        )
    return image_urls, audio_urls


async def build_seedance_submit_payload_for_endpoint(
    ep: SeedanceEndpoint,
    *,
    model: str,
    prompt: str,
    aspect_ratio: str,
    segment_sec: int,
    images_base64: list[str] | None,
    audios_base64: list[str] | None,
    client_task_id: str | None,
    mode: str | None,
    media_refs_dir: str | None = None,
) -> dict[str, Any]:
    if ep.media_mode == "url":
        image_urls, audio_urls = await _upload_reference_media_urls(
            ep,
            images_base64=images_base64,
            audios_base64=audios_base64,
            refs_dir=media_refs_dir,
        )
        return build_seedance_submit_payload(
            model=model,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            segment_sec=segment_sec,
            image_urls=image_urls,
            audio_urls=audio_urls or None,
            client_task_id=client_task_id,
            mode=mode,
            media_mode="url",
        )
    return build_seedance_submit_payload(
        model=model,
        prompt=prompt,
        aspect_ratio=aspect_ratio,
        segment_sec=segment_sec,
        images_base64=images_base64,
        audios_base64=audios_base64,
        client_task_id=client_task_id,
        mode=mode,
        media_mode="base64",
    )


def build_seedance_submit_payload(
    *,
    model: str,
    prompt: str,
    aspect_ratio: str = "9:16",
    segment_sec: int = SEGMENT_SEC,
    images_base64: list[str] | None = None,
    audios_base64: list[str] | None = None,
    image_urls: list[str] | None = None,
    audio_urls: list[str] | None = None,
    client_task_id: str | None = None,
    mode: str | None = "first_frame",
    media_mode: str = "base64",
) -> dict[str, Any]:
    """按 seedance系列接口文档 组装 POST /v1/videos 请求体（图生/首帧+参考图）。"""
    media_mode = (media_mode or "base64").strip().lower()
    img_count = len(image_urls or []) or len([x for x in (images_base64 or []) if str(x or "").strip()])
    has_audio = bool(
        (audio_urls and any(str(x or "").strip() for x in audio_urls))
        or (audios_base64 and any(str(x or "").strip() for x in audios_base64))
    )
    seedance_mode = resolve_seedance_mode(mode, image_count=img_count, has_audio=has_audio)
    final_prompt = finalize_seedance_prompt(
        prompt,
        mode=seedance_mode,
        image_count=img_count,
        has_audio=has_audio,
    )

    payload: dict[str, Any] = {
        "model": model or SEEDANCE_AICOST_MODEL,
        "prompt": final_prompt,
        "aspect_ratio": aspect_ratio or "9:16",
        "resolution": "720p",
    }
    if _is_fast_seedance_model(payload["model"]):
        payload["duration"] = "auto"
        payload["seconds"] = str(segment_sec)
    else:
        sec = max(4, min(int(segment_sec), 15))
        payload["duration"] = sec

    if media_mode == "url":
        if not image_urls:
            raise ValueError("URL 模式需至少 1 张已上传参考图")
        _attach_seedance_url_fields(payload, image_urls=image_urls, audio_urls=audio_urls)
        _strip_inline_media_fields(payload)
    else:
        _attach_seedance_base64_fields(payload, images_base64=images_base64, audios_base64=audios_base64)

    if img_count < 1 and seedance_mode != "text":
        raise ValueError("Seedance 图生视频需至少 1 张参考图")

    if client_task_id:
        payload["client_task_id"] = client_task_id
    return payload


def _http_client(**kwargs) -> httpx.AsyncClient:
    """直连 aicost，避免 Windows 系统代理导致 ConnectError。"""
    return httpx.AsyncClient(trust_env=False, **kwargs)


async def _post_seedance_json(
    *,
    url: str,
    headers: dict[str, str],
    payload: dict[str, Any],
    retries: int,
) -> dict[str, Any]:
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            async with _http_client(timeout=120.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code >= 400:
                    raise RuntimeError(f"HTTP {resp.status_code}: {resp.text[:500]}")
                return resp.json()
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as e:
            last_err = e
            if attempt + 1 < retries:
                wait = 3.0 * (attempt + 1)
                logger.warning("Seedance 提交网络错误，%ss 后重试 (%s/%s): %s", wait, attempt + 1, retries, e)
                await asyncio.sleep(wait)
                continue
            raise
        except RuntimeError:
            raise
    raise RuntimeError(f"Seedance 提交失败: {last_err}")


async def submit_aicost_seedance(
    *,
    prompt: str,
    images_base64: list[str] | None = None,
    audios_base64: list[str] | None = None,
    aspect_ratio: str = "9:16",
    client_task_id: str | None = None,
    model: str | None = None,
    segment_sec: int = SEGMENT_SEC,
    mode: str | None = None,
    retries: int = 4,
    media_refs_dir: str | None = None,
) -> dict[str, Any]:
    endpoints = list_seedance_endpoints()
    if not endpoints:
        raise RuntimeError("SEEDANCE_API_KEY 未配置")

    imgs = _normalize_images_base64(images_base64)
    if not imgs:
        raise RuntimeError("Seedance 图生视频需至少 1 张参考图（images_base64）")

    errors: list[str] = []
    for i, ep in enumerate(endpoints):
        use_model = ep.model
        if model and ep.name in ("secondary", "fallback"):
            use_model = model.strip()
        payload = await build_seedance_submit_payload_for_endpoint(
            ep,
            model=use_model,
            prompt=prompt,
            aspect_ratio=aspect_ratio,
            segment_sec=segment_sec,
            images_base64=images_base64,
            audios_base64=audios_base64,
            client_task_id=client_task_id,
            mode=mode,
            media_refs_dir=media_refs_dir,
        )
        url = f"{ep.base_url}/v1/videos"
        headers = {"Authorization": f"Bearer {ep.api_key}", "Content-Type": "application/json"}
        attempt_retries = retries if i == len(endpoints) - 1 else min(2, retries)
        img_n = len(
            payload.get("image_urls")
            or payload.get("reference_image_urls")
            or payload.get("images_base64")
            or []
        )
        aud_n = len(
            payload.get("audio_urls")
            or payload.get("reference_audio_urls")
            or payload.get("audios_base64")
            or []
        )
        logger.info(
            "Seedance 提交 %s model=%s media=%s mode=%s images=%s audios=%s prompt_len=%s",
            ep.name,
            use_model,
            ep.media_mode,
            resolve_seedance_mode(mode, image_count=img_n, has_audio=aud_n > 0),
            img_n,
            aud_n,
            len(str(payload.get("prompt") or "")),
        )
        try:
            data = await _post_seedance_json(
                url=url,
                headers=headers,
                payload=payload,
                retries=attempt_retries,
            )
            upstream_id = str(data.get("id") or data.get("task_id") or "").strip()
            if not upstream_id:
                errors.append(f"{ep.name}: 未返回任务 ID")
                logger.warning("Seedance %s 响应无任务 ID，尝试下一渠道", ep.name)
                continue
            data["_seedance_endpoint"] = ep.name
            if i > 0:
                logger.warning(
                    "Seedance 已回退到 %s (%s, model=%s)",
                    ep.name,
                    ep.base_url,
                    use_model,
                )
            return data
        except Exception as e:
            msg = str(e) or ep.name
            errors.append(f"{ep.name}: {msg}")
            if i + 1 < len(endpoints):
                logger.warning("Seedance %s 失败，尝试备选渠道: %s", ep.name, msg)
                continue
            raise RuntimeError(f"Seedance 全部渠道失败: {'; '.join(errors)}") from e

    raise RuntimeError(f"Seedance 全部渠道失败: {'; '.join(errors)}")


def _extract_status(data: dict) -> str:
    raw = data.get("status")
    if not raw:
        inner = data.get("data")
        if isinstance(inner, dict):
            raw = inner.get("status")
    return _normalize_status(str(raw or ""))


async def poll_aicost_task(
    task_id: str,
    *,
    max_wait: float | None = None,
    endpoint_name: str | None = None,
) -> dict[str, Any]:
    ep = get_seedance_endpoint(endpoint_name)
    headers = {"Authorization": f"Bearer {ep.api_key}"}
    url = f"{ep.base_url}/v1/videos/{task_id}"
    deadline = time.monotonic() + (max_wait if max_wait is not None else segment_poll_timeout())
    network_blips = 0
    max_network_blips = 120

    async with _http_client(timeout=60.0) as client:
        while time.monotonic() < deadline:
            try:
                resp = await client.get(url, headers=headers)
            except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as e:
                network_blips += 1
                if network_blips > max_network_blips:
                    raise RuntimeError(f"Seedance 轮询网络不稳定（已重试 {network_blips} 次）: {e}") from e
                logger.warning("Seedance 轮询网络抖动，%ss 后重试: %s", POLL_INTERVAL, e)
                await asyncio.sleep(POLL_INTERVAL)
                continue
            if resp.status_code >= 400:
                raise RuntimeError(f"Seedance 轮询失败 ({resp.status_code}): {resp.text[:300]}")
            data = resp.json()
            status = _extract_status(data)
            if status in TERMINAL_OK or status == "completed":
                if not _pick_video_url(data):
                    await asyncio.sleep(POLL_INTERVAL)
                    continue
                return data
            if status in TERMINAL_FAIL:
                err = data.get("error") or data.get("message") or status
                raise RuntimeError(f"Seedance 任务失败: {err}")
            await asyncio.sleep(POLL_INTERVAL)
    raise TimeoutError(f"Seedance 任务超时 ({task_id})")


def _normalize_download_url(url: str, upstream_id: str = "", *, base_url: str | None = None) -> str:
    base = (base_url or _base_url()).rstrip("/")
    u = (url or "").strip()
    if not u and upstream_id:
        return f"{base}/v1/videos/{upstream_id}/content"
    if "/v1/videos/" in u and not u.rstrip("/").endswith("/content"):
        return f"{u.rstrip('/')}/content"
    return u


def _download_retries_default() -> int:
    try:
        return max(1, int(os.getenv("DH_V2_DOWNLOAD_RETRIES", "6")))
    except ValueError:
        return 6


def _download_retry_base_sec() -> float:
    try:
        return max(1.0, float(os.getenv("DH_V2_DOWNLOAD_RETRY_BASE_SEC", "3")))
    except ValueError:
        return 3.0


def _is_likely_mp4(data: bytes, content_type: str = "") -> bool:
    if content_type and "video" in content_type.lower():
        return True
    if len(data) < 12:
        return False
    if data[4:8] == b"ftyp":
        return True
    return b"ftyp" in data[:32]


def _is_api_content_url(fetch_url: str, base_url: str) -> bool:
    base = base_url.rstrip("/")
    return fetch_url.startswith(base) and "/v1/videos/" in fetch_url


def _log_download_failure(
    *,
    context: str,
    fetch_url: str,
    attempt: int,
    retries: int,
    exc: Exception,
    resp: httpx.Response | None = None,
) -> None:
    parts = [
        f"context={context}",
        f"url={fetch_url[:200]}",
        f"attempt={attempt}/{retries}",
        f"err={exc!r}",
    ]
    if resp is not None:
        ct = resp.headers.get("content-type", "")
        preview = ""
        try:
            if any(x in ct for x in ("text", "json", "html")):
                preview = resp.text[:200]
            elif resp.content:
                preview = repr(resp.content[:80])
        except Exception:
            pass
        parts.append(f"status={resp.status_code} content-type={ct} preview={preview}")
    logger.warning("DH v2 download failed: %s", " | ".join(parts))


async def _fetch_video_bytes(
    fetch_url: str,
    headers: dict[str, str] | None,
    *,
    timeout: float = 300.0,
) -> bytes:
    async with _http_client(timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(fetch_url, headers=headers or {})
        resp.raise_for_status()
        data = resp.content
        ct = resp.headers.get("content-type", "")
    if len(data) < 1024:
        raise RuntimeError(f"下载的视频过小 ({len(data)} bytes)，可能不是有效 mp4")
    if not _is_likely_mp4(data, ct):
        preview = data[:200].decode("utf-8", errors="replace") if data else ""
        raise RuntimeError(
            f"响应不是有效 MP4 (content-type={ct}, size={len(data)}): {preview[:120]}"
        )
    return data


async def download_video_file(
    url: str,
    dest_path: str,
    *,
    upstream_id: str = "",
    endpoint_name: str | None = None,
    retries: int | None = None,
    debug_context: str = "",
) -> str:
    ep = get_seedance_endpoint(endpoint_name)
    auth_headers = {"Authorization": f"Bearer {ep.api_key}"}
    base = ep.base_url.rstrip("/")
    total_retries = retries if retries is not None else _download_retries_default()
    base_sec = _download_retry_base_sec()
    ctx = debug_context or "download"

    primary_url = _normalize_download_url(url, upstream_id, base_url=ep.base_url)
    content_url = f"{base}/v1/videos/{upstream_id}/content" if upstream_id else ""

    url_plans: list[tuple[str, bool]] = [(primary_url, True)]
    if content_url and content_url != primary_url:
        url_plans.append((content_url, True))

    last_err: Exception | None = None
    for attempt in range(total_retries):
        plans = list(url_plans)
        if attempt > 0 and len(plans) > 1:
            plans = [plans[-1]] + plans[:-1]

        for fetch_url, use_auth in plans:
            hdrs = auth_headers if use_auth else {}
            try:
                data = await _fetch_video_bytes(fetch_url, hdrs)
                with open(dest_path, "wb") as f:
                    f.write(data)
                logger.info(
                    "DH v2 download OK: context=%s url=%s bytes=%s auth=%s",
                    ctx,
                    fetch_url[:120],
                    len(data),
                    use_auth,
                )
                return dest_path
            except httpx.HTTPStatusError as e:
                last_err = e
                _log_download_failure(
                    context=ctx,
                    fetch_url=fetch_url,
                    attempt=attempt + 1,
                    retries=total_retries,
                    exc=e,
                    resp=e.response,
                )
                if (
                    use_auth
                    and e.response.status_code in (401, 403)
                    and not _is_api_content_url(fetch_url, base)
                ):
                    try:
                        data = await _fetch_video_bytes(fetch_url, {})
                        with open(dest_path, "wb") as f:
                            f.write(data)
                        logger.info(
                            "DH v2 download OK (no auth): context=%s url=%s bytes=%s",
                            ctx,
                            fetch_url[:120],
                            len(data),
                        )
                        return dest_path
                    except Exception as e2:
                        last_err = e2
                        _log_download_failure(
                            context=f"{ctx}/no-auth",
                            fetch_url=fetch_url,
                            attempt=attempt + 1,
                            retries=total_retries,
                            exc=e2,
                            resp=getattr(e2, "response", None),
                        )
            except Exception as e:
                last_err = e
                _log_download_failure(
                    context=ctx,
                    fetch_url=fetch_url,
                    attempt=attempt + 1,
                    retries=total_retries,
                    exc=e,
                    resp=getattr(e, "response", None) if isinstance(e, httpx.HTTPStatusError) else None,
                )

        if attempt + 1 < total_retries:
            await asyncio.sleep(base_sec * (attempt + 1))

    raise RuntimeError(f"视频下载失败（已重试 {total_retries} 次）: {last_err}")


def build_segment_prompt(
    base_prompt: str,
    seg_index: int,
    total_segs: int,
    dialogue: str,
    *,
    mode: str = "first_frame",
    image_count: int = 1,
    has_audio: bool = False,
) -> str:
    prompt = (base_prompt or "").strip()
    if total_segs > 1 and seg_index > 0:
        prompt += f"（第 {seg_index + 1}/{total_segs} 段，15 秒，承接前段叙事）"
    dlg = (dialogue or "").strip().replace("\n", " ")[:80]
    if dlg:
        prompt += f" 本段口播：{dlg}"
    return finalize_seedance_prompt(
        prompt,
        mode=resolve_seedance_mode(mode, image_count=image_count, has_audio=has_audio),
        image_count=image_count,
        has_audio=has_audio,
    )


def _max_parallel_segments() -> int:
    raw = (os.getenv("DH_V2_MAX_PARALLEL_SEGMENTS") or "4").strip()
    try:
        n = int(raw)
        return max(1, min(n, 8))
    except ValueError:
        return 4


def _filter_active_segments(segments: list[dict]) -> list[dict]:
    return [s for s in segments if str(s.get("dialogue") or "").strip()]


SegmentUpdateFn = Callable[[int, str, dict[str, Any]], None]


async def _submit_one_segment(
    *,
    seg: dict,
    seg_index: int,
    total_segs: int,
    images_base64: list[str],
    audios_base64: list[str] | None,
    aspect_ratio: str,
    client_task_id: str,
    sem: asyncio.Semaphore,
    on_segment_update: SegmentUpdateFn | None,
    mode: str = "first_frame",
    media_refs_dir: str | None = None,
) -> tuple[int, str | None, str | None, str | None]:
    """返回 (index, upstream_id, endpoint_name, error)。"""
    if on_segment_update:
        on_segment_update(seg_index, "submitting", {})
    has_audio = bool(audios_base64)
    prompt = build_segment_prompt(
        str(seg.get("video_prompt") or ""),
        seg_index,
        total_segs,
        str(seg.get("dialogue") or ""),
        mode=mode,
        image_count=len(images_base64),
        has_audio=has_audio,
    )
    try:
        async with sem:
            submit_res = await submit_aicost_seedance(
                prompt=prompt,
                images_base64=images_base64,
                audios_base64=audios_base64,
                aspect_ratio=aspect_ratio,
                client_task_id=f"{client_task_id}:seg{seg_index}",
                mode=mode,
                media_refs_dir=media_refs_dir,
            )
        upstream_id = str(submit_res.get("id") or submit_res.get("task_id") or "").strip()
        endpoint_name = str(submit_res.get("_seedance_endpoint") or "secondary")
        if not upstream_id:
            err = "Seedance 未返回任务 ID"
            if on_segment_update:
                on_segment_update(seg_index, "failed", {"error": err})
            return seg_index, None, None, err
        if on_segment_update:
            on_segment_update(
                seg_index,
                "processing",
                {"upstream_id": upstream_id, "seedance_endpoint": endpoint_name},
            )
        return seg_index, upstream_id, endpoint_name, None
    except Exception as e:
        err = str(e) or "提交失败"
        if on_segment_update:
            on_segment_update(seg_index, "failed", {"error": err})
        return seg_index, None, None, err


async def _poll_download_one_segment(
    *,
    seg_index: int,
    upstream_id: str,
    output_dir: str,
    sem: asyncio.Semaphore,
    on_segment_update: SegmentUpdateFn | None,
    on_done=None,
    endpoint_name: str | None = None,
) -> tuple[int, str | None, str | None]:
    """返回 (index, local_path, error)。"""
    try:
        async with sem:
            result = await poll_aicost_task(
                upstream_id,
                max_wait=segment_poll_timeout(),
                endpoint_name=endpoint_name,
            )
            video_url = _pick_video_url(result)
            if not video_url:
                err = f"段 {seg_index + 1} 完成但无视频地址"
                if on_segment_update:
                    on_segment_update(seg_index, "failed", {"error": err})
                return seg_index, None, err
            out_path = os.path.join(output_dir, f"segment_{seg_index}.mp4")
            await download_video_file(
                video_url,
                out_path,
                upstream_id=upstream_id,
                endpoint_name=endpoint_name,
                debug_context=f"seg_{seg_index + 1}",
            )
        if on_segment_update:
            on_segment_update(seg_index, "completed", {"local_path": out_path})
        if on_done:
            await on_done(seg_index)
        return seg_index, out_path, None
    except TimeoutError as e:
        err = str(e) or "Seedance 任务超时"
        if on_segment_update:
            on_segment_update(seg_index, "timeout", {"error": err})
        return seg_index, None, err
    except Exception as e:
        err = str(e) or "段生成失败"
        if on_segment_update:
            on_segment_update(seg_index, "failed", {"error": err})
        return seg_index, None, err


def concat_segment_videos(paths: list[str], output_dir: str) -> str:
    os.makedirs(output_dir, exist_ok=True)
    final_path = os.path.join(output_dir, "final.mp4")
    concatenate_videos_ffmpeg(paths, final_path, ffmpeg_path=_ffmpeg_exe())
    return final_path


async def retry_single_segment(
    *,
    seg: dict,
    seg_index: int,
    total_segs: int,
    images_base64: list[str],
    audios_base64: list[str] | None,
    aspect_ratio: str,
    output_dir: str,
    client_task_id: str,
    on_segment_update: SegmentUpdateFn | None = None,
    mode: str = "first_frame",
) -> tuple[str | None, str | None]:
    """单段重试：submit → poll → download。返回 (local_path, error)。"""
    sem = asyncio.Semaphore(1)
    media_refs_dir = os.path.join(output_dir, "refs")
    _, upstream_id, endpoint_name, submit_err = await _submit_one_segment(
        seg=seg,
        seg_index=seg_index,
        total_segs=total_segs,
        images_base64=images_base64,
        audios_base64=audios_base64,
        aspect_ratio=aspect_ratio,
        client_task_id=client_task_id,
        sem=sem,
        on_segment_update=on_segment_update,
        mode=mode,
        media_refs_dir=media_refs_dir,
    )
    if submit_err or not upstream_id:
        return None, submit_err or "提交失败"
    _, local_path, poll_err = await _poll_download_one_segment(
        seg_index=seg_index,
        upstream_id=upstream_id,
        output_dir=output_dir,
        sem=sem,
        on_segment_update=on_segment_update,
        endpoint_name=endpoint_name,
    )
    if poll_err or not local_path:
        return None, poll_err or "下载失败"
    return local_path, None


async def run_multi_segment_pipeline(
    *,
    segments: list[dict],
    images_base64: list[str],
    audios_base64: list[str] | None,
    aspect_ratio: str,
    output_dir: str,
    client_task_id: str,
    on_progress=None,
    on_segment_update: SegmentUpdateFn | None = None,
    mode: str = "first_frame",
) -> str | None:
    """并发提交各段 → 并发轮询下载 → 全部成功则拼接。有失败段时返回 None。"""
    os.makedirs(output_dir, exist_ok=True)
    ordered_segs = sorted(segments, key=lambda s: int(s.get("index", 0)))
    active = _filter_active_segments(ordered_segs)
    if not active:
        raise ValueError("无有效台词段")
    if not images_base64:
        raise ValueError("Seedance 图生视频需至少 1 张参考图")

    total = len(active)
    resolved_mode = resolve_seedance_mode(
        mode,
        image_count=len(images_base64),
        has_audio=bool(audios_base64),
    )
    media_refs_dir = os.path.join(output_dir, "refs")
    sem = asyncio.Semaphore(_max_parallel_segments())
    completed_lock = asyncio.Lock()
    done_count = 0

    async def _on_one_done(seg_idx: int) -> None:
        nonlocal done_count
        async with completed_lock:
            done_count += 1
            if on_progress:
                on_progress(done_count, total, seg_idx)

    # 阶段 1：并发提交
    submit_jobs = [
        _submit_one_segment(
            seg=seg,
            seg_index=int(seg.get("index", i)),
            total_segs=total,
            images_base64=images_base64,
            audios_base64=audios_base64,
            aspect_ratio=aspect_ratio,
            client_task_id=client_task_id,
            sem=sem,
            on_segment_update=on_segment_update,
            mode=resolved_mode,
            media_refs_dir=media_refs_dir,
        )
        for i, seg in enumerate(active)
    ]
    submit_results = await asyncio.gather(*submit_jobs)

    task_map: list[tuple[int, str, str]] = []
    for idx, upstream_id, endpoint_name, err in submit_results:
        if upstream_id and endpoint_name:
            task_map.append((idx, upstream_id, endpoint_name))

    if not task_map:
        return None

    # 阶段 2：并发轮询 + 下载（失败段不 raise，记入状态）
    poll_jobs = [
        _poll_download_one_segment(
            seg_index=idx,
            upstream_id=upstream_id,
            output_dir=output_dir,
            sem=sem,
            on_segment_update=on_segment_update,
            on_done=_on_one_done,
            endpoint_name=endpoint_name,
        )
        for idx, upstream_id, endpoint_name in task_map
    ]
    poll_results = await asyncio.gather(*poll_jobs)

    paths_by_index: dict[int, str] = {}
    for idx, local_path, _err in poll_results:
        if local_path:
            paths_by_index[idx] = local_path

    if len(paths_by_index) < total:
        return None

    ordered_paths = [paths_by_index[i] for i in sorted(paths_by_index.keys())]
    return concat_segment_videos(ordered_paths, output_dir)


async def render_aicost_segment_to_file(
    *,
    prompt: str,
    images_base64: list[str],
    audios_base64: list[str] | None,
    aspect_ratio: str,
    dest_path: str,
    client_task_id: str,
    mode: str = "first_frame",
    media_refs_dir: str | None = None,
) -> str:
    """提交 Seedance → 轮询 → 下载到 dest_path。返回 upstream task id。"""
    submit_res = await submit_aicost_seedance(
        prompt=prompt,
        images_base64=images_base64,
        audios_base64=audios_base64,
        aspect_ratio=aspect_ratio,
        client_task_id=client_task_id,
        mode=mode,
        media_refs_dir=media_refs_dir,
    )
    upstream_id = str(submit_res.get("id") or submit_res.get("task_id") or "").strip()
    endpoint_name = str(submit_res.get("_seedance_endpoint") or "secondary")
    if not upstream_id:
        raise RuntimeError("Seedance 未返回任务 ID")
    result = await poll_aicost_task(
        upstream_id,
        max_wait=segment_poll_timeout(),
        endpoint_name=endpoint_name,
    )
    video_url = _pick_video_url(result)
    if not video_url:
        raise RuntimeError("Seedance 完成但无视频地址")
    os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
    await download_video_file(
        video_url,
        dest_path,
        upstream_id=upstream_id,
        endpoint_name=endpoint_name,
    )
    return upstream_id


async def render_segment(
    *,
    seg_index: int,
    total_segs: int,
    video_prompt: str,
    dialogue: str,
    images_base64: list[str],
    audios_base64: list[str] | None,
    aspect_ratio: str,
    output_dir: str,
    client_task_id: str,
) -> tuple[int, str]:
    os.makedirs(output_dir, exist_ok=True)
    seg = {"video_prompt": video_prompt, "dialogue": dialogue, "index": seg_index}
    local_path, err = await retry_single_segment(
        seg=seg,
        seg_index=seg_index,
        total_segs=total_segs,
        images_base64=images_base64,
        audios_base64=audios_base64,
        aspect_ratio=aspect_ratio,
        output_dir=output_dir,
        client_task_id=client_task_id,
        mode="first_frame",
    )
    if err or not local_path:
        raise RuntimeError(err or "段生成失败")
    return seg_index, local_path

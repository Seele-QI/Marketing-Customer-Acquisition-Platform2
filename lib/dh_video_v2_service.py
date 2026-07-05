# -*- coding: utf-8 -*-
"""数字人视频创作（新）— aicost Seedance 2.0 Fast 客户端 + 多段拼接"""

from __future__ import annotations

import asyncio
import logging
import os
import time
from typing import Any

import httpx

from lib.video_concat import concatenate_videos_ffmpeg

logger = logging.getLogger("dh_video_v2_service")

DEFAULT_BASE_URL = "https://www.aicost.xyz"
SEGMENT_SEC = 15
POLL_INTERVAL = 5.0
MAX_POLL_WAIT = 1800.0  # 单段最长 30 分钟（上游偶发排队）

TERMINAL_OK = {"completed", "succeeded", "success", "SUCCESS"}
TERMINAL_FAIL = {"failed", "failure", "error", "cancelled", "rejected", "timeout", "expired"}


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


def _http_client(**kwargs) -> httpx.AsyncClient:
    """直连 aicost，避免 Windows 系统代理导致 ConnectError。"""
    return httpx.AsyncClient(trust_env=False, **kwargs)


async def submit_aicost_seedance(
    *,
    prompt: str,
    images_base64: list[str] | None = None,
    audios_base64: list[str] | None = None,
    aspect_ratio: str = "9:16",
    client_task_id: str | None = None,
    retries: int = 4,
) -> dict[str, Any]:
    key = _api_key()
    if not key:
        raise RuntimeError("SEEDANCE_API_KEY 未配置")

    payload: dict[str, Any] = {
        "model": "seedance2.0-fast",
        "prompt": (prompt or "").strip(),
        "aspect_ratio": aspect_ratio or "9:16",
        "resolution": "720p",
        "duration": "auto",
        "seconds": str(SEGMENT_SEC),
    }
    if images_base64:
        payload["images_base64"] = images_base64
    if audios_base64:
        payload["audios_base64"] = audios_base64
    if client_task_id:
        payload["client_task_id"] = client_task_id

    url = f"{_base_url()}/v1/videos"
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            async with _http_client(timeout=120.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code >= 400:
                    raise RuntimeError(f"Seedance 提交失败 ({resp.status_code}): {resp.text[:500]}")
                return resp.json()
        except (httpx.ConnectError, httpx.TimeoutException, httpx.NetworkError) as e:
            last_err = e
            if attempt + 1 < retries:
                wait = 3.0 * (attempt + 1)
                logger.warning("Seedance 提交网络错误，%ss 后重试 (%s/%s): %s", wait, attempt + 1, retries, e)
                await asyncio.sleep(wait)
                continue
            raise
    raise RuntimeError(f"Seedance 提交失败: {last_err}")


def _extract_status(data: dict) -> str:
    raw = data.get("status")
    if not raw:
        inner = data.get("data")
        if isinstance(inner, dict):
            raw = inner.get("status")
    return _normalize_status(str(raw or ""))


async def poll_aicost_task(task_id: str, *, max_wait: float = MAX_POLL_WAIT) -> dict[str, Any]:
    key = _api_key()
    if not key:
        raise RuntimeError("SEEDANCE_API_KEY 未配置")
    headers = {"Authorization": f"Bearer {key}"}
    url = f"{_base_url()}/v1/videos/{task_id}"
    deadline = time.monotonic() + max_wait
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


def _normalize_download_url(url: str, upstream_id: str = "") -> str:
    u = (url or "").strip()
    if not u and upstream_id:
        return f"{_base_url()}/v1/videos/{upstream_id}/content"
    if "/v1/videos/" in u and not u.rstrip("/").endswith("/content"):
        return f"{u.rstrip('/')}/content"
    return u


async def download_video_file(url: str, dest_path: str, *, upstream_id: str = "", retries: int = 4) -> str:
    key = _api_key()
    headers = {"Authorization": f"Bearer {key}"} if key else {}
    fetch_url = _normalize_download_url(url, upstream_id)
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            async with _http_client(timeout=300.0, follow_redirects=True) as client:
                resp = await client.get(fetch_url, headers=headers)
                resp.raise_for_status()
                data = resp.content
                if len(data) < 1024:
                    raise RuntimeError(f"下载的视频过小 ({len(data)} bytes)，可能不是有效 mp4")
                with open(dest_path, "wb") as f:
                    f.write(data)
            return dest_path
        except Exception as e:
            last_err = e
            if attempt + 1 < retries:
                await asyncio.sleep(2.0 * (attempt + 1))
    raise RuntimeError(f"视频下载失败（已重试 {retries} 次）: {last_err}")


def build_segment_prompt(base_prompt: str, seg_index: int, total_segs: int, dialogue: str) -> str:
    prompt = (base_prompt or "").strip()
    if total_segs > 1 and seg_index > 0:
        prompt += f"（第 {seg_index + 1}/{total_segs} 段，15 秒，承接前段叙事）"
    dlg = (dialogue or "").strip().replace("\n", " ")[:80]
    if dlg:
        prompt += f" 本段口播：{dlg}"
    return prompt


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
    prompt = build_segment_prompt(video_prompt, seg_index, total_segs, dialogue)
    submit_res = await submit_aicost_seedance(
        prompt=prompt,
        images_base64=images_base64,
        audios_base64=audios_base64,
        aspect_ratio=aspect_ratio,
        client_task_id=f"{client_task_id}:seg{seg_index}",
    )
    upstream_id = str(submit_res.get("id") or submit_res.get("task_id") or "").strip()
    if not upstream_id:
        raise RuntimeError("Seedance 未返回任务 ID")

    result = await poll_aicost_task(upstream_id)
    video_url = _pick_video_url(result)
    if not video_url:
        raise RuntimeError(f"段 {seg_index + 1} 完成但无视频地址")

    out_path = os.path.join(output_dir, f"segment_{seg_index}.mp4")
    await download_video_file(video_url, out_path, upstream_id=upstream_id)
    return seg_index, out_path


async def run_multi_segment_pipeline(
    *,
    segments: list[dict],
    images_base64: list[str],
    audios_base64: list[str] | None,
    aspect_ratio: str,
    output_dir: str,
    client_task_id: str,
    on_progress=None,
) -> str:
    """顺序渲染各段并拼接，返回最终 mp4 路径。"""
    os.makedirs(output_dir, exist_ok=True)
    total = len(segments)
    if total < 1:
        raise ValueError("segments 为空")

    ordered_segs = sorted(segments, key=lambda s: int(s.get("index", 0)))
    ordered_paths: list[str] = []
    for done_count, seg in enumerate(ordered_segs, start=1):
        idx = int(seg.get("index", done_count - 1))
        if done_count > 1:
            # 多段之间短暂间隔，降低上游限流与连接抖动
            await asyncio.sleep(2.0)
        _, path = await render_segment(
            seg_index=idx,
            total_segs=total,
            video_prompt=str(seg.get("video_prompt") or ""),
            dialogue=str(seg.get("dialogue") or ""),
            images_base64=images_base64,
            audios_base64=audios_base64,
            aspect_ratio=aspect_ratio,
            output_dir=output_dir,
            client_task_id=client_task_id,
        )
        ordered_paths.append(path)
        if on_progress:
            on_progress(done_count, total, idx)

    final_path = os.path.join(output_dir, "final.mp4")
    concatenate_videos_ffmpeg(ordered_paths, final_path, ffmpeg_path=_ffmpeg_exe())
    return final_path

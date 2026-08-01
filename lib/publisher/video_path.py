"""将前端/分享页里的 videoUrl 解析为本地绝对路径。"""
import os
import re
from typing import Optional
from urllib.parse import urlparse

import httpx


def _safe_join(root: str, relative: str) -> str:
    base = os.path.abspath(root)
    target = os.path.abspath(os.path.join(base, relative.replace("/", os.sep)))
    try:
        inside = os.path.commonpath([base, target]) == base
    except ValueError:
        inside = False
    if not inside:
        raise ValueError("非法视频路径：目标文件超出允许目录")
    return target


def _project_root() -> str:
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def _data_dir() -> str:
    root = _project_root()
    return (os.getenv("DATA_DIR") or "").strip() or os.path.join(root, "public", "video-cache")


def _manual_upload_root() -> str:
    return os.path.join(_data_dir(), "video-cache", "manual-uploads")


def _postprocess_root() -> str:
    return os.path.join(_data_dir(), "video-postprocess")


def resolve_local_video_path(video_url: str, *, download_dir: Optional[str] = None) -> str:
    raw = (video_url or "").strip()
    if not raw:
        raise ValueError("videoUrl 不能为空")

    root = _project_root()
    data_dir = os.path.join(root, "data")
    postprocess = _postprocess_root()
    manual_uploads = _manual_upload_root()

    if raw.startswith("http://") or raw.startswith("https://"):
        parsed = urlparse(raw)
        path = parsed.path or ""
        if "/static/manual-uploads/" in path:
            rel = path.split("/static/manual-uploads/", 1)[-1]
            local = _safe_join(manual_uploads, rel)
            if os.path.isfile(local):
                return os.path.abspath(local)
        if "/static/video-postprocess/" in path:
            rel = path.split("/static/video-postprocess/", 1)[-1]
            local = _safe_join(postprocess, rel)
            if os.path.isfile(local):
                return os.path.abspath(local)
        # 回退：下载到 data/temp
        tmp = download_dir or os.path.join(data_dir, "temp")
        os.makedirs(tmp, exist_ok=True)
        name = os.path.basename(path) or f"publish_{abs(hash(raw))}.mp4"
        if not re.search(r"\.(mp4|mov|webm|avi)$", name, re.I):
            name += ".mp4"
        dest = os.path.join(tmp, name)
        with httpx.Client(timeout=120.0, follow_redirects=True) as client:
            r = client.get(raw)
            r.raise_for_status()
            with open(dest, "wb") as f:
                f.write(r.content)
        return os.path.abspath(dest)

    if raw.startswith("/static/manual-uploads/"):
        rel = raw.split("/static/manual-uploads/", 1)[-1]
        local = _safe_join(manual_uploads, rel)
        if os.path.isfile(local):
            return os.path.abspath(local)

    if raw.startswith("/static/video-postprocess/"):
        rel = raw.split("/static/video-postprocess/", 1)[-1]
        local = _safe_join(postprocess, rel)
        if os.path.isfile(local):
            return os.path.abspath(local)

    candidates = [
        raw,
        os.path.join(root, raw.lstrip("/")),
        os.path.join(postprocess, os.path.basename(raw)),
        os.path.join(data_dir, "video-postprocess", os.path.basename(raw)),
    ]
    for p in candidates:
        if p and os.path.isfile(p):
            return os.path.abspath(p)

    raise FileNotFoundError(f"找不到视频文件: {video_url}")

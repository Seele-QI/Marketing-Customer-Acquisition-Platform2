"""按中台 user_id 隔离 Playwright Profile 与 Cookie 文件。"""
from __future__ import annotations

import os
from pathlib import Path


def normalize_profile_platform(platform: str) -> str:
    p = (platform or "").strip().lower()
    if p == "shipinhao":
        return "video_channel"
    return p


def user_profiles_root(project_root: str | Path) -> Path:
    return Path(project_root) / "data" / "profiles"


def user_profile_dir(project_root: str | Path, user_id: int, platform: str) -> Path:
    key = normalize_profile_platform(platform)
    return user_profiles_root(project_root) / f"user_{int(user_id)}" / f"chrome_profile_{key}"


def user_cookie_file(project_root: str | Path, user_id: int, platform: str) -> Path:
    key = normalize_profile_platform(platform)
    name = "douyin_cookies.json" if key == "douyin" else f"{key}_cookies.json"
    return user_profiles_root(project_root) / f"user_{int(user_id)}" / name

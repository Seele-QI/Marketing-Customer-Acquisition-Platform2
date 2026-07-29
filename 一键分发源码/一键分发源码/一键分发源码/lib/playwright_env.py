"""Playwright 浏览器路径：空 .browsers 目录会导致 launch 失败。"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional


def resolve_chrome_executable(project_root: str | Path) -> Optional[str]:
    root = Path(project_root)
    browsers_root = root / ".browsers"
    if not browsers_root.is_dir():
        return None
    for path in browsers_root.rglob("*"):
        if path.is_file() and path.name in ("chrome.exe", "chrome-headless-shell.exe"):
            return str(path)
    return None


def prepare_playwright_browsers_path(project_root: str | Path) -> Optional[str]:
    """仅在项目 .browsers 内存在 chrome 时才设置 PLAYWRIGHT_BROWSERS_PATH。"""
    chrome = resolve_chrome_executable(project_root)
    if chrome:
        browsers_root = str(Path(project_root) / ".browsers")
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = browsers_root
        return chrome
    os.environ.pop("PLAYWRIGHT_BROWSERS_PATH", None)
    return None

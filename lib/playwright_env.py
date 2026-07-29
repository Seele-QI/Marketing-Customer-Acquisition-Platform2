"""Playwright browser discovery, fallback and user-facing diagnostics."""
from __future__ import annotations

import os
import asyncio
import sys
from pathlib import Path
from typing import Any, Iterable, Optional


def _find_chromium(browsers_root: Path) -> Optional[Path]:
    if not browsers_root.is_dir():
        return None
    preferred = ("chrome.exe", "chrome", "Chromium")
    matches = [path for path in browsers_root.rglob("*") if path.is_file() and path.name in preferred]
    matches.sort(key=lambda path: ("headless" in str(path).lower(), str(path)))
    return matches[0] if matches else None


def _default_system_chrome_candidates() -> list[Path]:
    candidates: list[Path] = []
    if os.name == "nt":
        for base in (os.getenv("PROGRAMFILES"), os.getenv("PROGRAMFILES(X86)"), os.getenv("LOCALAPPDATA")):
            if base:
                candidates.append(Path(base) / "Google" / "Chrome" / "Application" / "chrome.exe")
                candidates.append(Path(base) / "Microsoft" / "Edge" / "Application" / "msedge.exe")
    elif os.uname().sysname == "Darwin":
        candidates.extend([
            Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            Path("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"),
        ])
    else:
        candidates.extend([Path("/usr/bin/google-chrome"), Path("/usr/bin/chromium"), Path("/usr/bin/microsoft-edge")])
    return candidates


def browser_launch_candidates(
    project_root: str | Path,
    *,
    system_candidates: Optional[Iterable[str | Path]] = None,
) -> list[dict[str, str]]:
    root = Path(project_root)
    candidates: list[dict[str, str]] = []
    configured = (os.getenv("PLAYWRIGHT_BROWSERS_PATH") or "").strip()
    search_roots: list[tuple[str, Path]] = []
    if configured:
        search_roots.append(("configured", Path(configured)))
    search_roots.extend([
        ("bundled", root / "resources" / "python" / ".browsers"),
        ("bundled", root / ".browsers"),
    ])
    seen: set[str] = set()
    for source, browsers_path in search_roots:
        executable = _find_chromium(browsers_path)
        if not executable:
            continue
        resolved = str(executable.resolve())
        if resolved in seen:
            continue
        seen.add(resolved)
        candidates.append({
            "source": source,
            "executable": resolved,
            "browsers_path": str(browsers_path.resolve()),
        })
    system_paths = system_candidates if system_candidates is not None else _default_system_chrome_candidates()
    for candidate in system_paths:
        executable = Path(candidate)
        if executable.is_file() and str(executable.resolve()) not in seen:
            seen.add(str(executable.resolve()))
            candidates.append({"source": "system_chrome", "executable": str(executable.resolve()), "browsers_path": ""})
    return candidates


def browser_launch_mode(platform: str) -> str:
    """Sites that reject Playwright navigation use native Chrome with a CDP attachment."""
    return "native_cdp" if (platform or "").strip().lower() in {"xiaohongshu", "kuaishou"} else "playwright"


def browser_event_loop_diagnostics(*, loop: Any = None, platform: Optional[str] = None) -> dict[str, Any]:
    runtime_platform = platform or sys.platform
    if loop is None:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
    loop_name = type(loop).__name__ if loop is not None else "none"
    subprocess_supported = runtime_platform != "win32" or "proactor" in loop_name.lower()
    return {"event_loop": loop_name, "subprocess_supported": subprocess_supported}


def resolve_browser_runtime(
    project_root: str | Path,
    *,
    system_candidates: Optional[Iterable[str | Path]] = None,
) -> dict[str, str]:
    candidates = browser_launch_candidates(project_root, system_candidates=system_candidates)
    return candidates[0] if candidates else {"source": "missing", "executable": "", "browsers_path": ""}


def prepare_playwright_browsers_path(project_root: str | Path) -> Optional[str]:
    runtime = resolve_browser_runtime(project_root)
    if runtime["source"] in {"configured", "bundled"} and runtime["browsers_path"]:
        os.environ["PLAYWRIGHT_BROWSERS_PATH"] = runtime["browsers_path"]
    elif runtime["source"] == "system_chrome":
        os.environ.pop("PLAYWRIGHT_BROWSERS_PATH", None)
    return runtime["executable"] or None


def classify_browser_launch_error(exc: BaseException) -> dict[str, str]:
    if isinstance(exc, NotImplementedError):
        return {"code": "event_loop_incompatible", "message": "开发服务的事件循环不支持登录浏览器，请重启开发服务后再试"}
    raw = str(exc)
    lowered = raw.lower()
    if any(token in lowered for token in ("processsingleton", "profile is already in use", "singletonlock", "user data directory is already in use")):
        return {"code": "profile_in_use", "message": "该平台登录窗口已经打开，请先完成登录或关闭旧窗口后重试"}
    if any(token in lowered for token in ("executable doesn't exist", "executable not found", "browser was not found")):
        return {"code": "browser_missing", "message": "登录浏览器组件缺失，程序将在重启服务后自动修复"}
    if any(token in lowered for token in ("timeout", "timed out")):
        return {"code": "page_open_timeout", "message": "平台登录页打开超时，请检查网络后重新打开"}
    if any(token in lowered for token in ("name_not_resolved", "connection", "net::", "proxy")):
        return {"code": "network_error", "message": "无法连接平台登录页，请检查网络或代理设置"}
    return {"code": "browser_launch_failed", "message": "登录浏览器未能启动，请重新打开；仍失败时请重启开发服务"}


def browser_health(project_root: str | Path, *, playwright_available: bool) -> dict[str, Any]:
    candidates = browser_launch_candidates(project_root)
    return {
        "playwright_available": playwright_available,
        "browser_ready": bool(candidates),
        "bundled_chromium": any(item["source"] in {"bundled", "configured"} for item in candidates),
        "system_chrome": any(item["source"] == "system_chrome" for item in candidates),
        "preferred_source": candidates[0]["source"] if candidates else "missing",
        **browser_event_loop_diagnostics(),
    }

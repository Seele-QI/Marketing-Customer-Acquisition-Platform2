"""
抖音扫码登录管理器

用法:
    manager = DouyinLoginManager()
    qr_base64 = await manager.init_login()
    is_done, cookie_json = await manager.poll_login_status()
    await manager.close()
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
from pathlib import Path
from typing import Optional

from playwright.async_api import Browser, BrowserContext, Page, async_playwright

from lib.playwright_lock import playwright_lock

logger = logging.getLogger("douyin_login")

DOUYIN_CREATOR_URL = "https://creator.douyin.com/"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEBUG_DIR = PROJECT_ROOT / "data" / "temp" / "publish-debug"

QRCODE_SELECTORS = [
    "xpath=//div[@id='animate_qrcode_container']//img",
    "xpath=//div[contains(@class,'qrcode')]//img",
    "img[src*='qrcode']",
    "canvas",
    ".login-qrcode img",
]


class DouyinLoginManager:
    def __init__(self) -> None:
        self._playwright = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None
        self._qr_base64: str = ""

    async def init_login(self) -> str:
        async with playwright_lock:
            return await self._init_login_locked()

    async def _init_login_locked(self) -> str:
        DEBUG_DIR.mkdir(parents=True, exist_ok=True)
        self._playwright = await async_playwright().start()
        try:
            self._browser = await self._playwright.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-dev-shm-usage"],
            )
            self._context = await self._browser.new_context(
                viewport={"width": 1280, "height": 720},
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                ),
            )
            self._page = await self._context.new_page()
            await self._page.goto(DOUYIN_CREATOR_URL, wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(2)

            await self._ensure_login_panel()
            await self._ensure_scan_tab()
            qr_locator = await self._find_qr_locator()
            screenshot = await qr_locator.screenshot(type="png")
            self._qr_base64 = base64.b64encode(screenshot).decode()
            return self._qr_base64
        except Exception:
            if self._page:
                try:
                    await self._page.screenshot(path=str(DEBUG_DIR / "douyin_qr_fail.png"), full_page=True)
                except Exception:
                    pass
            await self.close()
            raise

    async def _ensure_login_panel(self) -> None:
        assert self._page
        for selector in [
            "xpath=//div[@id='login-panel-new']",
            "text=扫码登录",
            "text=登录",
        ]:
            try:
                await self._page.wait_for_selector(selector, timeout=8000)
                return
            except Exception:
                continue
        for label in ["登录", "立即登录"]:
            btn = self._page.get_by_text(label, exact=True)
            if await btn.count() > 0:
                try:
                    await btn.first.click(timeout=3000)
                    await asyncio.sleep(1.5)
                    return
                except Exception:
                    pass
        logger.warning("Login panel not found, continuing to search QR")

    async def _ensure_scan_tab(self) -> None:
        assert self._page
        for label in ["扫码登录", "二维码登录"]:
            tab = self._page.get_by_text(label)
            if await tab.count() > 0:
                try:
                    await tab.first.click(timeout=3000)
                    await asyncio.sleep(1)
                    return
                except Exception:
                    pass

    async def _find_qr_locator(self):
        assert self._page
        last_err: Optional[Exception] = None
        for selector in QRCODE_SELECTORS:
            try:
                loc = self._page.locator(selector).first
                await loc.wait_for(state="visible", timeout=15000)
                if await loc.count() > 0:
                    return loc
            except Exception as exc:
                last_err = exc
        raise RuntimeError(
            f"抖音登录二维码未出现（请检查网络或稍后重试）。{last_err or ''}"
        )

    async def poll_login_status(self) -> tuple[bool, str]:
        if not self._context or not self._page:
            return (False, "")

        try:
            has_login = await self._page.evaluate("() => window.localStorage.getItem('HasUserLogin')")
            if has_login == "1":
                cookies = await self._context.cookies()
                return (True, json.dumps(cookies, ensure_ascii=False))
        except Exception as exc:
            logger.warning("poll_login_status localStorage check failed: %s", exc)

        try:
            cookies = await self._context.cookies()
            cookie_dict = {c["name"]: c["value"] for c in cookies}
            if cookie_dict.get("LOGIN_STATUS") == "1":
                return (True, json.dumps(cookies, ensure_ascii=False))
        except Exception as exc:
            logger.warning("poll_login_status cookie check failed: %s", exc)

        return (False, "")

    async def close(self) -> None:
        if self._browser:
            try:
                await self._browser.close()
            except Exception:
                pass
        if self._playwright:
            try:
                await self._playwright.stop()
            except Exception:
                pass
        self._browser = None
        self._context = None
        self._page = None
        self._playwright = None

    def get_qr_base64(self) -> str:
        return self._qr_base64

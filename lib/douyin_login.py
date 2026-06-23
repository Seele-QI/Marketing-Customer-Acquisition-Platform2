"""
抖音扫码登录管理器

用法:
    manager = DouyinLoginManager()
    qr_base64 = await manager.init_login()
    # 展示 qr_base64 给用户扫码
    is_done, cookie_json = await manager.poll_login_status()
    # 登录成功后保存 cookie_json
    await manager.close()
"""

import asyncio
import base64
import json
import logging
from typing import Optional

from playwright.async_api import async_playwright, Browser, BrowserContext, Page

logger = logging.getLogger("douyin_login")

DOUYIN_CREATOR_URL = "https://creator.douyin.com/"
QRCODE_SELECTOR = "xpath=//div[@id='animate_qrcode_container']//img"
LOGIN_PANEL_SELECTOR = "xpath=//div[@id='login-panel-new']"


class DouyinLoginManager:
    def __init__(self):
        self._playwright = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None
        self._qr_base64: str = ""

    async def init_login(self) -> str:
        """启动浏览器 → 打开抖音创作者中心 → 等待登录框 → 截图二维码 → 返回 base64"""
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(headless=True)
        self._context = await self._browser.new_context(
            viewport={"width": 1280, "height": 720},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        self._page = await self._context.new_page()
        await self._page.goto(DOUYIN_CREATOR_URL, wait_until="domcontentloaded")

        # 等待登录面板出现
        try:
            await self._page.wait_for_selector(LOGIN_PANEL_SELECTOR, timeout=15000)
        except Exception:
            logger.warning("Login panel not auto-popup, trying manual click")
            login_button = self._page.locator("xpath=//p[text() = '登录']")
            if await login_button.count() > 0:
                await login_button.click()
                await asyncio.sleep(1)

        # 等待二维码图片
        try:
            await self._page.wait_for_selector(QRCODE_SELECTOR, timeout=10000)
        except Exception:
            raise RuntimeError("抖音登录二维码未出现，请检查网络或重试")

        qr_img = self._page.locator(QRCODE_SELECTOR).first
        screenshot = await qr_img.screenshot(type="png")
        self._qr_base64 = base64.b64encode(screenshot).decode()
        return self._qr_base64

    async def poll_login_status(self) -> tuple[bool, str]:
        """
        轮询检查登录状态
        返回: (is_done, cookie_json | "")
        """
        if not self._context or not self._page:
            return (False, "")

        try:
            has_login = await self._page.evaluate("() => window.localStorage.getItem('HasUserLogin')")
            if has_login == "1":
                cookies = await self._context.cookies()
                return (True, json.dumps(cookies, ensure_ascii=False))
        except Exception as e:
            logger.warning(f"poll_login_status localStorage check failed: {e}")

        try:
            cookies = await self._context.cookies()
            cookie_dict = {c["name"]: c["value"] for c in cookies}
            if cookie_dict.get("LOGIN_STATUS") == "1":
                return (True, json.dumps(cookies, ensure_ascii=False))
        except Exception as e:
            logger.warning(f"poll_login_status cookie check failed: {e}")

        return (False, "")

    async def close(self):
        """关闭浏览器"""
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    def get_qr_base64(self) -> str:
        return self._qr_base64

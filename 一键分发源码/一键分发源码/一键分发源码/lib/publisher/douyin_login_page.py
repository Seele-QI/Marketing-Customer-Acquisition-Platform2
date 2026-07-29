"""抖音创作者中心：空白页 / 半登录态时恢复登录界面（扫码框）。"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

logger = logging.getLogger("publisher.douyin_login_page")

DOUYIN_ENTRY_URLS = (
    "https://creator.douyin.com/creator-micro/content/upload",
    "https://creator.douyin.com/creator-micro/content/publish/upload",
    "https://creator.douyin.com/",
)

CHROME_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


async def _has_login_ui(page) -> bool:
    url = page.url.lower()
    if "login" in url or "passport" in url:
        return True
    for text in ("扫码登录", "验证码登录", "密码登录", "抖音扫码登录"):
        try:
            if await page.locator(f'text="{text}"').count() > 0:
                return True
        except Exception:
            pass
    return False


async def _has_creator_ui(page) -> bool:
    try:
        if await page.locator('input[type="file"]').count() > 0:
            return True
    except Exception:
        pass
    url = page.url.lower()
    if "/content/" in url and "login" not in url:
        return True
    return False


async def _page_looks_blank(page) -> bool:
    """仅顶栏、主体空白 —— 常见于 Profile 里残留失效 Cookie。"""
    try:
        text = (await page.locator("body").inner_text()).strip()
        if len(text) < 25:
            return True
        markers = ("扫码登录", "验证码登录", "上传视频", "发布视频", "作品管理", "高清发布")
        if any(m in text for m in markers):
            return False
        if len(text) < 150:
            return True
    except Exception:
        return True
    return False


async def _click_login_entry(page) -> bool:
    selectors = (
        'text="登录"',
        'button:has-text("登录")',
        'div:has-text("登录")',
        '[class*="login-button"]',
        'a[href*="login"]',
    )
    for sel in selectors:
        try:
            loc = page.locator(sel).first
            if await loc.count() > 0 and await loc.is_visible():
                await loc.click(timeout=4000)
                await asyncio.sleep(2)
                return True
        except Exception:
            pass
    return False


async def _screenshot(page, debug_dir: Optional[str], name: str) -> None:
    if not debug_dir or page.is_closed():
        return
    try:
        os.makedirs(debug_dir, exist_ok=True)
        await page.screenshot(path=os.path.join(debug_dir, name), full_page=True, timeout=8000)
    except Exception:
        pass


async def ensure_douyin_login_ui(
    page,
    *,
    context=None,
    debug_dir: Optional[str] = None,
    clear_stale_cookies: bool = True,
) -> bool:
    """
    尽量让扫码登录框出现。返回 True 表示已有登录 UI 或创作者后台 UI。
    """
    if await _has_login_ui(page) or await _has_creator_ui(page):
        return True

    if clear_stale_cookies and context is not None and await _page_looks_blank(page):
        logger.info("douyin page blank/stuck — clearing stale cookies and retrying")
        try:
            await context.clear_cookies()
        except Exception as exc:
            logger.warning("clear cookies failed: %s", exc)
        await _screenshot(page, debug_dir, "douyin_blank_before_recovery.png")

    for url in DOUYIN_ENTRY_URLS:
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=90000)
            await asyncio.sleep(4)
            if await _has_login_ui(page) or await _has_creator_ui(page):
                await _screenshot(page, debug_dir, "douyin_login_ready.png")
                return True
            if await _page_looks_blank(page):
                await _click_login_entry(page)
                await asyncio.sleep(2)
                if await _has_login_ui(page) or await _has_creator_ui(page):
                    await _screenshot(page, debug_dir, "douyin_login_after_click.png")
                    return True
        except Exception as exc:
            logger.warning("douyin goto %s failed: %s", url, exc)

    try:
        await page.reload(wait_until="domcontentloaded", timeout=60000)
        await asyncio.sleep(4)
        await _click_login_entry(page)
        await asyncio.sleep(2)
    except Exception as exc:
        logger.warning("douyin reload failed: %s", exc)

    ok = await _has_login_ui(page) or await _has_creator_ui(page)
    if not ok:
        await _screenshot(page, debug_dir, "douyin_login_stuck.png")
        logger.warning("douyin login UI still not visible, url=%s", page.url)
    return ok

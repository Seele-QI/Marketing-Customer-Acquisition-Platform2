"""快手创作者中心：进入视频发布页并找到上传入口。"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

logger = logging.getLogger("publisher.kuaishou_publish_page")

KS_ENTRY_URLS = (
    "https://cp.kuaishou.com/article/publish/video",
    "https://cp.kuaishou.com/article/publish/video?tab=video",
    "https://cp.kuaishou.com/#/article/publish/video",
    "https://cp.kuaishou.com/article/publish",
    "https://cp.kuaishou.com/",
)

KS_NAV_LABELS = (
    "发布作品",
    "发布视频",
    "上传视频",
    "内容发布",
    "视频发布",
    "创作",
    "发作品",
)


async def _screenshot(page, debug_dir: Optional[str], name: str) -> None:
    if not debug_dir or page.is_closed():
        return
    try:
        os.makedirs(debug_dir, exist_ok=True)
        await page.screenshot(path=os.path.join(debug_dir, name), full_page=True, timeout=8000)
    except Exception:
        pass


async def _has_login_ui(page) -> bool:
    url = page.url.lower()
    if "passport.kuaishou.com" in url:
        return True
    for text in ("扫码登录", "手机号登录", "验证码登录"):
        try:
            if await page.locator(f'text="{text}"').count() > 0:
                return True
        except Exception:
            pass
    return False


async def _scan_file_input(page):
    selectors = (
        'input[type="file"][accept*="video"]',
        'input[type="file"]',
        "div.ant-upload input[type='file']",
    )
    for target in [page, *page.frames]:
        for sel in selectors:
            try:
                loc = target.locator(sel).first
                if await loc.count() > 0:
                    return loc
            except Exception:
                pass
    try:
        handle = await page.evaluate_handle(
            """() => {
              const inputs = Array.from(document.querySelectorAll('input[type=file]'));
              return inputs.find(i => i) || null;
            }"""
        )
        elem = handle.as_element()
        if elem:
            return page.locator('input[type="file"]').first
    except Exception:
        pass
    return None


async def _has_publish_ui(page) -> bool:
    if await _scan_file_input(page) is not None:
        return True
    for sel in ('div.ant-upload', 'button:has-text("上传视频")', '[class*="upload"]'):
        try:
            loc = page.locator(sel).first
            if await loc.count() > 0 and await loc.is_visible():
                return True
        except Exception:
            pass
    return False


async def _dismiss_overlays(page) -> None:
    try:
        await page.keyboard.press("Escape")
    except Exception:
        pass
    for text in ("我知道了", "下一步", "跳过", "关闭", "确定", "取消", "下次再说", "立刻体验"):
        try:
            btn = page.get_by_text(text, exact=False).first
            if await btn.count() > 0 and await btn.is_visible():
                await btn.click(timeout=1500, force=True)
                await asyncio.sleep(0.3)
        except Exception:
            pass
    try:
        await page.evaluate(
            """() => {
              ['.react-joyride__overlay', '.__floater', '#react-joyride-portal',
               '.ant-modal-mask', '.ant-modal-wrap'].forEach(s =>
                document.querySelectorAll(s).forEach(el => el.remove()));
            }"""
        )
    except Exception:
        pass


async def _click_publish_nav(page) -> bool:
    for label in KS_NAV_LABELS:
        try:
            link = page.locator(f'a:has-text("{label}")').first
            if await link.count() > 0 and await link.is_visible():
                await link.click(timeout=4000)
                await asyncio.sleep(2)
                if await _has_publish_ui(page):
                    return True
        except Exception:
            pass
        try:
            btn = page.get_by_text(label, exact=False).first
            if await btn.count() > 0 and await btn.is_visible():
                await btn.click(timeout=4000)
                await asyncio.sleep(2)
                if await _has_publish_ui(page):
                    return True
        except Exception:
            pass

    for sel in ('a[href*="publish"]', 'a[href*="article"]'):
        try:
            link = page.locator(sel).first
            if await link.count() > 0 and await link.is_visible():
                await link.click(timeout=4000)
                await asyncio.sleep(2)
                if await _has_publish_ui(page):
                    return True
        except Exception:
            pass
    return False


async def _select_video_tab(page) -> None:
    for label in ("视频", "发视频", "上传视频"):
        try:
            tab = page.get_by_text(label, exact=True).first
            if await tab.count() > 0 and await tab.is_visible():
                await tab.click(timeout=3000)
                await asyncio.sleep(1.5)
                return
        except Exception:
            pass


async def ensure_kuaishou_publish_ui(
    page,
    *,
    debug_dir: Optional[str] = None,
    wait_s: int = 20,
) -> bool:
    """尽量进入快手视频发布页。True = 已有登录页或上传 UI。"""
    if await _has_login_ui(page) or await _has_publish_ui(page):
        return True

    for url in KS_ENTRY_URLS:
        try:
            logger.info("ks navigate %s", url)
            await page.goto(url, wait_until="domcontentloaded", timeout=90000)
            try:
                await page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
            await asyncio.sleep(3)
            await _dismiss_overlays(page)
            await _select_video_tab(page)
        except Exception as exc:
            logger.warning("ks goto %s failed: %s", url, exc)
            continue

        if await _has_login_ui(page) or await _has_publish_ui(page):
            await _screenshot(page, debug_dir, "ks_publish_ready.png")
            return True

        await _click_publish_nav(page)
        await _select_video_tab(page)
        if await _has_publish_ui(page):
            await _screenshot(page, debug_dir, "ks_publish_ready_nav.png")
            return True

    for _ in range(max(wait_s // 2, 1)):
        await _dismiss_overlays(page)
        if await _has_publish_ui(page):
            return True
        await asyncio.sleep(2)

    await _screenshot(page, debug_dir, "ks_publish_not_ready.png")
    return await _has_login_ui(page) or await _has_publish_ui(page)


async def find_kuaishou_upload_input(page):
    await _select_video_tab(page)
    found = await _scan_file_input(page)
    if found is not None:
        return found

    for label in ("上传视频", "点击上传", "上传", "发视频", "选择视频"):
        try:
            trigger = page.get_by_text(label, exact=False).first
            if await trigger.count() > 0 and await trigger.is_visible():
                await trigger.click(timeout=3000)
                await asyncio.sleep(1.5)
                found = await _scan_file_input(page)
                if found is not None:
                    return found
        except Exception:
            pass

    try:
        box = page.locator("div.ant-upload").first
        if await box.count() > 0:
            await box.click(timeout=3000, force=True)
            await asyncio.sleep(1)
            found = await _scan_file_input(page)
            if found is not None:
                return found
    except Exception:
        pass

    try:
        await page.wait_for_selector('input[type="file"], div.ant-upload', timeout=8000)
        return await _scan_file_input(page)
    except Exception:
        return None

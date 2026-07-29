"""微信视频号：进入发表页并找到上传入口。"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Optional

logger = logging.getLogger("publisher.shipinhao_publish_page")

SPH_CREATE_URL = "https://channels.weixin.qq.com/platform/post/create"
SPH_ENTRY_URLS = (
    SPH_CREATE_URL,
    "https://channels.weixin.qq.com/platform/post/list",
    "https://channels.weixin.qq.com/platform",
    "https://channels.weixin.qq.com/",
)

SPH_NAV_LABELS = ("发表视频", "发视频", "创作", "内容管理", "视频", "新建")


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
    if "login" in url or "passport" in url:
        return True
    relogin_texts = (
        "重新登录",
        "登录过期",
        "扫描二维码重新登录",
        "请扫描二维码",
        "微信扫码",
        "扫码登录",
        "请使用微信",
        "微信登录",
    )
    for text in relogin_texts:
        try:
            loc = page.locator(f'text="{text}"')
            if await loc.count() > 0:
                for i in range(min(await loc.count(), 8)):
                    if await loc.nth(i).is_visible():
                        return True
        except Exception:
            pass
    try:
        body = await page.inner_text("body")
        if ("登录过期" in body or "重新登录" in body) and ("扫码" in body or "二维码" in body):
            return True
    except Exception:
        pass
    if "channels.weixin.qq.com/platform" not in url and "channels.weixin.qq.com" in url:
        for text in ("微信扫码", "扫码登录", "请使用微信", "微信登录"):
            try:
                loc = page.locator(f'text="{text}"')
                if await loc.count() > 0 and await loc.first.is_visible():
                    return True
            except Exception:
                pass
    return False


async def _is_create_page(page) -> bool:
    return "/post/create" in page.url.lower()


async def _scan_file_input(page):
    for sel in ('input[type="file"][accept*="video"]', 'input[type="file"]'):
        for target in [page, *page.frames]:
            try:
                loc = target.locator(sel).first
                if await loc.count() > 0:
                    return loc
            except Exception:
                pass
    return None


async def _has_upload_ui(page) -> bool:
    """仅在真正可上传时返回 True（避免在内容列表页误判）。"""
    if await _has_login_ui(page):
        return False
    if await _scan_file_input(page) is not None:
        return True
    if not await _is_create_page(page):
        return False
    for sel in ("div.input-editor", ".upload-area", '[class*="upload"]', 'button:has-text("发表")'):
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
    for text in ("我知道了", "知道了", "跳过", "关闭", "确定", "取消", "下次再说"):
        try:
            btn = page.get_by_text(text, exact=False).first
            if await btn.count() > 0 and await btn.is_visible():
                await btn.click(timeout=1500, force=True)
                await asyncio.sleep(0.3)
        except Exception:
            pass


async def _try_open_relogin(page) -> bool:
    """登录过期弹窗：点「重新登录」以展示二维码。"""
    for text in ("重新登录", "扫码登录", "微信登录", "登录"):
        try:
            btn = page.get_by_text(text, exact=False).first
            if await btn.count() > 0 and await btn.is_visible():
                await btn.click(timeout=3000, force=True)
                await asyncio.sleep(2)
                return True
        except Exception:
            pass
    return False


async def _click_publish_nav(page) -> bool:
    for label in SPH_NAV_LABELS:
        try:
            link = page.locator(f'a:has-text("{label}")').first
            if await link.count() > 0 and await link.is_visible():
                await link.click(timeout=4000)
                await asyncio.sleep(2)
                if await _has_upload_ui(page):
                    return True
        except Exception:
            pass
        try:
            btn = page.get_by_text(label, exact=False).first
            if await btn.count() > 0 and await btn.is_visible():
                await btn.click(timeout=4000)
                await asyncio.sleep(2)
                if await _has_upload_ui(page):
                    return True
        except Exception:
            pass
    return False


async def _goto_create_page(page, *, debug_dir: Optional[str] = None) -> bool:
    try:
        logger.info("sph navigate create %s", SPH_CREATE_URL)
        await page.goto(SPH_CREATE_URL, wait_until="domcontentloaded", timeout=90000)
        try:
            await page.wait_for_load_state("networkidle", timeout=15000)
        except Exception:
            pass
        await asyncio.sleep(3)
        await _dismiss_overlays(page)
        if await _has_login_ui(page):
            await _try_open_relogin(page)
        if await _has_upload_ui(page):
            await _screenshot(page, debug_dir, "sph_create_ready.png")
            return True
    except Exception as exc:
        logger.warning("sph goto create failed: %s", exc)
    return False


async def ensure_shipinhao_publish_ui(
    page,
    *,
    debug_dir: Optional[str] = None,
    wait_s: int = 24,
) -> bool:
    if await _has_login_ui(page):
        await _try_open_relogin(page)
        return True

    if await _has_upload_ui(page):
        return True

    if await _goto_create_page(page, debug_dir=debug_dir):
        return True

    for url in SPH_ENTRY_URLS:
        if url == SPH_CREATE_URL:
            continue
        try:
            logger.info("sph navigate %s", url)
            await page.goto(url, wait_until="domcontentloaded", timeout=90000)
            try:
                await page.wait_for_load_state("networkidle", timeout=15000)
            except Exception:
                pass
            await asyncio.sleep(3)
            await _dismiss_overlays(page)
        except Exception as exc:
            logger.warning("sph goto %s failed: %s", url, exc)
            continue

        if await _has_login_ui(page):
            await _try_open_relogin(page)
            return True

        if await _has_upload_ui(page):
            await _screenshot(page, debug_dir, "sph_publish_ready.png")
            return True

        await _click_publish_nav(page)
        if await _has_upload_ui(page):
            await _screenshot(page, debug_dir, "sph_publish_ready_nav.png")
            return True

        if await _goto_create_page(page, debug_dir=debug_dir):
            return True

    for _ in range(max(wait_s // 2, 1)):
        await _dismiss_overlays(page)
        if await _has_upload_ui(page):
            return True
        if not await _is_create_page(page):
            await _goto_create_page(page, debug_dir=debug_dir)
        await asyncio.sleep(2)

    await _screenshot(page, debug_dir, "sph_publish_not_ready.png")
    return await _has_login_ui(page) or await _has_upload_ui(page)


async def find_shipinhao_upload_input(page):
    found = await _scan_file_input(page)
    if found is not None:
        return found

    if not await _is_create_page(page):
        await _goto_create_page(page)
        found = await _scan_file_input(page)
        if found is not None:
            return found

    for label in ("上传视频", "点击上传", "上传", "添加视频", "选择视频", "拖拽"):
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
        box = page.locator(".upload-area, [class*='upload']").first
        if await box.count() > 0:
            await box.click(timeout=3000, force=True)
            await asyncio.sleep(1)
            return await _scan_file_input(page)
    except Exception:
        pass

    try:
        await page.wait_for_selector('input[type="file"]', timeout=8000)
        return await _scan_file_input(page)
    except Exception:
        return None

"""微信视频号自动发布（可见浏览器 + Profile + 扫码登录）。"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from pathlib import Path
from typing import Dict

from lib.playwright_env import prepare_playwright_browsers_path
from lib.publisher.douyin_login_page import CHROME_UA
from lib.publisher.profile_paths import user_profile_dir
from lib.publisher.publish_click import auto_publish_with_retries, wait_for_manual_publish_completion
from lib.publisher.shipinhao_publish_page import (
    _has_login_ui,
    ensure_shipinhao_publish_ui,
    find_shipinhao_upload_input,
)
from lib.publisher.types import PublishResult

logger = logging.getLogger("publisher.shipinhao")

STEALTH_PATH = Path(__file__).resolve().parent.parent / "stealth.min.js"


def _headless() -> bool:
    return (os.environ.get("SPH_PUBLISH_HEADLESS") or "0").strip().lower() in ("1", "true", "yes")


async def _screenshot(page, debug_dir: str, name: str) -> None:
    try:
        await page.screenshot(path=os.path.join(debug_dir, name), full_page=True, timeout=8000)
    except Exception as exc:
        logger.warning("sph screenshot %s failed: %s", name, exc)


async def _dismiss_modals(page) -> None:
    try:
        await page.keyboard.press("Escape")
        await asyncio.sleep(0.3)
    except Exception:
        pass
    dismiss_re = re.compile(r"我知道了|知道了|跳过|关闭|确认|确定|下次再说|取消")
    for frame in [page, *page.frames]:
        try:
            for sel in ('button', '[role="button"]'):
                loc = frame.locator(sel)
                for i in range(min(await loc.count(), 20)):
                    btn = loc.nth(i)
                    if not await btn.is_visible():
                        continue
                    txt = (await btn.inner_text()).strip()
                    if dismiss_re.search(txt) and txt not in ("发表", "发布"):
                        try:
                            await btn.click(timeout=1500, force=True)
                            await asyncio.sleep(0.3)
                        except Exception:
                            pass
        except Exception:
            pass


async def _is_login_page(page) -> bool:
    return await _has_login_ui(page)


async def _wait_for_manual_login(page, debug_dir: str, *, timeout_s: int = 300) -> bool:
    logger.info("sph waiting for WeChat QR re-login up to %ss", timeout_s)
    from lib.publisher.shipinhao_publish_page import _try_open_relogin

    await _try_open_relogin(page)
    for i in range(timeout_s // 2):
        if await _try_open_relogin(page):
            await asyncio.sleep(1)
        if not await _is_login_page(page):
            await asyncio.sleep(2)
            await ensure_shipinhao_publish_ui(page, debug_dir=debug_dir, wait_s=6)
            if not await _is_login_page(page) and await find_shipinhao_upload_input(page) is not None:
                return True
        if i in (0, 15, 30, 45, 60, 90, 120):
            await _screenshot(page, debug_dir, f"sph_login_wait_{i}.png")
        await asyncio.sleep(2)
    return False


async def _sync_cookies_to_db(context, user_id: int) -> None:
    try:
        from lib.connector_service import save_cookie_payload

        cookies = await context.cookies()
        if cookies:
            save_cookie_payload(user_id, "shipinhao", json.dumps(cookies, ensure_ascii=False))
    except Exception as exc:
        logger.warning("sph sync cookies: %s", exc)


async def _wait_for_manual_upload(page, debug_dir: str, *, timeout_s: int = 180) -> bool:
    for i in range(timeout_s // 2):
        if await find_shipinhao_upload_input(page) is not None:
            return True
        if i in (0, 15, 30, 45, 60):
            await _screenshot(page, debug_dir, f"sph_upload_wait_{i}.png")
        await asyncio.sleep(2)
    return False


async def _open_upload_page(page, debug_dir: str) -> PublishResult | None:
    ready = await ensure_shipinhao_publish_ui(page, debug_dir=debug_dir, wait_s=24)
    await _dismiss_modals(page)

    if await _is_login_page(page):
        await _screenshot(page, debug_dir, "sph_login.png")
        if not _headless():
            if await _wait_for_manual_login(page, debug_dir):
                if await find_shipinhao_upload_input(page) is not None:
                    return None
        return PublishResult(
            success=False,
            platform="shipinhao",
            error="登录失效：请在弹出 Chrome 里微信扫码（重新登录弹窗），扫码后脚本会继续上传发表",
        )

    if await find_shipinhao_upload_input(page) is not None:
        return None

    if not _headless():
        if await _wait_for_manual_upload(page, debug_dir):
            return None

    await _screenshot(page, debug_dir, "sph_no_upload.png")
    return PublishResult(
        success=False,
        platform="shipinhao",
        error="未找到上传入口：请在弹出 Chrome 中进入「发表视频」，或重新「账号绑定」扫码登录",
    )


async def _check_publish_success(page) -> bool:
    try:
        url = page.url.lower()
        if "post/list" in url or "post/manage" in url:
            return True
        body = await page.inner_text("body")
        if any(k in body for k in ("发表成功", "发布成功", "提交成功", "已发表")):
            return True
    except Exception:
        return False
    return False


async def _wait_for_publish_success(page, debug_dir: str, *, timeout_s: int = 120) -> bool:
    try:
        await page.wait_for_url("**/post/list**", timeout=min(timeout_s, 45) * 1000)
        return True
    except Exception:
        pass

    for i in range(timeout_s // 2):
        if page.is_closed():
            return False
        if await _check_publish_success(page):
            return True
        if i in (0, 15, 30, 45, 60):
            await _screenshot(page, debug_dir, f"sph_publish_wait_{i}.png")
        await asyncio.sleep(2)
    return False


async def _wait_for_upload_ready(page, *, timeout_s: int = 180) -> bool:
    """等待「发表」按钮可点击（上传完成）。"""
    for _ in range(timeout_s // 2):
        try:
            btn = page.locator('div.form-btns button:has-text("发表"), button:has-text("发表")').first
            if await btn.count() > 0:
                try:
                    if await btn.is_enabled():
                        return True
                except Exception:
                    return True
            body = await page.inner_text("body")
            if any(k in body for k in ("上传成功", "重新上传", "上传完成", "视频预览")):
                return True
        except Exception:
            pass
        await asyncio.sleep(2)
    return False


async def _fill_content(page, title: str, description: str) -> None:
    text = f"{title}\n{description}".strip() if description else (title or "")
    if not text:
        return
    for sel in ("div.input-editor", "div[contenteditable='true']", "textarea"):
        try:
            editor = page.locator(sel).first
            if await editor.count() > 0 and await editor.is_visible():
                await editor.click()
                await editor.fill(text[:1000])
                return
        except Exception:
            pass
    try:
        await page.locator("div.input-editor").click()
        await page.keyboard.type(text[:1000], delay=30)
    except Exception:
        pass


async def _prepare_before_publish(page) -> None:
    await _dismiss_modals(page)
    await _wait_for_upload_ready(page, timeout_s=120)


async def _click_publish_button(page) -> bool:
    return await auto_publish_with_retries(
        page,
        dismiss_fn=lambda: _dismiss_modals(page),
        prepare_fn=lambda: _prepare_before_publish(page),
        is_success_fn=lambda: _check_publish_success(page),
        publish_labels=("发表", "确认发表", "立即发表", "发布"),
        max_attempts=20,
        interval_s=3,
        allow_step_clicks=True,
    )


async def publish_shipinhao_video(
    video_path: str,
    title: str,
    description: str,
    credentials: Dict[str, str],
    *,
    project_root: str,
    cookie_raw: str = "",
    user_id: int = 0,
) -> PublishResult:
    if not credentials and not (cookie_raw or "").strip():
        return PublishResult(success=False, platform="shipinhao", error="未绑定视频号账号")
    if not os.path.isfile(video_path):
        return PublishResult(success=False, platform="shipinhao", error=f"视频不存在: {video_path}")

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return PublishResult(
            success=False,
            platform="shipinhao",
            error="缺少 playwright，请执行: pip install playwright && playwright install chromium",
        )

    debug_dir = os.path.join(project_root, "data", "temp", "publish-debug", f"user_{int(user_id)}")
    os.makedirs(debug_dir, exist_ok=True)
    profile_dir = user_profile_dir(project_root, user_id, "shipinhao")
    profile_dir.mkdir(parents=True, exist_ok=True)
    title = (title or "未命名")[:30]
    headless = _headless()

    prepare_playwright_browsers_path(project_root)

    async with async_playwright() as p:
        logger.info("sph publish headless=%s profile=%s user=%s", headless, profile_dir, user_id)
        context = await p.chromium.launch_persistent_context(
            str(profile_dir),
            headless=headless,
            args=[
                "--no-sandbox",
                "--disable-setuid-sandbox",
                "--disable-dev-shm-usage",
                "--disable-blink-features=AutomationControlled",
            ],
            viewport={"width": 1440, "height": 900},
            locale="zh-CN",
            user_agent=CHROME_UA,
        )
        if STEALTH_PATH.is_file():
            await context.add_init_script(path=str(STEALTH_PATH))

        # 视频号以 Profile 会话为准；不注入 DB 里可能过期的 Cookie，避免覆盖有效登录态
        page = context.pages[0] if context.pages else await context.new_page()
        publish_succeeded = False

        try:
            open_err = await _open_upload_page(page, debug_dir)
            if open_err:
                return open_err

            if await _is_login_page(page) and not _headless():
                logger.info("sph relogin modal detected after open, waiting for QR scan")
                if await _wait_for_manual_login(page, debug_dir):
                    await _sync_cookies_to_db(context, user_id)
                else:
                    return PublishResult(
                        success=False,
                        platform="shipinhao",
                        error="登录过期：请在 Chrome 弹窗里微信扫码，扫码成功后重试",
                    )
            logger.info("sph upload page ready url=%s", page.url)
            await _screenshot(page, debug_dir, "sph_01_upload_page.png")

            if await _is_login_page(page) and not _headless():
                if await _wait_for_manual_login(page, debug_dir):
                    await _sync_cookies_to_db(context, user_id)
                else:
                    return PublishResult(
                        success=False,
                        platform="shipinhao",
                        error="登录过期：请在 Chrome 里微信扫码后再试",
                    )

            upload_input = await find_shipinhao_upload_input(page)
            if upload_input is None:
                await _screenshot(page, debug_dir, "sph_no_upload_final.png")
                return PublishResult(
                    success=False,
                    platform="shipinhao",
                    error="未找到上传入口，请在弹出浏览器中手动选择视频上传",
                )

            logger.info("sph uploading video=%s", video_path)
            await upload_input.set_input_files(video_path)
            await _screenshot(page, debug_dir, "sph_02_uploading.png")

            if not await _wait_for_upload_ready(page, timeout_s=180 if not headless else 90):
                await _screenshot(page, debug_dir, "sph_upload_timeout.png")
                return PublishResult(
                    success=False,
                    platform="shipinhao",
                    error="视频上传超时，请在弹出浏览器中确认上传完成后再点「发表」",
                )

            logger.info("sph upload done, filling meta")
            await _dismiss_modals(page)
            await _fill_content(page, title, description)
            await asyncio.sleep(2)
            await _screenshot(page, debug_dir, "sph_03_before_publish.png")

            clicked = await _click_publish_button(page)
            logger.info("sph auto publish clicked=%s url=%s", clicked, page.url)

            ok = clicked or await _wait_for_publish_success(page, debug_dir, timeout_s=30)
            if not ok and not headless:
                ok = await wait_for_manual_publish_completion(
                    page,
                    lambda: _check_publish_success(page),
                )
            if not ok:
                ok = await _wait_for_publish_success(page, debug_dir, timeout_s=60 if headless else 30)
            if not ok:
                await _screenshot(page, debug_dir, "sph_publish_uncertain.png")
                return PublishResult(
                    success=False,
                    platform="shipinhao",
                    error="未确认发表成功：请在此 Chrome 窗口点「发表」；成功后才会打开下一平台",
                )

            publish_succeeded = True
            await _sync_cookies_to_db(context, user_id)
            await asyncio.sleep(2)
            await _screenshot(page, debug_dir, "sph_04_success.png")
            return PublishResult(
                success=True,
                platform="shipinhao",
                url=page.url,
                metadata={"title": title, "message": "发表成功，请到视频号助手或手机 App 确认"},
            )
        except Exception as exc:
            logger.exception("sph publish failed")
            await _screenshot(page, debug_dir, "sph_error.png")
            return PublishResult(success=False, platform="shipinhao", error=str(exc))
        finally:
            try:
                if publish_succeeded or headless:
                    await context.close()
                else:
                    logger.info("sph publish not confirmed — browser left open")
            except Exception as exc:
                logger.warning("sph context close: %s", exc)

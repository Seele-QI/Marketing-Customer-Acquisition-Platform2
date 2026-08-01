"""快手创作者中心自动发布（对齐抖音/小红书：可见浏览器 + Profile + 扫码登录）。"""
from __future__ import annotations

import asyncio
import logging
import os
import re
from pathlib import Path
from typing import Dict, Optional

from lib.playwright_env import prepare_playwright_browsers_path
from lib.publisher.cookies import playwright_cookies_from_storage
from lib.publisher.douyin_login_page import CHROME_UA
from lib.publisher.kuaishou_publish_page import (
    ensure_kuaishou_publish_ui,
    find_kuaishou_upload_input,
    _has_login_ui,
)
from lib.publisher.profile_paths import user_cookie_file, user_profile_dir
from lib.publisher.publish_click import auto_publish_with_retries, wait_for_manual_publish_completion
from lib.publisher.submit_mode import AUTO_SUBMIT, current_submit_mode
from lib.publisher.types import PublishResult

logger = logging.getLogger("publisher.kuaishou")

STEALTH_PATH = Path(__file__).resolve().parent.parent / "stealth.min.js"

KS_PUBLISH_URLS = (
    "https://cp.kuaishou.com/article/publish/video",
    "https://cp.kuaishou.com/#/article/publish/video",
    "https://cp.kuaishou.com/article/publish",
    "https://cp.kuaishou.com/",
)


async def _find_upload_input(page):
    return await find_kuaishou_upload_input(page)


async def _is_login_page(page) -> bool:
    return await _has_login_ui(page)


def _headless() -> bool:
    return (os.environ.get("KS_PUBLISH_HEADLESS") or "0").strip().lower() in ("1", "true", "yes")


async def _screenshot(page, debug_dir: str, name: str) -> None:
    try:
        await page.screenshot(path=os.path.join(debug_dir, name), full_page=True, timeout=8000)
    except Exception as exc:
        logger.warning("ks screenshot %s failed: %s", name, exc)


async def _dismiss_modals(page) -> None:
    try:
        await page.keyboard.press("Escape")
        await asyncio.sleep(0.3)
    except Exception:
        pass
    dismiss_re = re.compile(r"立刻体验|我知道了|已检查完毕|跳过|下次再说")
    for frame in [page, *page.frames]:
        try:
            for sel in ('button', '[role="button"]', ".ant-btn"):
                loc = frame.locator(sel)
                for i in range(min(await loc.count(), 20)):
                    btn = loc.nth(i)
                    if not await btn.is_visible():
                        continue
                    txt = (await btn.inner_text()).strip()
                    # 不要点「取消/关闭/下一步」——下一步由 publish_click 专门处理，取消会打断发布
                    if dismiss_re.fullmatch(txt) or (dismiss_re.search(txt) and len(txt) <= 8):
                        try:
                            await btn.click(timeout=1500, force=True)
                            await asyncio.sleep(0.4)
                        except Exception:
                            pass
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


async def _wait_for_manual_login(page, debug_dir: str, *, timeout_s: int = 180) -> bool:
    logger.info("ks waiting for manual login up to %ss", timeout_s)
    for i in range(timeout_s // 2):
        if not await _is_login_page(page):
            await ensure_kuaishou_publish_ui(page, debug_dir=debug_dir, wait_s=6)
            if await _find_upload_input(page) is not None:
                return True
        if i in (0, 15, 30, 45, 60):
            await _screenshot(page, debug_dir, f"ks_login_wait_{i}.png")
        await asyncio.sleep(2)
    return False


async def _wait_for_manual_upload(page, debug_dir: str, *, timeout_s: int = 180) -> bool:
    logger.info("ks waiting for manual upload entry up to %ss", timeout_s)
    for i in range(timeout_s // 2):
        if await _find_upload_input(page) is not None:
            return True
        if i in (0, 15, 30, 45, 60):
            await _screenshot(page, debug_dir, f"ks_upload_wait_{i}.png")
        await asyncio.sleep(2)
    return False


async def _open_upload_page(page, debug_dir: str) -> PublishResult | None:
    ready = await ensure_kuaishou_publish_ui(page, debug_dir=debug_dir, wait_s=24)
    await _dismiss_modals(page)

    if await _is_login_page(page):
        await _screenshot(page, debug_dir, "ks_login.png")
        if not _headless():
            if await _wait_for_manual_login(page, debug_dir):
                if await _find_upload_input(page) is not None:
                    return None
        return PublishResult(
            success=False,
            platform="kuaishou",
            error="登录失效，请到「账号绑定」重新浏览器登录快手（或在弹出浏览器里扫码登录）",
        )

    if await _find_upload_input(page) is not None:
        return None

    if not _headless():
        logger.info("ks upload entry missing — waiting for user in browser")
        if await _wait_for_manual_upload(page, debug_dir):
            return None

    await _screenshot(page, debug_dir, "ks_no_upload.png")
    return PublishResult(
        success=False,
        platform="kuaishou",
        error="未找到上传入口：请在弹出 Chrome 中手动进入「发布视频」页，或重新「账号绑定」扫码登录",
    )


async def _check_publish_success(page) -> bool:
    try:
        url = page.url.lower()
        if "cp.kuaishou.com" in url and "manage" in url:
            return True
        body = await page.inner_text("body")
        if any(k in body for k in ("发布成功", "发布完成", "提交成功")):
            return True
    except Exception:
        return False
    return False


async def _wait_for_publish_success(page, debug_dir: str, *, timeout_s: int = 120) -> bool:
    try:
        await page.wait_for_function(
            "() => window.location.href.includes('manage') || document.body.innerText.includes('发布成功')",
            timeout=min(timeout_s, 45) * 1000,
        )
        return True
    except Exception:
        pass

    for i in range(timeout_s // 2):
        if page.is_closed():
            return False
        if await _check_publish_success(page):
            return True
        if i in (0, 15, 30, 45, 60):
            await _screenshot(page, debug_dir, f"ks_publish_wait_{i}.png")
        await asyncio.sleep(2)
    return False


async def _fill_description(page, desc: str) -> None:
    if not (desc or "").strip():
        return
    for sel in (
        'div[contenteditable="true"]',
        ".editor-container div[contenteditable='true']",
        'div[placeholder*="描述"]',
        "textarea",
    ):
        try:
            editor = page.locator(sel).first
            if await editor.count() > 0 and await editor.is_visible():
                await editor.click()
                await editor.fill(desc)
                return
        except Exception:
            pass


async def _prepare_before_publish(page) -> None:
    await _dismiss_modals(page)
    for _ in range(20):
        try:
            if page.is_closed():
                return
            body = await page.inner_text("body")
        except Exception:
            return
        if any(k in body for k in ("处理中", "上传中", "解析中", "转码中")):
            await asyncio.sleep(2)
            continue
        break
    try:
        if not page.is_closed():
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(1)
    except Exception:
        return


async def _click_publish_button(page) -> bool:
    return await auto_publish_with_retries(
        page,
        dismiss_fn=lambda: _dismiss_modals(page),
        prepare_fn=lambda: _prepare_before_publish(page),
        is_success_fn=lambda: _check_publish_success(page),
        publish_labels=("发布", "确认发布", "立即发布"),
        max_attempts=20,
        interval_s=3,
        allow_step_clicks=True,
    )


async def publish_kuaishou_video(
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
        return PublishResult(success=False, platform="kuaishou", error="未绑定快手账号")
    if not os.path.isfile(video_path):
        return PublishResult(success=False, platform="kuaishou", error=f"视频不存在: {video_path}")

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return PublishResult(
            success=False,
            platform="kuaishou",
            error="缺少 playwright，请执行: pip install playwright && playwright install chromium",
        )

    debug_dir = os.path.join(project_root, "data", "temp", "publish-debug", f"user_{int(user_id)}")
    os.makedirs(debug_dir, exist_ok=True)
    profile_dir = user_profile_dir(project_root, user_id, "kuaishou")
    profile_dir.mkdir(parents=True, exist_ok=True)
    text = f"{title}\n{description}".strip()[:1000] if description else (title or "未命名")[:100]
    headless = _headless()

    prepare_playwright_browsers_path(project_root)

    async with async_playwright() as p:
        logger.info("ks publish headless=%s profile=%s user=%s", headless, profile_dir, user_id)
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

        raw_for_cookies = cookie_raw
        extra = user_cookie_file(project_root, user_id, "kuaishou")
        if not (raw_for_cookies or "").strip() and extra.is_file():
            raw_for_cookies = extra.read_text(encoding="utf-8")

        cookies = playwright_cookies_from_storage(raw_for_cookies, credentials, domain=".kuaishou.com")
        if cookies:
            try:
                await context.add_cookies(cookies)
            except Exception as exc:
                logger.warning("ks add cookies: %s", exc)

        page = context.pages[0] if context.pages else await context.new_page()
        publish_succeeded = False

        try:
            open_err = await _open_upload_page(page, debug_dir)
            if open_err:
                return open_err
            logger.info("ks upload page ready url=%s", page.url)
            await _screenshot(page, debug_dir, "ks_01_upload_page.png")

            upload_input = await _find_upload_input(page)
            if upload_input is None:
                await _screenshot(page, debug_dir, "ks_no_upload_final.png")
                return PublishResult(
                    success=False,
                    platform="kuaishou",
                    error="未找到上传入口，请在弹出浏览器中手动选择视频上传",
                )

            logger.info("ks uploading video=%s", video_path)
            await upload_input.set_input_files(video_path)

            await _screenshot(page, debug_dir, "ks_02_uploading.png")

            upload_done = False
            for _ in range(90 if not headless else 60):
                body = await page.inner_text("body")
                if any(k in body for k in ("上传成功", "重新上传", "上传完成", "视频预览")):
                    upload_done = True
                    break
                if "上传失败" in body or "格式不支持" in body:
                    break
                await asyncio.sleep(2)

            if not upload_done:
                await _screenshot(page, debug_dir, "ks_upload_timeout.png")
                return PublishResult(
                    success=False,
                    platform="kuaishou",
                    error="视频上传超时，请在弹出浏览器中确认上传完成后再点发布",
                )

            logger.info("ks upload done, filling meta")
            await _dismiss_modals(page)
            await _fill_description(page, text)
            await asyncio.sleep(2)
            await _screenshot(page, debug_dir, "ks_03_before_publish.png")

            clicked = await _click_publish_button(page) if current_submit_mode() == AUTO_SUBMIT else False
            logger.info("ks auto publish clicked=%s", clicked)

            ok = False
            try:
                if not page.is_closed():
                    ok = clicked or await _wait_for_publish_success(page, debug_dir, timeout_s=30)
            except Exception:
                ok = False
            if not ok and not headless:
                try:
                    if not page.is_closed():
                        ok = await wait_for_manual_publish_completion(
                            page,
                            lambda: _check_publish_success(page),
                        )
                except Exception:
                    ok = False
            if not ok:
                try:
                    if not page.is_closed():
                        ok = await _wait_for_publish_success(
                            page, debug_dir, timeout_s=60 if headless else 30
                        )
                except Exception:
                    ok = False
            if not ok:
                closed = False
                try:
                    closed = page.is_closed()
                except Exception:
                    closed = True
                await _screenshot(page, debug_dir, "ks_publish_uncertain.png")
                return PublishResult(
                    success=False,
                    platform="kuaishou",
                    error=(
                        "快手浏览器窗口已关闭，请不要手动关掉；重新发布后在窗口内点「发布」"
                        if closed
                        else "未确认发布成功：请在此 Chrome 窗口点「发布」；成功后才会打开下一平台"
                    ),
                )

            publish_succeeded = True
            await asyncio.sleep(2)
            await _screenshot(page, debug_dir, "ks_04_success.png")
            return PublishResult(
                success=True,
                platform="kuaishou",
                url=page.url,
                metadata={"title": title, "message": "发布成功，请到快手创作者中心或手机 App 确认"},
            )
        except Exception as exc:
            logger.exception("ks publish failed")
            await _screenshot(page, debug_dir, "ks_error.png")
            return PublishResult(success=False, platform="kuaishou", error=str(exc))
        finally:
            try:
                if publish_succeeded or headless:
                    await context.close()
                else:
                    logger.info("ks publish not confirmed — browser left open")
            except Exception as exc:
                logger.warning("ks context close: %s", exc)

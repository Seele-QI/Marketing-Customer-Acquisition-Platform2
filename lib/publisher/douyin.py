"""抖音创作者中心自动发布（对齐 bony-agent，使用登录 Profile）。"""
from __future__ import annotations

import asyncio
import logging
import os
import random
import shutil
import subprocess
from pathlib import Path
from typing import Dict, Optional

from lib.playwright_env import prepare_playwright_browsers_path
from lib.publisher.cookies import playwright_cookies_from_storage
from lib.publisher.types import PublishResult
from lib.publisher.submit_mode import AUTO_SUBMIT, current_submit_mode

logger = logging.getLogger("publisher.douyin")

STEALTH_PATH = Path(__file__).resolve().parent.parent / "stealth.min.js"

from lib.publisher.douyin_login_page import CHROME_UA, ensure_douyin_login_ui
from lib.publisher.profile_paths import user_cookie_file, user_profile_dir
from lib.publisher.publish_click import click_publish_once


def _ffmpeg_exe(project_root: str) -> str:
    env = (os.environ.get("FFMPEG_EXE") or "").strip()
    if env and os.path.isfile(env):
        return env
    local = Path(project_root) / "tools" / "ffmpeg" / "bin" / "ffmpeg.exe"
    if local.is_file():
        return str(local)
    return "ffmpeg"


def _extract_cover(video_path: str, cover_path: str, project_root: str) -> bool:
    ffmpeg = _ffmpeg_exe(project_root)
    try:
        if os.path.exists(cover_path):
            os.remove(cover_path)
        subprocess.run(
            [ffmpeg, "-y", "-ss", "00:00:01", "-i", video_path, "-frames:v", "1", "-q:v", "2", cover_path],
            capture_output=True,
            timeout=90,
            check=False,
        )
        return os.path.isfile(cover_path)
    except Exception as exc:
        logger.warning("extract cover failed: %s", exc)
        return False


def _headless() -> bool:
    return (os.environ.get("DOUYIN_PUBLISH_HEADLESS") or "0").strip().lower() in ("1", "true", "yes")


async def _screenshot(page, debug_dir: str, name: str) -> None:
    try:
        await page.screenshot(
            path=os.path.join(debug_dir, name),
            full_page=True,
            timeout=8000,
        )
    except Exception as exc:
        logger.warning("screenshot %s failed: %s", name, exc)


async def _dismiss_all_modals(page) -> None:
    """关闭抖音编辑页常见遮罩，避免挡住发布按钮。"""
    try:
        await page.keyboard.press("Escape")
        await asyncio.sleep(0.3)
    except Exception:
        pass
    for _ in range(3):
        clicked = False
        for sel in (
            '.semi-modal-close',
            '[aria-label="关闭"]',
            'button:has-text("我知道了")',
            'button:has-text("以后再说")',
            'button:has-text("暂不设置")',
            'button:has-text("取消")',
        ):
            loc = page.locator(sel)
            for i in range(await loc.count()):
                try:
                    btn = loc.nth(i)
                    if await btn.is_visible():
                        await btn.click(timeout=1500, force=True)
                        clicked = True
                        await asyncio.sleep(0.4)
                except Exception:
                    pass
        if not clicked:
            break
    try:
        await page.evaluate(
            """() => {
              document.querySelectorAll('.semi-modal-wrap, .semi-portal').forEach(wrap => {
                const btn = wrap.querySelector('.semi-modal-close, [aria-label="关闭"]');
                if (btn) btn.click();
              });
            }"""
        )
    except Exception:
        pass


async def _find_upload_input(page):
    """在主页/iframe 中定位视频 file input，必要时点击「上传视频」。"""
    from playwright.async_api import Locator

    selectors = [
        'input[type="file"][accept*="video"]',
        'input[type="file"]',
    ]

    async def scan() -> Locator | None:
        targets = [page, *page.frames]
        for target in targets:
            for sel in selectors:
                loc = target.locator(sel).first
                try:
                    if await loc.count() > 0:
                        return loc
                except Exception:
                    pass
        return None

    found = await scan()
    if found:
        return found

    for label in ["上传视频", "点击上传", "发布视频", "发作品"]:
        btn = page.get_by_text(label, exact=False).first
        try:
            if await btn.count() > 0 and await btn.is_visible():
                await btn.click(timeout=3000)
                await asyncio.sleep(1.5)
                found = await scan()
                if found:
                    return found
        except Exception:
            pass

    drag = page.locator('[class*="container-drag"], [class*="upload"], [class*="drag"]').first
    try:
        if await drag.count() > 0 and await drag.is_visible():
            await drag.click(timeout=3000)
            await asyncio.sleep(1)
            found = await scan()
            if found:
                return found
    except Exception:
        pass

    return None


async def _is_login_page(page) -> bool:
    current = page.url.lower()
    if "login" in current or "passport" in current:
        return True
    try:
        if await page.locator('text="扫码登录"').count() > 0:
            return True
        if await page.locator('text="验证码登录"').count() > 0:
            return True
    except Exception:
        pass
    return False


async def _wait_for_manual_login(
    page,
    debug_dir: str,
    *,
    timeout_s: int = 180,
    context=None,
    user_id: int = 0,
) -> bool:
    """与 bony-agent 一致：发布时弹出浏览器，用户可在窗口内扫码登录。"""
    logger.info("waiting for manual login up to %ss", timeout_s)
    for i in range(timeout_s // 2):
        if not await _is_login_page(page):
            if await _find_upload_input(page) is not None:
                if context is not None and user_id:
                    try:
                        from lib.connector_service import save_cookie_payload
                        import json

                        cookies = await context.cookies()
                        if cookies:
                            save_cookie_payload(
                                user_id, "douyin", json.dumps(cookies, ensure_ascii=False)
                            )
                            logger.info("douyin cookies synced after manual login user=%s", user_id)
                    except Exception as exc:
                        logger.warning("sync cookies after login: %s", exc)
                return True
        if await page.locator('input[type="file"]').count() > 0:
            return True
        if i in (0, 15, 30, 45, 60, 75):
            await _screenshot(page, debug_dir, f"douyin_login_wait_{i}.png")
        await asyncio.sleep(2)
    return False


async def _check_publish_success(page) -> bool:
    try:
        if page.is_closed():
            return False
        current_url = page.url
        body = ""
        try:
            body = await page.inner_text("body")
        except Exception:
            pass
        # 仍在「作品上传中 / 上传完成后将自动发布」不算成功
        if any(
            k in body
            for k in (
                "作品上传中",
                "上传完成后将自动发布",
                "请勿关闭页面",
            )
        ) and ("%" in body or "上传中" in body):
            return False
        if "/content/manage" in current_url and "/login/" not in current_url:
            # 管理页且无上传中浮层 → 成功
            if "作品上传中" not in body and "加载中，请稍候" not in body:
                return True
        if await page.locator(
            ':text("发布成功"), :text("作品已发布"), .semi-toast-content:has-text("发布成功")'
        ).count() > 0:
            return True
    except Exception:
        return False
    return False


async def _wait_upload_finish_after_publish(page, debug_dir: str, *, timeout_s: int = 300) -> bool:
    """点发布后抖音可能边上传边发：等到上传浮层消失再判成功。"""
    logger.info("douyin waiting upload finish after publish up to %ss", timeout_s)
    for i in range(timeout_s // 2):
        try:
            if page.is_closed():
                return False
            if await _check_publish_success(page):
                return True
            body = await page.inner_text("body")
            if "上传失败" in body:
                return False
            if i in (0, 15, 30, 45, 60, 90, 120):
                await _screenshot(page, debug_dir, f"douyin_after_publish_wait_{i}.png")
        except Exception as exc:
            logger.warning("wait upload finish: %s", exc)
        await asyncio.sleep(2)
    return await _check_publish_success(page)


def _needs_manual_verification(text: str) -> bool:
    keys = (
        "验证码",
        "安全验证",
        "短信验证",
        "手机号",
        "手机验证",
        "验证手机号",
        "请输入验证码",
        "获取验证码",
    )
    return any(k in (text or "") for k in keys)


async def _wait_for_publish_success(
    page,
    debug_dir: str,
    *,
    timeout_s: int = 300,
    shot_prefix: str = "douyin_publish_wait",
) -> tuple[str, bool]:
    """等待发布成功（含手机验证场景：须手动点发布，检测到成功后才结束）。"""
    logger.info("waiting for publish success up to %ss", timeout_s)
    await _screenshot(page, debug_dir, f"{shot_prefix}.png")
    for i in range(timeout_s // 2):
        try:
            if page.is_closed():
                return "closed", False
            if await _check_publish_success(page):
                return "success", True
        except Exception as exc:
            msg = str(exc).lower()
            if "closed" in msg or "target" in msg or "context" in msg:
                return "closed", False
            logger.warning("publish wait poll error: %s", exc)
        if i in (0, 15, 30, 45, 60, 90, 120, 150):
            await _screenshot(page, debug_dir, f"{shot_prefix}_{i}.png")
        await asyncio.sleep(2)
    return "timeout", False


async def _open_upload_page(
    page, debug_dir: str, *, context=None, user_id: int = 0
) -> PublishResult | None:
    """打开发布页并返回 None 表示成功；失败则返回 PublishResult。"""
    ok = await ensure_douyin_login_ui(
        page,
        context=context,
        debug_dir=debug_dir,
        clear_stale_cookies=False,
    )
    if ok and not await _is_login_page(page):
        upload_input = await _find_upload_input(page)
        if upload_input is not None:
            return None

    urls = [
        "https://creator.douyin.com/creator-micro/content/upload",
        "https://creator.douyin.com/creator-micro/content/publish/upload",
        "https://creator.douyin.com/",
    ]
    for url in urls:
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=90000)
            await asyncio.sleep(4)
            await _dismiss_all_modals(page)
        except Exception as exc:
            logger.warning("goto %s failed: %s", url, exc)
            continue

        current = page.url.lower()
        if await _is_login_page(page):
            await _screenshot(page, debug_dir, "douyin_login.png")
            if not _headless():
                if await _wait_for_manual_login(
                    page, debug_dir, context=context, user_id=user_id
                ):
                    upload_input = await _find_upload_input(page)
                    if upload_input is not None:
                        return None
            return PublishResult(
                success=False,
                platform="douyin",
                error="登录失效，请到「账号绑定」重新浏览器登录抖音（或在发布弹出的浏览器里扫码登录）",
            )

        upload_input = await _find_upload_input(page)
        if upload_input is not None:
            return None  # success signal for caller

    await _screenshot(page, debug_dir, "douyin_no_upload.png")
    return PublishResult(
        success=False,
        platform="douyin",
        error="未找到上传入口（请重新「账号绑定」浏览器登录，或发布时观察弹出的浏览器是否已登录）",
    )


async def _ensure_visibility_public(page) -> None:
    """发布前强制选「公开」，避免落到私密。"""
    try:
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(0.6)
    except Exception:
        pass

    # 展开「谁可以看」若为折叠态
    for opener in (
        'text="谁可以看"',
        '[class*="visibility"]',
        '[class*="permission"]',
        'label:has-text("谁可以看")',
    ):
        try:
            loc = page.locator(opener).first
            if await loc.count() > 0 and await loc.is_visible():
                await loc.click(timeout=2000)
                await asyncio.sleep(0.4)
                break
        except Exception:
            pass

    # 点选「公开」（排除「高清公开」等）
    candidates = (
        page.get_by_role("radio", name="公开"),
        page.get_by_text("公开", exact=True),
        page.locator('label:has-text("公开")'),
        page.locator('[class*="radio"]:has-text("公开")'),
        page.locator('div[role="radio"]:has-text("公开")'),
    )
    for loc in candidates:
        try:
            el = loc.first
            if await el.count() == 0:
                continue
            text = ((await el.inner_text()) or "").strip()
            if "私密" in text or "好友" in text or "高清" in text:
                continue
            if await el.is_visible():
                await el.click(timeout=2500, force=True)
                logger.info("douyin visibility set to 公开")
                await asyncio.sleep(0.5)
                return
        except Exception:
            continue

    # JS 兜底：找到含「公开」且旁边有「私密」的一组选项
    try:
        clicked = await page.evaluate(
            """() => {
              const nodes = Array.from(document.querySelectorAll(
                'label, [role="radio"], .semi-radio, span, div'
              ));
              for (const el of nodes) {
                const t = (el.innerText || '').trim();
                if (t !== '公开') continue;
                const r = el.getBoundingClientRect();
                if (r.width < 4 || r.height < 4) continue;
                el.click();
                return true;
              }
              return false;
            }"""
        )
        if clicked:
            logger.info("douyin visibility set to 公开 via js")
            await asyncio.sleep(0.5)
    except Exception as exc:
        logger.warning("ensure public visibility failed: %s", exc)


async def publish_douyin_video(
    video_path: str,
    title: str,
    description: str,
    credentials: Dict[str, str],
    *,
    project_root: str,
    cookie_raw: str = "",
    user_id: int = 0,
) -> PublishResult:
    if not credentials and not cookie_raw.strip():
        return PublishResult(success=False, platform="douyin", error="未绑定抖音账号或 Cookie 为空")
    if not os.path.isfile(video_path):
        return PublishResult(success=False, platform="douyin", error=f"视频不存在: {video_path}")

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return PublishResult(
            success=False,
            platform="douyin",
            error="缺少 playwright，请执行: pip install playwright && playwright install chromium",
        )

    debug_dir = os.path.join(project_root, "data", "temp", "publish-debug", f"user_{int(user_id)}")
    os.makedirs(debug_dir, exist_ok=True)
    profile_dir = user_profile_dir(project_root, user_id, "douyin")
    profile_dir.mkdir(parents=True, exist_ok=True)
    extra_cookie_path = user_cookie_file(project_root, user_id, "douyin")

    title = (title or "未命名作品")[:30]
    desc = (description or "")[:1000]

    upload_path = video_path
    temp_copy = os.path.join(debug_dir, f"upload_{os.path.basename(video_path)}")
    try:
        shutil.copy2(video_path, temp_copy)
        upload_path = temp_copy
    except Exception as exc:
        logger.warning("video copy failed: %s", exc)

    prepare_playwright_browsers_path(project_root)

    async with async_playwright() as p:
        headless = _headless()
        logger.info("douyin publish headless=%s profile=%s user=%s", headless, profile_dir, user_id)

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
        if not (raw_for_cookies or "").strip() and extra_cookie_path.is_file():
            raw_for_cookies = extra_cookie_path.read_text(encoding="utf-8")
        cookies = playwright_cookies_from_storage(raw_for_cookies, credentials, domain=".douyin.com")
        if cookies:
            try:
                await context.add_cookies(cookies)
            except Exception as exc:
                logger.warning("add cookies: %s", exc)

        page = context.pages[0] if context.pages else await context.new_page()
        publish_succeeded = False

        try:
            open_err = await _open_upload_page(page, debug_dir, context=context, user_id=user_id)
            if open_err:
                return open_err
            await _screenshot(page, debug_dir, "01_upload_page.png")

            async def clear_drafts() -> None:
                for label in ["放弃", "上次未发布", "继续编辑", "我知道了", "以后再说", "暂不"]:
                    loc = page.locator(f'text="{label}"')
                    for i in range(await loc.count()):
                        try:
                            btn = loc.nth(i)
                            if await btn.is_visible():
                                await btn.click(timeout=2000)
                                await asyncio.sleep(0.4)
                        except Exception:
                            pass

            await clear_drafts()
            await _dismiss_all_modals(page)

            upload_input = await _find_upload_input(page)
            if upload_input is None:
                for _ in range(3):
                    await clear_drafts()
                    await _dismiss_all_modals(page)
                    await page.reload(wait_until="domcontentloaded")
                    await asyncio.sleep(3)
                    upload_input = await _find_upload_input(page)
                    if upload_input is not None:
                        break
                    open_err = await _open_upload_page(
                        page, debug_dir, context=context, user_id=user_id
                    )
                    if open_err and "登录" in (open_err.error or ""):
                        return open_err
                    upload_input = await _find_upload_input(page)
                    if upload_input is not None:
                        break

            if upload_input is None:
                await _screenshot(page, debug_dir, "douyin_no_upload.png")
                return PublishResult(
                    success=False,
                    platform="douyin",
                    error="未找到上传入口（请重新「账号绑定」浏览器登录，发布时注意弹出的浏览器是否已登录创作者中心）",
                )

            await upload_input.set_input_files(upload_path)
            logger.info("video file set: %s", upload_path)

            uploaded = False
            for i in range(120):
                if "post/video" in page.url:
                    if await page.locator(
                        'input[placeholder*="标题"], .notranslate[contenteditable="true"]'
                    ).count() > 0:
                        uploaded = True
                        break
                if await page.locator('text="上传失败"').count() > 0:
                    await _screenshot(page, debug_dir, "douyin_upload_fail.png")
                    return PublishResult(success=False, platform="douyin", error="视频上传失败")
                if i in (0, 15, 30, 45, 60):
                    await _screenshot(page, debug_dir, f"douyin_upload_wait_{i}.png")
                await asyncio.sleep(2)

            if not uploaded:
                await _screenshot(page, debug_dir, "douyin_upload_timeout.png")
                return PublishResult(success=False, platform="douyin", error="视频上传超时，未进入编辑页")

            await asyncio.sleep(2)
            await _screenshot(page, debug_dir, "02_editor.png")

            title_input = page.locator(
                'input[placeholder*="添加标题"], input[placeholder*="输入标题"], input.semi-input'
            ).first
            if await title_input.count() > 0 and await title_input.is_visible():
                await title_input.click()
                await title_input.fill(title)
            else:
                editor = page.locator(".notranslate").first
                if await editor.count() > 0:
                    await editor.click()
                    await editor.fill(f"{title}\n{desc}")

            async def ensure_agreement() -> None:
                for sel in [".agreement-checkbox", 'input[type="checkbox"]', '[class*="agreement"]']:
                    box = page.locator(sel).first
                    if await box.count() > 0 and await box.is_visible():
                        try:
                            checked = await box.is_checked()
                        except Exception:
                            checked = False
                        if not checked:
                            await box.click(force=True, timeout=2000)
                            await asyncio.sleep(0.3)

            async def pick_auto_cover() -> None:
                """不打开封面编辑器，只点选系统自动生成的封面帧。"""
                await _dismiss_all_modals(page)
                await page.evaluate("window.scrollTo(0, 0)")
                await asyncio.sleep(0.8)
                selectors = [
                    '[class*="coverChoose"] img',
                    '[class*="cover"] img',
                    '[class*="static-frame"]',
                    '[class*="recommend"] img',
                ]
                for sel in selectors:
                    thumb = page.locator(sel).first
                    if await thumb.count() > 0:
                        try:
                            if await thumb.is_visible():
                                await thumb.click(timeout=2000, force=True)
                                await asyncio.sleep(0.8)
                                logger.info("picked auto cover via %s", sel)
                                return
                        except Exception:
                            pass

            await pick_auto_cover()
            await _screenshot(page, debug_dir, "03_after_cover.png")
            await ensure_agreement()
            await _ensure_visibility_public(page)
            await _dismiss_all_modals(page)

            async def wait_video_ready() -> None:
                import re as _re

                for _ in range(90):
                    try:
                        text = await page.inner_text("body")
                    except Exception:
                        break
                    uploading = any(k in text for k in ("处理中", "解析中", "上传中"))
                    # 「上传中 / 8%」这类进度
                    pct = bool(_re.search(r"上传[^\n]{0,20}\d+\s*%", text))
                    if uploading or pct:
                        if any(x in text for x in ("上传失败", "重新上传")):
                            break
                        await asyncio.sleep(3)
                        continue
                    break
                # 关掉「是否确认应用此封面」
                try:
                    confirm = page.get_by_role("button", name="确定").first
                    if await confirm.count() > 0 and await confirm.is_visible():
                        await confirm.click(timeout=2000)
                        await asyncio.sleep(0.5)
                except Exception:
                    pass

            async def click_publish_buttons() -> bool:
                await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                await asyncio.sleep(1)
                await _dismiss_all_modals(page)
                clicked_any = False
                for frame in page.frames:
                    for label in ["发布", "确认发布", "立即发布", "发布作品"]:
                        btns = frame.get_by_role("button", name=label)
                        for i in range(await btns.count()):
                            btn = btns.nth(i)
                            if not await btn.is_visible():
                                continue
                            text = (await btn.inner_text()) or ""
                            if "高清" in text or "取消" in text:
                                continue
                            try:
                                if await btn.is_enabled():
                                    await btn.click(force=True, timeout=10000)
                                    clicked_any = True
                                    await asyncio.sleep(2)
                            except Exception:
                                try:
                                    handle = await btn.element_handle()
                                    if handle:
                                        await frame.evaluate("el => el.click()", handle)
                                        clicked_any = True
                                        await asyncio.sleep(2)
                                except Exception:
                                    pass
                return clicked_any

            async def confirm_modals() -> None:
                await _dismiss_all_modals(page)
                for frame in page.frames:
                    for label in ["确认发布", "确定", "发布", "我知道了"]:
                        btns = frame.get_by_role("button", name=label)
                        for i in range(await btns.count()):
                            btn = btns.nth(i)
                            if not await btn.is_visible():
                                continue
                            text = (await btn.inner_text()) or ""
                            if "高清" in text:
                                continue
                            try:
                                await btn.click(timeout=3000)
                                await asyncio.sleep(1)
                            except Exception:
                                pass

            success_detected = False
            last_error = ""

            if current_submit_mode() != AUTO_SUBMIT:
                if headless:
                    return PublishResult(success=False, platform="douyin", error="人工确认模式需要可见浏览器")
                await page.bring_to_front()
                status, ok = await _wait_for_publish_success(
                    page,
                    debug_dir,
                    timeout_s=900,
                    shot_prefix="douyin_manual_confirm",
                )
                if ok:
                    publish_succeeded = True
                    await _screenshot(page, debug_dir, "05_success_manual.png")
                    return PublishResult(
                        success=True,
                        platform="douyin",
                        post_id="douyin_web_publish",
                        url=page.url,
                        metadata={"title": title, "message": "已确认平台发布成功", "submitMode": "manual_confirm"},
                    )
                return PublishResult(
                    success=False,
                    platform="douyin",
                    error="内容已自动填写，请在抖音创作者页面检查并点击发布",
                    metadata={"state": "waiting_user", "prepared": True, "closed": status == "closed"},
                )

            for attempt in range(15):
                logger.info("publish attempt %s/15", attempt + 1)
                await wait_video_ready()
                if attempt == 0:
                    await pick_auto_cover()
                    await ensure_agreement()
                await _ensure_visibility_public(page)
                await _dismiss_all_modals(page)

                if not await click_publish_buttons():
                    if await click_publish_once(page, ("发布", "确认发布", "立即发布", "发布作品")):
                        clicked_any = True
                    else:
                        last_error = "未找到可点击的发布按钮（视频可能仍在处理）"
                        await asyncio.sleep(4)
                        continue

                await confirm_modals()
                await asyncio.sleep(5)
                await _screenshot(page, debug_dir, f"04_after_click_{attempt}.png")

                content = await page.content()
                if _needs_manual_verification(content) and not _headless():
                    await _screenshot(page, debug_dir, "douyin_captcha.png")
                    status, ok = await _wait_for_publish_success(
                        page,
                        debug_dir,
                        timeout_s=300,
                        shot_prefix="douyin_manual_verify",
                    )
                    if ok:
                        success_detected = True
                        break
                    if status == "closed":
                        last_error = "浏览器已关闭，但未检测到发布成功。请确认是否已点「发布」并看到成功提示"
                        break
                    last_error = "手机验证后发布超时：请完成验证、点击「发布」，等待出现成功提示（浏览器会自动关闭）"
                    break

                if _needs_manual_verification(content) and _headless():
                    await _screenshot(page, debug_dir, "douyin_captcha.png")
                    last_error = "抖音需要手机验证，请使用可见浏览器模式（默认已开启）在弹窗中手动完成"
                    break

                if "开小差" in content or await page.locator('.semi-toast-overlay:has-text("失败")').count() > 0:
                    last_error = "抖音服务器繁忙，正在重试…"
                    await asyncio.sleep(5)
                    continue

                current_url = page.url
                if "/content/manage" in current_url and "/login/" not in current_url:
                    if await _wait_upload_finish_after_publish(page, debug_dir, timeout_s=240):
                        success_detected = True
                        break
                    last_error = "已进入作品管理，但仍在上传中；请勿关闭窗口，等待上传完成"
                    continue

                if await page.locator(
                    '.semi-toast-overlay:has-text("作品已发布"), .semi-toast-content:has-text("发布成功"), :text("发布成功")'
                ).count() > 0:
                    success_detected = True
                    break

                try:
                    await page.wait_for_url(
                        lambda u: "/content/manage" in u and "/login/" not in u,
                        timeout=20000,
                    )
                    if await _wait_upload_finish_after_publish(page, debug_dir, timeout_s=240):
                        success_detected = True
                        break
                    last_error = "已进入作品管理，但仍在上传中"
                except Exception:
                    # 有时不跳转但 toast 成功；或仍在 post/video 页
                    if await page.locator(':text("发布成功"), :text("作品已发布")').count() > 0:
                        success_detected = True
                        break
                    last_error = "已点击发布但未跳转到作品管理页（可能被弹窗或封面要求拦住）"

                await confirm_modals()
                await asyncio.sleep(3)

            if success_detected:
                publish_succeeded = True
                if not headless:
                    await asyncio.sleep(2)
                await _screenshot(page, debug_dir, "05_success.png")
                return PublishResult(
                    success=True,
                    platform="douyin",
                    post_id="douyin_web_publish",
                    url="https://creator.douyin.com/creator/content/manage",
                    metadata={"title": title, "message": "发布成功，浏览器已自动关闭"},
                )

            if not headless:
                status, ok = await _wait_for_publish_success(
                    page,
                    debug_dir,
                    timeout_s=600,
                    shot_prefix="douyin_manual_wait",
                )
                if ok:
                    publish_succeeded = True
                    await _screenshot(page, debug_dir, "05_success_manual.png")
                    return PublishResult(
                        success=True,
                        platform="douyin",
                        post_id="douyin_web_publish",
                        url=page.url,
                        metadata={"title": title, "message": "发布成功，浏览器已自动关闭"},
                    )

            await _screenshot(page, debug_dir, "douyin_final_error.png")
            hint = last_error or "发布未完成"
            if not headless and "手机验证" not in hint:
                hint += "。请在此 Chrome 窗口完成发布；成功后才会打开下一平台"
            return PublishResult(
                success=False,
                platform="douyin",
                error=f"{hint}。截图目录: data/temp/publish-debug/",
            )
        except Exception as exc:
            logger.exception("douyin publish failed")
            await _screenshot(page, debug_dir, "douyin_error.png")
            return PublishResult(success=False, platform="douyin", error=str(exc))
        finally:
            try:
                if publish_succeeded or headless:
                    await context.close()
                else:
                    logger.info("douyin publish not confirmed — browser left open for manual completion")
            except Exception as exc:
                logger.warning("context close: %s", exc)
            if upload_path != video_path and os.path.isfile(upload_path):
                try:
                    os.remove(upload_path)
                except Exception:
                    pass

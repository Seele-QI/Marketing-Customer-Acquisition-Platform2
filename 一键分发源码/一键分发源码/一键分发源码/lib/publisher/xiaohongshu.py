"""小红书创作者中心自动发布（模式对齐抖音：可见浏览器 + Profile + 多入口找上传）。"""
from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path
from typing import Dict, Optional

from lib.playwright_env import prepare_playwright_browsers_path
from lib.publisher.cookies import playwright_cookies_from_storage
from lib.publisher.douyin_login_page import CHROME_UA
from lib.publisher.profile_paths import user_cookie_file, user_profile_dir
from lib.publisher.publish_click import auto_publish_with_retries, wait_for_manual_publish_completion
from lib.publisher.types import PublishResult

logger = logging.getLogger("publisher.xiaohongshu")

STEALTH_PATH = Path(__file__).resolve().parent.parent / "stealth.min.js"

XHS_PUBLISH_URLS = (
    "https://creator.xiaohongshu.com/publish/publish?from=homepage&target=video",
    "https://creator.xiaohongshu.com/publish/publish?target=video",
    "https://creator.xiaohongshu.com/publish/publish",
    "https://creator.xiaohongshu.com/",
)


def _headless() -> bool:
    return (os.environ.get("XHS_PUBLISH_HEADLESS") or "0").strip().lower() in ("1", "true", "yes")


async def _screenshot(page, debug_dir: str, name: str) -> None:
    try:
        await page.screenshot(path=os.path.join(debug_dir, name), full_page=True, timeout=8000)
    except Exception as exc:
        logger.warning("xhs screenshot %s failed: %s", name, exc)


async def _dismiss_modals(page) -> None:
    try:
        await page.keyboard.press("Escape")
        await asyncio.sleep(0.3)
    except Exception:
        pass
    for sel in (
        '[aria-label="关闭"]',
        'button:has-text("我知道了")',
        'button:has-text("知道了")',
        'button:has-text("跳过")',
        'button:has-text("以后再说")',
        'button:has-text("取消")',
        ".close-icon",
    ):
        try:
            loc = page.locator(sel)
            for i in range(await loc.count()):
                btn = loc.nth(i)
                if await btn.is_visible():
                    await btn.click(timeout=1500, force=True)
                    await asyncio.sleep(0.3)
        except Exception:
            pass


async def _find_upload_input(page):
    from playwright.async_api import Locator

    selectors = [
        'input[type="file"][accept*="video"]',
        'input[type="file"]',
        ".upload-input input[type='file']",
    ]

    async def scan() -> Optional[Locator]:
        for target in [page, *page.frames]:
            for sel in selectors:
                try:
                    loc = target.locator(sel).first
                    if await loc.count() > 0:
                        return loc
                except Exception:
                    pass
        return None

    found = await scan()
    if found:
        return found

    for label in ("上传视频", "发布视频", "点击上传", "上传", "发视频", "视频"):
        try:
            tab = page.get_by_text(label, exact=False).first
            if await tab.count() > 0 and await tab.is_visible():
                await tab.click(timeout=3000)
                await asyncio.sleep(1.5)
                found = await scan()
                if found:
                    return found
        except Exception:
            pass

    for sel in (".upload-input", ".upload-container", '[class*="upload"]', '[class*="drag"]'):
        try:
            box = page.locator(sel).first
            if await box.count() > 0 and await box.is_visible():
                await box.click(timeout=3000)
                await asyncio.sleep(1)
                found = await scan()
                if found:
                    return found
        except Exception:
            pass

    return None


async def _is_login_page(page) -> bool:
    url = page.url.lower()
    if "login" in url or "passport" in url:
        return True
    for text in ("扫码登录", "手机号登录", "验证码登录", "请登录"):
        try:
            if await page.locator(f'text="{text}"').count() > 0:
                return True
        except Exception:
            pass
    return False


async def _wait_for_manual_login(page, debug_dir: str, *, timeout_s: int = 180) -> bool:
    logger.info("xhs waiting for manual login up to %ss", timeout_s)
    for i in range(timeout_s // 2):
        if not await _is_login_page(page):
            if await _find_upload_input(page) is not None:
                return True
        if i in (0, 15, 30, 45, 60):
            await _screenshot(page, debug_dir, f"xhs_login_wait_{i}.png")
        await asyncio.sleep(2)
    return False


async def _open_upload_page(page, debug_dir: str) -> PublishResult | None:
    for url in XHS_PUBLISH_URLS:
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=90000)
            await asyncio.sleep(4)
            await _dismiss_modals(page)
        except Exception as exc:
            logger.warning("xhs goto %s failed: %s", url, exc)
            continue

        if await _is_login_page(page):
            await _screenshot(page, debug_dir, "xhs_login.png")
            if not _headless():
                if await _wait_for_manual_login(page, debug_dir):
                    if await _find_upload_input(page) is not None:
                        return None
            return PublishResult(
                success=False,
                platform="xiaohongshu",
                error="登录失效，请到「账号绑定」重新浏览器登录（或在弹出浏览器里扫码登录）",
            )

        upload_input = await _find_upload_input(page)
        if upload_input is not None:
            return None

    await _screenshot(page, debug_dir, "xhs_no_upload.png")
    return PublishResult(
        success=False,
        platform="xiaohongshu",
        error="未找到上传入口，请重新「账号绑定」浏览器登录，或发布时在弹出浏览器中手动上传",
    )


async def _check_publish_success(page) -> bool:
    """严格判定；URL 含 published=true 视为已发布。"""
    try:
        url = page.url.lower()
        if "published=true" in url or "publish_success" in url:
            return True
        # 仍在未发布编辑页不算成功
        if "/publish/publish" in url and "published=true" not in url:
            return False
        if "/publish" in url and "manage" not in url and "published=true" not in url:
            return False
        if "/creator/" in url and "manage" in url:
            return True
        if "success" in url or "result" in url:
            return True
        body = await page.inner_text("body")
        if any(k in body for k in ("发布成功", "发布完成", "笔记已发布", "提交成功", "笔记发布成功")):
            return True
        if ("笔记管理" in body or "作品管理" in body) and "审核中" in body:
            if "填写标题" not in body and "暂存离开" not in body:
                return True
    except Exception:
        return False
    return False


async def _wait_for_publish_success(page, debug_dir: str, *, timeout_s: int = 120) -> bool:
    try:
        await page.wait_for_url(
            lambda u: ("manage" in u) or ("published=true" in u.lower()),
            timeout=min(timeout_s, 45) * 1000,
        )
        if await _check_publish_success(page):
            return True
    except Exception:
        pass

    for i in range(timeout_s // 2):
        if page.is_closed():
            return False
        if await _check_publish_success(page):
            return True
        if i in (0, 15, 30, 45, 60):
            await _screenshot(page, debug_dir, f"xhs_publish_wait_{i}.png")
        await asyncio.sleep(2)
    return False


async def _fill_description(page, desc: str) -> None:
    if not (desc or "").strip():
        return
    editor_selectors = (
        ".ql-editor",
        "div[contenteditable='true']",
        "#post-textarea",
        ".content-input .editor",
    )
    editor = None
    for sel in editor_selectors:
        try:
            el = page.locator(sel).first
            if await el.count() > 0 and await el.is_visible():
                editor = el
                break
        except Exception:
            pass

    if editor is None:
        return

    try:
        await editor.scroll_into_view_if_needed()
        await editor.click()
        await asyncio.sleep(0.5)
        await page.keyboard.press("Control+A")
        await page.keyboard.press("Backspace")
        await page.keyboard.type(desc, delay=40)
        val = (await editor.inner_text()).strip()
        if not val:
            await page.evaluate(
                """(content) => {
                  const el = document.querySelector(".ql-editor")
                    || document.querySelector("div[contenteditable='true']");
                  if (!el) return;
                  el.innerHTML = "<p>" + content.replace(/\\n/g, "</p><p>") + "</p>";
                  el.dispatchEvent(new Event("input", { bubbles: true }));
                }""",
                desc,
            )
    except Exception as exc:
        logger.warning("xhs fill description: %s", exc)


async def _ensure_xhs_public(page) -> None:
    """确保「公开可见」。"""
    try:
        pub = page.get_by_text("公开可见", exact=False).first
        if await pub.count() > 0 and await pub.is_visible():
            await pub.click(timeout=2000, force=True)
            await asyncio.sleep(0.3)
    except Exception:
        pass


async def _click_xhs_publish_once(page) -> bool:
    """优先点编辑页底部红色「发布」主按钮，避免点到侧栏其它入口。"""
    # 先按角色精确匹配
    try:
        btn = page.get_by_role("button", name="发布", exact=True).last
        if await btn.count() > 0 and await btn.is_visible():
            try:
                if not await btn.is_disabled():
                    await btn.scroll_into_view_if_needed()
                    await btn.click(timeout=8000, force=True)
                    logger.info("xhs clicked publish via role=button")
                    await asyncio.sleep(1.5)
                    return True
            except Exception:
                pass
    except Exception:
        pass

    selectors = (
        'button:has-text("发布")',
        '[class*="btn"]:has-text("发布")',
        '[class*="publish"] button',
        '[class*="footer"] button:has-text("发布")',
        '[class*="submit"] button:has-text("发布")',
        'div[class*="submit"] >> text=发布',
    )
    for sel in selectors:
        try:
            btn = page.locator(sel).last
            if await btn.count() == 0:
                continue
            if not await btn.is_visible():
                continue
            text = ((await btn.inner_text()) or "").strip().replace("\n", "")
            if "定时" in text or "高清" in text or "暂存" in text:
                continue
            if "发布" not in text:
                continue
            try:
                if await btn.is_disabled():
                    continue
            except Exception:
                pass
            await btn.scroll_into_view_if_needed()
            await btn.click(timeout=8000, force=True)
            logger.info("xhs clicked publish via %s text=%r", sel, text[:20])
            await asyncio.sleep(1.5)
            return True
        except Exception:
            continue

    # JS：点页面最靠下的「发布」按钮
    try:
        clicked = await page.evaluate(
            """() => {
              const btns = Array.from(document.querySelectorAll('button, [role="button"], div, span, a'));
              let best = null;
              let bestY = -1;
              for (const el of btns) {
                const t = (el.innerText || el.textContent || '').replace(/\\s+/g, '').trim();
                if (t !== '发布' && t !== '立即发布' && t !== '发布笔记') continue;
                if (t.includes('定时') || t.includes('高清') || t.includes('暂存')) continue;
                const r = el.getBoundingClientRect();
                if (r.width < 30 || r.height < 16) continue;
                const st = getComputedStyle(el);
                if (st.display === 'none' || st.visibility === 'hidden' || st.pointerEvents === 'none') continue;
                if (r.top > bestY) { best = el; bestY = r.top; }
              }
              if (!best) return false;
              best.scrollIntoView({ block: 'center' });
              best.click();
              return true;
            }"""
        )
        if clicked:
            logger.info("xhs clicked publish via js bottom button")
            await asyncio.sleep(1.5)
            return True
    except Exception as exc:
        logger.warning("xhs js publish click: %s", exc)
    return False


async def _prepare_before_publish(page) -> None:
    await _dismiss_modals(page)
    for _ in range(20):
        try:
            body = await page.inner_text("body")
        except Exception:
            break
        if any(k in body for k in ("处理中", "上传中", "解析中", "转码中")):
            await asyncio.sleep(2)
            continue
        break
    for sel in ('[class*="cover"] img', ".cover img", '[class*="Cover"] img'):
        try:
            thumb = page.locator(sel).first
            if await thumb.count() > 0 and await thumb.is_visible():
                await thumb.click(timeout=2000, force=True)
                await asyncio.sleep(1)
                break
        except Exception:
            pass
    for sel in ('input[type="checkbox"]', ".agreement-checkbox", '[class*="agreement"]'):
        try:
            box = page.locator(sel).first
            if await box.count() > 0 and await box.is_visible():
                checked = False
                try:
                    checked = await box.is_checked()
                except Exception:
                    pass
                if not checked:
                    await box.click(force=True, timeout=2000)
        except Exception:
            pass
    await _ensure_xhs_public(page)
    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
    await asyncio.sleep(1)


async def _click_publish_button(page) -> bool:
    # 先用专用底部按钮点击，再走通用重试
    async def prepare() -> None:
        await _prepare_before_publish(page)

    async def dismiss() -> None:
        await _dismiss_modals(page)

    for attempt in range(12):
        if page.is_closed():
            return False
        logger.info("xhs publish attempt %s/12", attempt + 1)
        await prepare()
        await dismiss()
        if await _click_xhs_publish_once(page):
            await asyncio.sleep(2)
            if await _check_publish_success(page):
                return True
            # 可能弹出确认框
            for label in ("确认发布", "确定", "发布", "我知道了"):
                try:
                    btn = page.get_by_role("button", name=label).first
                    if await btn.count() > 0 and await btn.is_visible():
                        await btn.click(timeout=2000)
                        await asyncio.sleep(1)
                except Exception:
                    pass
            if await _check_publish_success(page):
                return True
        else:
            # 兜底通用点击
            if await auto_publish_with_retries(
                page,
                dismiss_fn=dismiss,
                prepare_fn=prepare,
                is_success_fn=lambda: _check_publish_success(page),
                publish_labels=("发布", "发布笔记", "立即发布"),
                max_attempts=3,
                interval_s=2,
                allow_step_clicks=False,
            ):
                return True
        await asyncio.sleep(2)
    return await _check_publish_success(page)


async def publish_xiaohongshu_video(
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
        return PublishResult(success=False, platform="xiaohongshu", error="未绑定小红书账号")
    if not os.path.isfile(video_path):
        return PublishResult(success=False, platform="xiaohongshu", error=f"视频不存在: {video_path}")

    try:
        from playwright.async_api import async_playwright
    except ImportError:
        return PublishResult(
            success=False,
            platform="xiaohongshu",
            error="缺少 playwright，请执行: pip install playwright && playwright install chromium",
        )

    debug_dir = os.path.join(project_root, "data", "temp", "publish-debug", f"user_{int(user_id)}")
    os.makedirs(debug_dir, exist_ok=True)
    profile_dir = user_profile_dir(project_root, user_id, "xiaohongshu")
    profile_dir.mkdir(parents=True, exist_ok=True)
    title = (title or "未命名")[:20]
    desc = (description or "")[:1000]
    headless = _headless()

    prepare_playwright_browsers_path(project_root)

    async with async_playwright() as p:
        logger.info("xhs publish headless=%s profile=%s user=%s", headless, profile_dir, user_id)
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
        extra = user_cookie_file(project_root, user_id, "xiaohongshu")
        if not (raw_for_cookies or "").strip() and extra.is_file():
            raw_for_cookies = extra.read_text(encoding="utf-8")

        cookies = playwright_cookies_from_storage(raw_for_cookies, credentials, domain=".xiaohongshu.com")
        if cookies:
            try:
                await context.add_cookies(cookies)
            except Exception as exc:
                logger.warning("xhs add cookies: %s", exc)

        page = context.pages[0] if context.pages else await context.new_page()
        publish_succeeded = False

        try:
            open_err = await _open_upload_page(page, debug_dir)
            if open_err:
                return open_err
            logger.info("xhs upload page ready url=%s", page.url)
            await _screenshot(page, debug_dir, "xhs_01_upload_page.png")

            upload_input = await _find_upload_input(page)
            if upload_input is None:
                await _screenshot(page, debug_dir, "xhs_no_upload_final.png")
                return PublishResult(
                    success=False,
                    platform="xiaohongshu",
                    error="未找到上传入口，请在弹出浏览器中手动选择视频上传",
                )

            logger.info("xhs uploading video=%s", video_path)
            await upload_input.set_input_files(video_path)
            await _screenshot(page, debug_dir, "xhs_02_uploading.png")

            upload_done = False
            for _ in range(90 if not headless else 60):
                body = await page.inner_text("body")
                if any(k in body for k in ("上传成功", "重新上传", "上传完成", "视频预览")):
                    upload_done = True
                    break
                await asyncio.sleep(2)

            if not upload_done:
                await _screenshot(page, debug_dir, "xhs_upload_timeout.png")
                return PublishResult(
                    success=False,
                    platform="xiaohongshu",
                    error="视频上传超时，请在弹出浏览器中确认上传完成后再点发布",
                )

            logger.info("xhs upload done, filling meta")
            await _dismiss_modals(page)
            await asyncio.sleep(2)

            title_box = page.locator(
                '.title-input input, input[placeholder*="标题"], input[placeholder*="填写标题"], .d-text'
            ).first
            if await title_box.count() > 0:
                await title_box.fill(title)

            # 正文为空时用标题兜底，避免只填标题不发布
            desc_final = (desc or "").strip() or title
            await _fill_description(page, desc_final)
            await _dismiss_modals(page)
            await asyncio.sleep(2)
            await _screenshot(page, debug_dir, "xhs_03_before_publish.png")

            clicked = await _click_publish_button(page)
            logger.info("xhs auto publish clicked=%s url=%s", clicked, page.url)

            # 仅「点过发布」不算成功，必须以页面状态确认（含 published=true）
            ok = await _check_publish_success(page)
            if not ok:
                ok = await _wait_for_publish_success(page, debug_dir, timeout_s=60)
            if not ok and not headless:
                # 缩短等待：若 URL 已 published=true 会立刻成功
                ok = await wait_for_manual_publish_completion(
                    page,
                    lambda: _check_publish_success(page),
                    timeout_s=180,
                )
            if not ok:
                ok = await _check_publish_success(page)
            if not ok:
                await _screenshot(page, debug_dir, "xhs_publish_uncertain.png")
                return PublishResult(
                    success=False,
                    platform="xiaohongshu",
                    error="未确认发布成功：请在此 Chrome 窗口点红色「发布」；成功后才会打开下一平台",
                )

            publish_succeeded = True
            await asyncio.sleep(2)
            await _screenshot(page, debug_dir, "xhs_04_success.png")
            return PublishResult(
                success=True,
                platform="xiaohongshu",
                url=page.url,
                metadata={"title": title, "message": "发布成功，请到创作者中心笔记管理或手机 App 确认"},
            )
        except Exception as exc:
            logger.exception("xhs publish failed")
            await _screenshot(page, debug_dir, "xhs_error.png")
            return PublishResult(success=False, platform="xiaohongshu", error=str(exc))
        finally:
            try:
                if publish_succeeded or headless:
                    await context.close()
                else:
                    logger.info("xhs publish not confirmed — browser left open")
            except Exception as exc:
                logger.warning("xhs context close: %s", exc)

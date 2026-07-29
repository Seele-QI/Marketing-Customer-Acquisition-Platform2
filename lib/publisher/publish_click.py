"""各平台发布按钮自动点击（滚动、重试、确认弹窗）。"""
from __future__ import annotations

import asyncio
import logging
import os
import re
from typing import Awaitable, Callable, Iterable, Optional, Sequence

logger = logging.getLogger("publisher.publish_click")

MANUAL_PUBLISH_WAIT_S = int(os.environ.get("MANUAL_PUBLISH_WAIT_S", "600"))

DEFAULT_PUBLISH_LABELS: Sequence[str] = (
    "发布",
    "确认发布",
    "立即发布",
    "发布笔记",
    "发布作品",
)
DEFAULT_CONFIRM_LABELS: Sequence[str] = ("确认发布", "确定", "我知道了", "发布", "确认")
DEFAULT_STEP_LABELS: Sequence[str] = ("下一步", "已检查完毕", "立刻体验", "跳过")


async def scroll_to_bottom(page) -> None:
    try:
        if page.is_closed():
            return
        await page.evaluate(
            """() => {
              window.scrollTo(0, document.body.scrollHeight);
              document.querySelectorAll('div, section, main').forEach(c => {
                if (c.scrollHeight > c.clientHeight) c.scrollTop = c.scrollHeight;
              });
            }"""
        )
        await asyncio.sleep(0.8)
    except Exception:
        pass


async def _page_alive(page) -> bool:
    try:
        return not page.is_closed()
    except Exception:
        return False


async def _try_js_click(page, text: str) -> bool:
    try:
        if page.is_closed():
            return False
        return bool(
            await page.evaluate(
                """(label) => {
                  const nodes = Array.from(document.querySelectorAll(
                    'button, [role="button"], .ant-btn, .semi-button, span, div'
                  ));
                  for (const el of nodes) {
                    const t = (el.innerText || el.textContent || '').trim();
                    if (t !== label) continue;
                    const r = el.getBoundingClientRect();
                    if (r.width < 8 || r.height < 8) continue;
                    const st = window.getComputedStyle(el);
                    if (st.display === 'none' || st.visibility === 'hidden') continue;
                    el.scrollIntoView({ block: 'center' });
                    el.click();
                    return true;
                  }
                  return false;
                }""",
                text,
            )
        )
    except Exception:
        return False


async def _click_labels_in_frame(frame, labels: Iterable[str], *, skip_re: Optional[re.Pattern] = None) -> bool:
    clicked = False
    for label in labels:
        try:
            btns = frame.get_by_role("button", name=label)
            for i in range(await btns.count()):
                btn = btns.nth(i)
                if not await btn.is_visible():
                    continue
                text = ((await btn.inner_text()) or "").strip()
                if skip_re and skip_re.search(text):
                    continue
                try:
                    disabled = await btn.is_disabled()
                except Exception:
                    disabled = False
                if disabled:
                    continue
                try:
                    await btn.scroll_into_view_if_needed()
                    await btn.click(timeout=8000, force=True)
                    clicked = True
                    await asyncio.sleep(1)
                except Exception:
                    try:
                        handle = await btn.element_handle()
                        if handle:
                            await frame.evaluate("el => el.click()", handle)
                            clicked = True
                            await asyncio.sleep(1)
                    except Exception:
                        pass
        except Exception:
            pass

        for sel in (
            f'button:has-text("{label}")',
            f'.ant-btn:has-text("{label}")',
            f'.semi-button:has-text("{label}")',
            f'.publishBtn:has-text("{label}")',
            f'.submit-btn:has-text("{label}")',
        ):
            try:
                btn = frame.locator(sel).first
                if await btn.count() > 0 and await btn.is_visible():
                    try:
                        if await btn.is_disabled():
                            continue
                    except Exception:
                        pass
                    await btn.scroll_into_view_if_needed()
                    await btn.click(timeout=8000, force=True)
                    clicked = True
                    await asyncio.sleep(1)
            except Exception:
                pass
    return clicked


async def click_step_buttons(page, labels: Sequence[str] = DEFAULT_STEP_LABELS) -> bool:
    clicked = False
    for frame in [page, *page.frames]:
        if await _click_labels_in_frame(frame, labels):
            clicked = True
    return clicked


async def click_confirm_modals(page, labels: Sequence[str] = DEFAULT_CONFIRM_LABELS) -> None:
    skip = re.compile(r"高清|取消")
    for frame in [page, *page.frames]:
        await _click_labels_in_frame(frame, labels, skip_re=skip)


async def click_publish_once(
    page,
    labels: Sequence[str] = DEFAULT_PUBLISH_LABELS,
) -> bool:
    skip = re.compile(r"高清|取消|草稿")
    clicked = False
    for frame in [page, *page.frames]:
        if await _click_labels_in_frame(frame, labels, skip_re=skip):
            clicked = True
    if not clicked:
        for label in labels:
            if await _try_js_click(page, label):
                clicked = True
                break
    if clicked:
        await asyncio.sleep(1)
        await click_confirm_modals(page)
    return clicked


async def auto_publish_with_retries(
    page,
    *,
    dismiss_fn: Optional[Callable[[], Awaitable[None]]] = None,
    prepare_fn: Optional[Callable[[], Awaitable[None]]] = None,
    is_success_fn: Optional[Callable[[], Awaitable[bool]]] = None,
    publish_labels: Sequence[str] = DEFAULT_PUBLISH_LABELS,
    max_attempts: int = 18,
    interval_s: float = 3.0,
    allow_step_clicks: bool = True,
) -> bool:
    """多次尝试自动点发布，处理视频处理中、引导步骤、底部固定按钮等情况。"""
    for attempt in range(max_attempts):
        if not await _page_alive(page):
            logger.warning("auto publish stopped: page/browser closed at attempt %s", attempt + 1)
            return False
        logger.info("auto publish attempt %s/%s", attempt + 1, max_attempts)
        try:
            if prepare_fn:
                await prepare_fn()
            if dismiss_fn:
                await dismiss_fn()
            await scroll_to_bottom(page)

            if allow_step_clicks and attempt < max_attempts - 1:
                await click_step_buttons(page)

            if await click_publish_once(page, publish_labels):
                await click_confirm_modals(page)
                await asyncio.sleep(2)
                if is_success_fn:
                    if await is_success_fn():
                        return True
                else:
                    body = ""
                    try:
                        body = await page.inner_text("body")
                    except Exception:
                        pass
                    if any(
                        k in body
                        for k in (
                            "发布成功",
                            "发布完成",
                            "发表成功",
                            "已发表",
                            "审核中",
                            "笔记管理",
                            "作品管理",
                        )
                    ):
                        return True
        except Exception as exc:
            msg = str(exc).lower()
            if "closed" in msg or "target" in msg:
                logger.warning("auto publish interrupted (browser closed): %s", exc)
                return False
            logger.warning("auto publish attempt %s error: %s", attempt + 1, exc)

        await asyncio.sleep(interval_s)
    return False


async def wait_for_manual_publish_completion(
    page,
    is_success_fn,
    *,
    timeout_s: int = MANUAL_PUBLISH_WAIT_S,
    poll_s: float = 2.0,
) -> bool:
    """未自动确认成功时，保持当前浏览器窗口，等待用户手动点发布直至成功。"""
    logger.info("waiting for manual publish completion up to %ss", timeout_s)
    for _ in range(max(int(timeout_s // poll_s), 1)):
        try:
            if page.is_closed():
                return False
        except Exception:
            return False
        try:
            if await is_success_fn():
                return True
        except Exception:
            pass
        await asyncio.sleep(poll_s)
    return False

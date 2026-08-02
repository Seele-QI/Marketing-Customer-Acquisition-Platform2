"""Conservative browser-first publishers for GEO articles."""
from __future__ import annotations

import asyncio
import re
from pathlib import Path
from typing import Any, Dict, Iterable

from lib.playwright_env import prepare_playwright_browsers_path
from lib.publisher.profile_paths import user_profile_dir
from lib.publisher.types import PublishResult
from lib.publisher.submit_mode import AUTO_SUBMIT, normalize_submit_mode

try:
    from playwright.async_api import async_playwright
except ImportError:
    async_playwright = None

ARTICLE_CONFIG: Dict[str, Dict[str, Any]] = {
    "zhihu": {"url": "https://www.zhihu.com/creator/manage/creation/article", "title": ["textarea[placeholder*='标题']", "input[placeholder*='标题']", ".WriteIndex-titleInput textarea"], "editor": [".public-DraftEditor-content[contenteditable='true']", ".DraftEditor-editorContainer [contenteditable='true']", "div[contenteditable='true'][role='textbox']"], "publish": ["button:has-text('发布文章')", "button:has-text('发布')"], "entry": ["写文章", "发布文章"]},
    "weibo": {"url": "https://weibo.com/ttarticle/p/editor", "title": ["input[placeholder*='标题']", "textarea[placeholder*='标题']"], "editor": [".ProseMirror", ".ql-editor", "div[contenteditable='true'][role='textbox']"], "publish": ["button:has-text('下一步')", "button:has-text('发布')", "a:has-text('发布')"], "entry": ["头条文章", "写文章"]},
    "sohu": {"url": "https://mp.sohu.com/mpfe/v4/contentManagement/news/addarticle", "title": ["input[placeholder*='标题']", "textarea[placeholder*='标题']"], "editor": [".ql-editor", ".ProseMirror", "div[contenteditable='true'][role='textbox']"], "publish": ["button:has-text('发布')", "button:has-text('预览')"], "entry": ["写文章", "发布文章"]},
    "xiaohongshu": {"url": "https://creator.xiaohongshu.com/publish/publish?target=image", "title": ["input[placeholder*='标题']", "textarea[placeholder*='标题']"], "editor": ["div[contenteditable='true'][role='textbox']", "div[contenteditable='true']", "textarea[placeholder*='正文']", "textarea[placeholder*='描述']"], "publish": ["button:has-text('发布')"], "entry": ["上传图文", "发布笔记", "图文"]},
    "dianping": {"url": "https://www.dianping.com/", "title": ["input[placeholder*='标题']", "textarea[placeholder*='标题']"], "editor": [".ProseMirror", ".ql-editor", "div[contenteditable='true'][role='textbox']", "textarea[placeholder*='正文']"], "publish": ["button:has-text('发布')", "button:has-text('提交')"], "entry": ["发布笔记", "写点评", "创作中心"]},
    "ctrip": {"url": "https://we.ctrip.com/publish/contentManagement", "title": ["input[placeholder*='标题']", "textarea[placeholder*='标题']"], "editor": [".ProseMirror", ".ql-editor", "div[contenteditable='true'][role='textbox']", "textarea[placeholder*='正文']"], "publish": ["button:has-text('发布')", "button:has-text('提交')"], "entry": ["写游记", "发布游记", "创作中心"]},
    "toutiao": {"url": "https://mp.toutiao.com/profile_v4/graphic/publish", "title": ["textarea[placeholder*='标题']", "input[placeholder*='标题']"], "editor": [".ProseMirror", ".ql-editor", "div[contenteditable='true'][role='textbox']"], "publish": ["button:has-text('预览并发布')", "button:has-text('发布')"], "entry": ["文章创作", "发布文章"]},
    "baijiahao": {"url": "https://baijiahao.baidu.com/builder/rc/edit", "title": ["textarea[placeholder*='标题']", "input[placeholder*='标题']"], "editor": [".ProseMirror", ".ql-editor", ".public-DraftEditor-content[contenteditable='true']", "div[contenteditable='true'][role='textbox']"], "publish": ["button:has-text('发布')", "button:has-text('提交')"], "entry": ["发布文章", "图文"]},
}

GENERIC_TITLE_SELECTORS = [
    "textarea[placeholder*='标题']",
    "input[placeholder*='标题']",
    "[contenteditable='true'][data-placeholder*='标题']",
]
GENERIC_EDITOR_SELECTORS = [
    ".ProseMirror",
    ".ql-editor",
    ".public-DraftEditor-content[contenteditable='true']",
    ".DraftEditor-editorContainer [contenteditable='true']",
    "body[contenteditable='true']",
    "div[contenteditable='true'][role='textbox']",
    "textarea[placeholder*='正文']",
    "textarea[placeholder*='内容']",
]
GENERIC_PUBLISH_SELECTORS = [
    "button:has-text('预览并发布')",
    "button:has-text('发布文章')",
    "button:has-text('发布')",
    "button:has-text('提交')",
    "a:has-text('发布')",
]

def _plain_markdown(value: str) -> str:
    value = re.sub(r"!\[[^]]*\]\([^)]*\)", "", value or "")
    value = re.sub(r"\[([^]]+)\]\([^)]*\)", r"\1", value)
    value = re.sub(r"^#{1,6}\s*", "", value, flags=re.M)
    return re.sub(r"[*_>`~-]", "", value).strip()

def _render_xhs_cards(title: str, body: str, output_dir: Path) -> list[str]:
    from PIL import Image, ImageDraw, ImageFont
    output_dir.mkdir(parents=True, exist_ok=True)
    font_path = Path("C:/Windows/Fonts/msyh.ttc")
    font = ImageFont.truetype(str(font_path), 44) if font_path.exists() else ImageFont.load_default()
    title_font = ImageFont.truetype(str(font_path), 64) if font_path.exists() else font
    chunks = [body[i:i + 260] for i in range(0, min(len(body), 1300), 260)] or [body]
    paths = []
    for index, chunk in enumerate(chunks[:5]):
        image = Image.new("RGB", (900, 1200), "#F7F4EC")
        draw = ImageDraw.Draw(image)
        draw.rounded_rectangle((42, 42, 858, 1158), radius=36, fill="#FFFFFF", outline="#D8D2C4", width=3)
        draw.text((90, 92), title[:20], font=title_font, fill="#172033")
        lines = [chunk[i:i + 18] for i in range(0, len(chunk), 18)]
        draw.multiline_text((90, 230), "\n".join(lines[:16]), font=font, fill="#334155", spacing=20)
        path = output_dir / f"card-{index + 1}.png"
        image.save(path, "PNG")
        paths.append(str(path))
    return paths

def _scopes(page):
    return [page, *(frame for frame in page.frames if frame != page.main_frame)]


async def _safe_screenshot(page, path: Path) -> None:
    try:
        if not page.is_closed():
            await page.screenshot(path=str(path), full_page=True, timeout=8000)
    except Exception:
        pass


async def _looks_like_login(page, body: str) -> bool:
    try:
        current_url = page.url.lower()
    except Exception:
        current_url = ""
    if "login" in current_url or "passport" in current_url or "signin" in current_url:
        return True
    markers = (
        "扫码登录", "验证码登录", "短信登录", "密码登录", "手机号登录",
        "发送验证码", "登录/注册", "立即登录", "登录即同意",
    )
    return any(marker in body for marker in markers)


async def _dismiss_overlays(page) -> None:
    selectors = (
        ".ant-modal-close",
        ".el-dialog__headerbtn",
        "[class*='modal'] [class*='close']",
        "[class*='dialog'] [class*='close']",
        "button[aria-label='Close']",
        "button[aria-label='关闭']",
    )
    for scope in _scopes(page):
        for selector in selectors:
            try:
                candidates = scope.locator(selector)
                for index in range(min(await candidates.count(), 5)):
                    candidate = candidates.nth(index)
                    if await candidate.is_visible():
                        await candidate.click(timeout=3000)
                        await asyncio.sleep(0.5)
                        break
            except Exception:
                continue


async def _first_visible(page, selectors: Iterable[str], timeout_ms: int = 12000):
    deadline = asyncio.get_running_loop().time() + max(0.2, timeout_ms / 1000)
    while asyncio.get_running_loop().time() < deadline:
        best = None
        best_area = -1.0
        for scope in _scopes(page):
            for selector in selectors:
                try:
                    matches = scope.locator(selector)
                    for index in range(min(await matches.count(), 12)):
                        locator = matches.nth(index)
                        if not await locator.is_visible():
                            continue
                        box = await locator.bounding_box()
                        area = float((box or {}).get("width", 0)) * float((box or {}).get("height", 0))
                        if area > best_area:
                            best, best_area = locator, area
                except Exception:
                    continue
        if best is not None:
            return best
        await asyncio.sleep(0.4)
    return None


async def _click_creation_entry(page, labels: Iterable[str]) -> bool:
    pattern = re.compile("|".join(re.escape(label) for label in labels if label))
    for scope in _scopes(page):
        for role in ("link", "button"):
            try:
                candidates = scope.get_by_role(role, name=pattern)
                for index in range(min(await candidates.count(), 8)):
                    candidate = candidates.nth(index)
                    if await candidate.is_visible():
                        await candidate.click()
                        await asyncio.sleep(2)
                        return True
            except Exception:
                continue
        for label in labels:
            try:
                candidates = scope.get_by_text(label, exact=True)
                for index in range(min(await candidates.count(), 8)):
                    candidate = candidates.nth(index)
                    if await candidate.is_visible():
                        await candidate.click()
                        await asyncio.sleep(2)
                        return True
            except Exception:
                continue
    return False


async def _fill_text(locator, value: str) -> None:
    try:
        await locator.fill(value)
        return
    except Exception:
        pass
    await locator.click()
    await locator.press("Control+A")
    await locator.press("Backspace")
    await locator.press_sequentially(value, delay=1)


async def _file_input(page, timeout_ms: int = 15000):
    deadline = asyncio.get_running_loop().time() + timeout_ms / 1000
    while asyncio.get_running_loop().time() < deadline:
        for scope in _scopes(page):
            try:
                inputs = scope.locator("input[type='file']")
                if await inputs.count():
                    return inputs.first
            except Exception:
                continue
        await asyncio.sleep(0.5)
    return None

async def _wait_for_user_publish(page, timeout_s: int = 900) -> bool:
    success_words = ("发布成功", "提交成功", "审核中", "已发布")
    for _ in range(timeout_s // 2):
        if page.is_closed():
            return False
        try:
            body = await page.locator("body").inner_text()
            if any(word in body for word in success_words):
                return True
        except Exception:
            pass
        await asyncio.sleep(2)
    return False


async def _click_auto_publish(page, publish_button) -> None:
    label = ""
    try:
        label = (await publish_button.inner_text()).strip()
    except Exception:
        pass
    await publish_button.click()
    if "下一步" not in label and "预览" not in label:
        return
    await asyncio.sleep(2)
    final_button = await _first_visible(page, GENERIC_PUBLISH_SELECTORS, timeout_ms=12000)
    if final_button is None:
        raise RuntimeError("已进入发布确认页，但最终发布按钮仍在加载")
    await final_button.click()


async def publish_geo_article(*, platform: str, user_id: int, adaptation: Dict[str, Any], project_root: str, submit_mode: str = "manual_confirm") -> PublishResult:
    submit_mode = normalize_submit_mode(submit_mode)
    config = ARTICLE_CONFIG.get(platform)
    if not config:
        return PublishResult(False, platform, error=f"不支持的文章平台: {platform}")
    if not async_playwright:
        return PublishResult(False, platform, error="Playwright 未安装，无法启动文章发布浏览器")
    if platform in {"dianping", "ctrip"}:
        for field in ("poiName", "cityOrDestination", "poiReference"):
            if not str(adaptation.get(field) or "").strip():
                return PublishResult(False, platform, error=f"发布缺少 {field}")

    root = Path(project_root)
    prepare_playwright_browsers_path(root)
    profile = user_profile_dir(root, user_id, platform)
    profile.mkdir(parents=True, exist_ok=True)
    debug_dir = root / "data" / "temp" / "publish-debug" / f"user_{user_id}" / platform
    debug_dir.mkdir(parents=True, exist_ok=True)
    try:
        async with async_playwright() as playwright:
            context = await playwright.chromium.launch_persistent_context(
                str(profile),
                headless=False,
                args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
                viewport={"width": 1280, "height": 900},
                locale="zh-CN",
            )
            page = context.pages[0] if context.pages else await context.new_page()
            await page.goto(config["url"], wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(3)
            await _dismiss_overlays(page)
            page_text = await page.locator("body").inner_text()
            if await _looks_like_login(page, page_text):
                await _safe_screenshot(page, debug_dir / "waiting-login.png")
                await context.close()
                return PublishResult(False, platform, error="平台登录已失效，请重新绑定账号", metadata={"state": "login_required"})

            if platform == "ctrip":
                await _click_creation_entry(page, ("创作",))
                await _click_creation_entry(page, config.get("entry", []))
            elif platform == "dianping":
                await _click_creation_entry(page, config.get("entry", []))
            elif platform == "sohu":
                await _dismiss_overlays(page)

            if platform == "xiaohongshu":
                upload = await _file_input(page, timeout_ms=6000)
                if upload is None:
                    await _click_creation_entry(page, config.get("entry", []))
                    upload = await _file_input(page, timeout_ms=12000)
                if upload is None:
                    await _safe_screenshot(page, debug_dir / "upload-not-found.png")
                    await context.close()
                    return PublishResult(False, platform, error="小红书创作页仍在加载图片入口，请重试", metadata={"state": "waiting_user"})
                cards = _render_xhs_cards(str(adaptation.get("title") or ""), _plain_markdown(str(adaptation.get("body") or "")), debug_dir / "cards")
                await upload.set_input_files(cards)
                await asyncio.sleep(5)

            editor_selectors = [*config["editor"], *GENERIC_EDITOR_SELECTORS]
            editor = await _first_visible(page, editor_selectors, timeout_ms=7000)
            if editor is None and await _click_creation_entry(page, config.get("entry", [])):
                editor = await _first_visible(page, editor_selectors, timeout_ms=15000)
            if not editor:
                await _safe_screenshot(page, debug_dir / "editor-not-found.png")
                await context.close()
                platform_message = {
                    "dianping": "大众点评网页端尚未开放当前账号的笔记编辑入口，请检查创作权限后重试",
                    "ctrip": "携程内容中心尚未进入游记编辑页，请检查创作菜单后重试",
                }.get(platform, "平台创作页尚未加载完成，系统已保存诊断信息，请重试")
                return PublishResult(False, platform, error=platform_message, metadata={"state": "waiting_user"})
            title_box = await _first_visible(page, [*config["title"], *GENERIC_TITLE_SELECTORS], timeout_ms=5000)
            if title_box:
                await _fill_text(title_box, str(adaptation.get("title") or ""))
            await _fill_text(editor, _plain_markdown(str(adaptation.get("body") or "")))
            publish_button = await _first_visible(page, [*config["publish"], *GENERIC_PUBLISH_SELECTORS], timeout_ms=15000)
            if not publish_button:
                await _safe_screenshot(page, debug_dir / "publish-not-found.png")
                await context.close()
                return PublishResult(False, platform, error="内容已填写，发布控件仍在加载，请重试", metadata={"state": "waiting_user", "prepared": True})
            if submit_mode == AUTO_SUBMIT:
                await _click_auto_publish(page, publish_button)
            else:
                await page.bring_to_front()
                success = await _wait_for_user_publish(page)
                result_url = page.url if not page.is_closed() else config["url"]
                if success:
                    await _safe_screenshot(page, debug_dir / "success-manual.png")
                    await context.close()
                    return PublishResult(True, platform, url=result_url, metadata={"evidence": "manual_confirmed_success", "submitMode": submit_mode})
                await context.close()
                return PublishResult(False, platform, error="内容已自动填写，请在平台页面检查并点击发布", metadata={"state": "waiting_user", "prepared": True, "submitMode": submit_mode})
            await asyncio.sleep(4)
            result_text = await page.locator("body").inner_text()
            result_url = page.url
            success = any(text in result_text for text in ("发布成功", "提交成功", "审核中", "已发布"))
            await _safe_screenshot(page, debug_dir / ("success.png" if success else "unconfirmed.png"))
            await context.close()
            if success:
                return PublishResult(True, platform, url=result_url, metadata={"evidence": "explicit_success_text"})
            if platform == "sohu" and "实名认证" in result_text:
                return PublishResult(False, platform, error="搜狐号要求先完成实名认证，认证后可重新尝试发布", metadata={"state": "waiting_user"})
            return PublishResult(False, platform, error="平台未返回明确成功结果", metadata={"state": "waiting_user"})
    except Exception as exc:
        technical = str(exc).lower()
        if "closed" in technical or "target page" in technical or "context" in technical:
            return PublishResult(
                False,
                platform,
                error="平台窗口已关闭，请重新尝试发布",
                metadata={"state": "waiting_user"},
            )
        if "timeout" in technical:
            return PublishResult(
                False,
                platform,
                error="平台页面加载较慢，请重新尝试发布",
                metadata={"state": "waiting_user"},
            )
        return PublishResult(
            False,
            platform,
            error="平台页面状态发生变化，系统已保留诊断信息，请重新尝试发布",
            metadata={"state": "waiting_user"},
        )

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
    "zhihu": {"url": "https://www.zhihu.com/creator/manage/creation/article", "title": ["input[placeholder*='标题']", "textarea[placeholder*='标题']"], "editor": ["div[contenteditable='true']", ".DraftEditor-root"], "publish": ["button:has-text('发布')"]},
    "weibo": {"url": "https://weibo.com/compose/", "title": ["input[placeholder*='标题']"], "editor": ["div[contenteditable='true']", "textarea"], "publish": ["button:has-text('发布')", "a:has-text('发布')"]},
    "sohu": {"url": "https://mp.sohu.com/mpfe/v4/contentManagement/news/addarticle", "title": ["input[placeholder*='标题']"], "editor": ["div[contenteditable='true']", ".ql-editor"], "publish": ["button:has-text('发布')"]},
    "xiaohongshu": {"url": "https://creator.xiaohongshu.com/publish/publish?target=image", "title": ["input[placeholder*='标题']"], "editor": ["div[contenteditable='true']", "textarea[placeholder*='正文']"], "publish": ["button:has-text('发布')"]},
    "dianping": {"url": "https://www.dianping.com/", "title": ["input[placeholder*='标题']"], "editor": ["div[contenteditable='true']", "textarea"], "publish": ["button:has-text('发布')", "button:has-text('提交')"]},
    "ctrip": {"url": "https://you.ctrip.com/", "title": ["input[placeholder*='标题']"], "editor": ["div[contenteditable='true']", "textarea"], "publish": ["button:has-text('发布')", "button:has-text('提交')"]},
    "toutiao": {"url": "https://mp.toutiao.com/profile_v4/graphic/publish", "title": ["input[placeholder*='标题']", "textarea[placeholder*='标题']"], "editor": ["div[contenteditable='true']", ".ProseMirror"], "publish": ["button:has-text('发布')", "button:has-text('预览并发布')"]},
    "baijiahao": {"url": "https://baijiahao.baidu.com/builder/rc/edit", "title": ["input[placeholder*='标题']", "textarea[placeholder*='标题']"], "editor": ["div[contenteditable='true']", ".ProseMirror", ".ql-editor"], "publish": ["button:has-text('发布')", "button:has-text('提交')"]},
}

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

async def _first_visible(page, selectors: Iterable[str]):
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            if await locator.is_visible(timeout=1200):
                return locator
        except Exception:
            continue
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
            context = await playwright.chromium.launch_persistent_context(str(profile), headless=False, args=["--no-sandbox", "--disable-blink-features=AutomationControlled"], viewport={"width": 1280, "height": 900}, locale="zh-CN")
            page = context.pages[0] if context.pages else await context.new_page()
            await page.goto(config["url"], wait_until="domcontentloaded", timeout=60000)
            await asyncio.sleep(2)
            page_text = await page.locator("body").inner_text()
            if any(word in page_text for word in ("扫码登录", "验证码登录", "密码登录", "登录/注册")):
                await page.screenshot(path=str(debug_dir / "waiting-login.png"))
                await context.close()
                return PublishResult(False, platform, error="需要重新登录平台账号", metadata={"state": "waiting_user"})

            if platform == "xiaohongshu":
                upload = page.locator("input[type='file']").first
                if not await upload.count():
                    await context.close()
                    return PublishResult(False, platform, error="未找到小红书图片上传入口")
                cards = _render_xhs_cards(str(adaptation.get("title") or ""), _plain_markdown(str(adaptation.get("body") or "")), debug_dir / "cards")
                await upload.set_input_files(cards)
                await asyncio.sleep(3)

            title_box = await _first_visible(page, config["title"])
            editor = await _first_visible(page, config["editor"])
            if not editor:
                await page.screenshot(path=str(debug_dir / "editor-not-found.png"))
                await context.close()
                return PublishResult(False, platform, error="未找到文章编辑器，平台页面可能已更新")
            if title_box:
                await title_box.fill(str(adaptation.get("title") or ""))
            await editor.fill(_plain_markdown(str(adaptation.get("body") or "")))
            publish_button = await _first_visible(page, config["publish"])
            if not publish_button:
                await page.screenshot(path=str(debug_dir / "publish-not-found.png"))
                await context.close()
                return PublishResult(False, platform, error="内容已填写，但未找到发布按钮", metadata={"state": "waiting_user"})
            if submit_mode == AUTO_SUBMIT:
                await publish_button.click()
            else:
                await page.bring_to_front()
                success = await _wait_for_user_publish(page)
                result_url = page.url if not page.is_closed() else config["url"]
                if success:
                    await page.screenshot(path=str(debug_dir / "success-manual.png"))
                    await context.close()
                    return PublishResult(True, platform, url=result_url, metadata={"evidence": "manual_confirmed_success", "submitMode": submit_mode})
                await context.close()
                return PublishResult(False, platform, error="内容已自动填写，请在平台页面检查并点击发布", metadata={"state": "waiting_user", "prepared": True, "submitMode": submit_mode})
            await asyncio.sleep(4)
            result_text = await page.locator("body").inner_text()
            result_url = page.url
            success = any(text in result_text for text in ("发布成功", "提交成功", "审核中", "已发布"))
            await page.screenshot(path=str(debug_dir / ("success.png" if success else "unconfirmed.png")))
            await context.close()
            if success:
                return PublishResult(True, platform, url=result_url, metadata={"evidence": "explicit_success_text"})
            return PublishResult(False, platform, error="平台未返回明确成功结果", metadata={"state": "waiting_user"})
    except Exception as exc:
        return PublishResult(False, platform, error=str(exc))

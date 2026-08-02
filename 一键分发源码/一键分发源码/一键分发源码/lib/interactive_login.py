"""
交互式浏览器登录管理器（与 bony-agent 对齐）
打开可见浏览器窗口，用户手动登录，然后抓取 Cookie
"""
from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from pathlib import Path
from typing import Any, Dict

PROJECT_ROOT = Path(__file__).resolve().parent.parent
PROFILES_DIR = PROJECT_ROOT / "data" / "profiles"
TEMP_ROOT = PROJECT_ROOT / "data" / "temp"
STEALTH_PATH = Path(__file__).parent / "stealth.min.js"

try:
    from playwright.async_api import async_playwright
except ImportError:
    async_playwright = None

from lib.playwright_env import prepare_playwright_browsers_path
from lib.publisher.douyin_login_page import CHROME_UA, ensure_douyin_login_ui
from lib.publisher.profile_paths import user_profile_dir

logger = logging.getLogger("interactive_login")

def normalize_platform(platform: str) -> str:
    p = (platform or "").strip().lower()
    if p == "shipinhao":
        return "video_channel"
    return p


def storage_platform(platform: str) -> str:
    p = (platform or "").strip().lower()
    if p == "video_channel":
        return "shipinhao"
    return p


class InteractiveBrowserLogin:
    def __init__(self) -> None:
        self.playwright = None
        self.active_sessions: Dict[str, dict] = {}
        self.platform_config = {
            "douyin": {
                "login_url": "https://creator.douyin.com/",
                "success_indicators": [
                    "creator.douyin.com/creator-micro",
                    "creator.douyin.com/creator",
                    "creator.douyin.com/content",
                    "douyin.com/user",
                ],
                "login_cookie": "sessionid",
                "alt_login_cookies": ["sessionid_ss", "sid_tt", "uid_tt"],
                "wait_text": "请在浏览器中完成抖音登录（扫码或密码均可）",
            },
            "xiaohongshu": {
                "login_url": "https://creator.xiaohongshu.com/",
                "success_indicators": [
                    "creator.xiaohongshu.com/creator",
                    "xiaohongshu.com/user",
                    "creator.xiaohongshu.com/publish",
                    "creator.xiaohongshu.com/manage",
                    "creator.xiaohongshu.com/new-creator",
                    "creator.xiaohongshu.com/new/home",
                ],
                "login_cookie": "web_session",
                "alt_login_cookies": ["customer-sso-sid", "x-s-s-sid"],
                "wait_text": "请在浏览器中完成小红书登录",
            },
            "video_channel": {
                "login_url": "https://channels.weixin.qq.com/platform",
                "success_indicators": [
                    "channels.weixin.qq.com/platform",
                    "channels.weixin.qq.com/platform/post",
                    "channels.weixin.qq.com/platform/home",
                    "channels.weixin.qq.com/micro/platform",
                ],
                "login_cookie": "sessionid",
                "alt_login_cookies": [
                    "wxuin",
                    "ua_id",
                    "finder_id",
                    "data_ticket",
                    "wxopenid",
                    "pass_ticket",
                ],
                "wait_text": "请在浏览器中完成视频号登录（微信扫码）",
            },
            "kuaishou": {
                "login_url": "https://cp.kuaishou.com/",
                "success_indicators": [
                    "cp.kuaishou.com/profile",
                    "cp.kuaishou.com/article",
                    "cp.kuaishou.com/new",
                    "cp.kuaishou.com/#",
                ],
                "login_cookie": "kuaishou.web.api_st",
                "alt_login_cookies": [
                    "kuaishou.server.web_st",
                    "kuaishou.server.web_ph",
                    "passToken",
                ],
                "wait_text": "请在浏览器中完成快手登录（扫码即可）",
            },
        }

    async def _ensure_playwright(self) -> None:
        if not async_playwright:
            raise ImportError(
                "Playwright 未安装。请运行: pip install playwright && playwright install chromium"
            )
        if not self.playwright:
            TEMP_ROOT.mkdir(parents=True, exist_ok=True)
            prepare_playwright_browsers_path(PROJECT_ROOT)
            self.playwright = await async_playwright().start()

    async def start_interactive_login(self, platform: str, *, user_id: int) -> Dict[str, Any]:
        key = normalize_platform(platform)
        if key not in self.platform_config:
            return {"success": False, "error": f"不支持的平台: {platform}"}
        config = self.platform_config[key]
        try:
            await self._ensure_playwright()
            logger.info("[%s] 启动可见浏览器...", key)
            user_data_dir = user_profile_dir(PROJECT_ROOT, user_id, key)
            user_data_dir.mkdir(parents=True, exist_ok=True)
            logger.info("[%s] Profile (user=%s): %s", key, user_id, user_data_dir)
            context = await self.playwright.chromium.launch_persistent_context(
                str(user_data_dir),
                headless=False,
                args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
                viewport={"width": 1280, "height": 800},
                locale="zh-CN",
                user_agent=CHROME_UA,
            )
            if STEALTH_PATH.exists():
                await context.add_init_script(path=str(STEALTH_PATH))
            page = context.pages[0] if context.pages else await context.new_page()
            logger.info("[%s] 打开登录页: %s", key, config["login_url"])
            debug_dir = str(TEMP_ROOT / "login-debug" / f"user_{user_id}" / key)
            if key == "douyin":
                await ensure_douyin_login_ui(
                    page,
                    context=context,
                    debug_dir=debug_dir,
                    clear_stale_cookies=True,
                )
                # 扫码页仍可能残留过期 sessionid —— 必须清掉，否则会误判「已连接」
                try:
                    from lib.publisher.douyin_login_page import _has_login_ui

                    if await _has_login_ui(page):
                        logger.info("[%s] login UI visible — clearing stale cookies", key)
                        await context.clear_cookies()
                        await page.reload(wait_until="domcontentloaded", timeout=60000)
                        await asyncio.sleep(2)
                        await ensure_douyin_login_ui(
                            page,
                            context=context,
                            debug_dir=debug_dir,
                            clear_stale_cookies=False,
                        )
                except Exception as exc:
                    logger.warning("[%s] clear stale cookies on login UI: %s", key, exc)
            else:
                await page.goto(config["login_url"], wait_until="domcontentloaded", timeout=60000)
                if key == "video_channel":
                    await asyncio.sleep(2)
                    if "channels.weixin.qq.com/platform" not in page.url:
                        try:
                            await page.goto(
                                "https://channels.weixin.qq.com/platform",
                                wait_until="domcontentloaded",
                                timeout=60000,
                            )
                        except Exception:
                            pass
                if key == "kuaishou":
                    await asyncio.sleep(2)
                    if "passport.kuaishou.com" not in page.url:
                        try:
                            await page.goto(
                                "https://passport.kuaishou.com/pc/account/login",
                                wait_until="domcontentloaded",
                                timeout=60000,
                            )
                        except Exception:
                            pass
            session_id = f"{key}_{uuid.uuid4().hex[:10]}"
            self.active_sessions[session_id] = {
                "browser": None,
                "context": context,
                "page": page,
                "platform": storage_platform(platform),
                "user_id": user_id,
                "config": config,
                "start_time": time.time(),
                "status": "waiting",
            }
            logger.info("[%s] 等待用户登录 session=%s", key, session_id)
            return {
                "success": True,
                "session_id": session_id,
                "message": config["wait_text"],
                "status": "waiting",
            }
        except Exception as exc:
            logger.exception("[%s] 启动浏览器失败", key)
            return {"success": False, "error": str(exc)}

    async def check_login_status(self, session_id: str) -> Dict[str, Any]:
        if session_id not in self.active_sessions:
            return {"status": "expired", "error": "会话不存在或已过期"}
        session = self.active_sessions[session_id]
        page = session["page"]
        context = session["context"]
        config = session["config"]
        platform = session["platform"]
        try:
            try:
                if page.is_closed():
                    del self.active_sessions[session_id]
                    return {"status": "cancelled", "message": "浏览器已关闭"}
            except Exception:
                del self.active_sessions[session_id]
                return {"status": "cancelled", "message": "浏览器已关闭"}

            current_url = page.url
            url_matched_initially = any(
                ind and ind in current_url for ind in config.get("success_indicators", [])
            )
            if url_matched_initially:
                await asyncio.sleep(2)
                current_url = page.url

            cookies = await context.cookies()
            cookie_names = [c["name"] for c in cookies]
            login_cookie = config.get("login_cookie")
            alt_cookies = config.get("alt_login_cookies", [])
            has_login_cookie = bool(login_cookie and login_cookie in cookie_names)
            if not has_login_cookie:
                for alt in alt_cookies:
                    if alt in cookie_names:
                        has_login_cookie = True
                        break

            url_matched = any(
                ind and ind in current_url for ind in config.get("success_indicators", [])
            )

            # 页面仍是扫码/登录 UI 时，绝不能凭旧 Cookie 判成功（「图一已连接、图二还要登录」的根因）
            still_login_ui = False
            try:
                body = await page.inner_text("body")
                if platform == "douyin":
                    still_login_ui = any(
                        tip in body for tip in ("扫码登录", "验证码登录", "密码登录", "抖音扫码登录", "登录/注册")
                    )
                elif platform == "xiaohongshu":
                    still_login_ui = any(tip in body for tip in ("扫码登录", "手机号登录", "验证码登录"))
                elif platform == "kuaishou":
                    still_login_ui = any(tip in body for tip in ("扫码登录", "验证码登录", "密码登录"))
                elif platform == "shipinhao":
                    still_login_ui = any(
                        tip in body for tip in ("微信扫码", "扫码登录", "登录过期", "重新登录")
                    )
            except Exception:
                still_login_ui = False

            login_success = False
            if still_login_ui:
                login_success = False
            elif platform == "shipinhao":
                # 视频号：进入后台即可；页面可见「内容管理/发表视频」也算成功
                page_logged_in = False
                try:
                    body = await page.inner_text("body")
                    page_logged_in = any(
                        tip in body
                        for tip in (
                            "内容管理",
                            "发表视频",
                            "视频号ID",
                            "数据中心",
                            "带货中心",
                            "互动管理",
                        )
                    )
                except Exception:
                    page_logged_in = False
                login_success = (url_matched or page_logged_in) and (
                    has_login_cookie or len(cookies) >= 3 or page_logged_in
                )
                if not login_success:
                    logger.info(
                        "shipinhao waiting url=%s cookies=%s names=%s page_ui=%s",
                        current_url,
                        len(cookies),
                        cookie_names[:12],
                        page_logged_in,
                    )
            elif platform == "douyin":
                # 必须进入创作者后台，且不能再显示扫码登录
                page_creator = False
                try:
                    body = await page.inner_text("body")
                    page_creator = any(
                        tip in body
                        for tip in ("上传视频", "发布视频", "作品管理", "内容管理", "高清发布")
                    )
                except Exception:
                    page_creator = False
                login_success = has_login_cookie and (url_matched or page_creator)
                if not login_success:
                    logger.info(
                        "douyin waiting url=%s has_sid=%s url_ok=%s creator_ui=%s",
                        current_url,
                        has_login_cookie,
                        url_matched,
                        page_creator,
                    )
            elif has_login_cookie and url_matched:
                login_success = True
            elif url_matched and platform == "xiaohongshu" and (
                "customer-sso-sid" in cookie_names or len(cookies) > 15
            ):
                login_success = True
            elif url_matched and platform == "kuaishou":
                login_success = has_login_cookie or len(cookies) > 12
            elif url_matched and platform != "xiaohongshu":
                login_success = True

            if login_success:
                cookie_string = "; ".join(f"{c['name']}={c['value']}" for c in cookies)
                cookie_json = __import__("json").dumps(cookies, ensure_ascii=False)
                del self.active_sessions[session_id]

                async def _close() -> None:
                    try:
                        if session.get("browser"):
                            await session["browser"].close()
                        elif session.get("context"):
                            await session["context"].close()
                    except Exception:
                        pass

                asyncio.create_task(_close())
                return {
                    "status": "success",
                    "message": "登录成功！",
                    "cookies": cookie_string,
                    "cookie_json": cookie_json,
                    "platform": platform,
                }

            elapsed = time.time() - session["start_time"]
            if elapsed > 300:
                try:
                    if session.get("browser"):
                        await session["browser"].close()
                    elif session.get("context"):
                        await session["context"].close()
                except Exception:
                    pass
                del self.active_sessions[session_id]
                return {"status": "timeout", "error": "登录超时，请重试"}
            return {
                "status": "waiting",
                "message": config["wait_text"],
                "elapsed": int(elapsed),
            }
        except Exception as exc:
            logger.exception("check_login_status failed")
            return {"status": "error", "error": str(exc)}

    async def cancel_login(self, session_id: str) -> Dict[str, Any]:
        session = self.active_sessions.pop(session_id, None)
        if session:
            try:
                if session.get("browser"):
                    await session["browser"].close()
                elif session.get("context"):
                    await session["context"].close()
            except Exception:
                pass
        return {"success": True, "message": "已取消"}


interactive_login_manager = InteractiveBrowserLogin()

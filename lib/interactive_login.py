"""
交互式浏览器登录管理器（与 bony-agent 对齐）
打开可见浏览器窗口，用户手动登录，然后抓取 Cookie
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import socket
import time
import urllib.request
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

from lib.playwright_env import browser_event_loop_diagnostics, browser_health, browser_launch_candidates, browser_launch_mode, classify_browser_launch_error, prepare_playwright_browsers_path
from lib.publisher.douyin_login_page import CHROME_UA, ensure_douyin_login_ui
from lib.publisher.profile_paths import user_profile_dir

logger = logging.getLogger("interactive_login")

AUTHENTICATED_MARKERS = {
    "douyin": ("上传视频", "发布视频", "作品管理", "内容管理", "数据中心"),
    "xiaohongshu": ("发布笔记", "笔记管理", "数据看板", "创作服务", "创作中心"),
    "kuaishou": ("发布视频", "作品管理", "数据中心", "创作中心"),
    "shipinhao": ("内容管理", "发表视频", "视频号ID", "数据中心", "互动管理"),
}

LOGIN_MARKERS = {
    "douyin": ("扫码登录", "验证码登录", "密码登录", "登录/注册"),
    "xiaohongshu": ("扫码登录", "手机号登录", "验证码登录"),
    "kuaishou": ("扫码登录", "验证码登录", "密码登录"),
    "shipinhao": ("微信扫码", "扫码登录", "登录过期", "重新登录"),
}

IDENTITY_SELECTORS = {
    "douyin": ("[class*='user-name']", "[class*='nickname']", "[class*='account-name']", "[class*='creator-name']"),
    "xiaohongshu": ("[class*='user-name']", "[class*='nickname']", "[class*='account-name']", "[class*='creator-name']"),
    "kuaishou": ("[class*='user-name']", "[class*='nickname']", "[class*='account-name']", "[class*='creator-name']"),
    "shipinhao": ("[class*='user-name']", "[class*='nickname']", "[class*='account-name']", "[class*='finder-name']"),
}


def clean_identity_text(value: str) -> str:
    text = " ".join((value or "").split()).strip(" ：:")
    for prefix in ("账号：", "账号:", "昵称：", "昵称:"):
        if text.startswith(prefix):
            text = text[len(prefix):].strip()
    invalid = ("登录", "注册", "扫码", "创作者中心", "个人中心", "账号管理")
    if not text or len(text) > 64 or any(marker in text for marker in invalid):
        return ""
    return text


def extract_identity_from_payload(payload: Any) -> Dict[str, str]:
    """Extract a real platform identity from a trusted account-info response."""
    nickname_keys = (
        "nickname", "nick_name", "nickName", "user_name",
        "userName", "screen_name", "screenName",
    )
    user_id_keys = (
        "user_id", "userId", "uid", "sec_uid", "secUid",
        "open_id", "openId", "unique_id", "uniqueId",
    )

    def walk(value: Any, depth: int = 0) -> Dict[str, str] | None:
        if depth > 10:
            return None
        if isinstance(value, dict):
            for key in nickname_keys:
                nickname = clean_identity_text(str(value.get(key) or ""))
                if nickname:
                    platform_user_id = ""
                    for id_key in user_id_keys:
                        raw_id = value.get(id_key)
                        if raw_id is not None and str(raw_id).strip():
                            platform_user_id = str(raw_id).strip()
                            break
                    return {
                        "nickname": nickname,
                        "platform_user_id": platform_user_id,
                    }
            for child in value.values():
                found = walk(child, depth + 1)
                if found:
                    return found
        elif isinstance(value, list):
            for child in value[:100]:
                found = walk(child, depth + 1)
                if found:
                    return found
        return None

    return walk(payload) or {"nickname": "", "platform_user_id": ""}


def evaluate_login_proof(
    *,
    has_login_cookie: bool,
    url_matched: bool,
    still_login_ui: bool,
    authenticated_ui: bool,
    nickname: str,
) -> bool:
    return bool(
        has_login_cookie
        and url_matched
        and not still_login_ui
        and authenticated_ui
        and clean_identity_text(nickname)
    )

EXTRA_PLATFORM_CONFIG = {
    "zhihu": {"login_url": "https://www.zhihu.com/signin", "success_indicators": ["zhihu.com/creator", "zhihu.com/people", "zhihu.com/hot"], "login_cookie": "z_c0", "alt_login_cookies": ["d_c0"], "wait_text": "请在浏览器中完成知乎登录"},
    "weibo": {"login_url": "https://weibo.com/", "success_indicators": ["weibo.com/u/", "weibo.com/mygroups", "weibo.com/home"], "login_cookie": "SUB", "alt_login_cookies": ["SUBP", "SSOLoginState"], "wait_text": "请在浏览器中完成微博登录"},
    "dianping": {"login_url": "https://www.dianping.com/", "success_indicators": ["dianping.com/member", "dianping.com/"], "login_cookie": "dper", "alt_login_cookies": ["ua", "ctu"], "wait_text": "请在浏览器中完成大众点评登录"},
    "ctrip": {"login_url": "https://you.ctrip.com/", "success_indicators": ["ctrip.com/you", "you.ctrip.com/members", "you.ctrip.com/"], "login_cookie": "cticket", "alt_login_cookies": ["DUID"], "wait_text": "请在浏览器中完成携程登录"},
    "sohu": {"login_url": "https://mp.sohu.com/", "success_indicators": ["mp.sohu.com/mpfe", "mp.sohu.com/profile"], "login_cookie": "SUV", "alt_login_cookies": ["IPLOC", "gidinf"], "wait_text": "请在浏览器中完成搜狐号登录"},
    "toutiao": {"login_url": "https://mp.toutiao.com/", "success_indicators": ["mp.toutiao.com/profile", "mp.toutiao.com/creation", "mp.toutiao.com/"], "login_cookie": "sessionid", "alt_login_cookies": ["sid_tt", "uid_tt"], "wait_text": "请在浏览器中完成今日头条登录"},
    "baijiahao": {"login_url": "https://baijiahao.baidu.com/", "success_indicators": ["baijiahao.baidu.com/builder", "baijiahao.baidu.com/"], "login_cookie": "BDUSS", "alt_login_cookies": ["STOKEN", "BAIDUID"], "wait_text": "请在浏览器中完成百家号登录"},
}

# GEO article platforms use the same strict account-proof pipeline as video
# platforms. Open a platform-specific login/creator entry rather than a home
# page, then require authenticated creator UI and a real nickname.
EXTRA_PLATFORM_CONFIG["zhihu"].update({
    "login_url": "https://www.zhihu.com/signin?next=%2Fcreator%2Fmanage%2Fcreation%2Farticle",
    "success_indicators": ["zhihu.com/creator", "zhihu.com/people/", "zhihu.com/settings"],
    "alt_login_cookies": ["d_c0", "SESSIONID"],
})
EXTRA_PLATFORM_CONFIG["weibo"].update({
    "login_url": "https://weibo.com/login.php",
    "success_indicators": ["weibo.com/u/", "weibo.com/profile", "weibo.com/compose", "weibo.com/"],
    "alt_login_cookies": ["SUBP", "SSOLoginState"],
})
EXTRA_PLATFORM_CONFIG["dianping"].update({
    "login_url": (
        "https://m.dianping.com/mlogin/smslogin"
        "?needtoken=true&redir=https%3A%2F%2Fwww.dianping.com%2Fmember%2Fmyinfo"
    ),
    "success_indicators": ["dianping.com/member/", "dianping.com/user/", "dianping.com/review"],
    "alt_login_cookies": ["dplet", "ua", "ctu"],
})
EXTRA_PLATFORM_CONFIG["ctrip"].update({
    "login_url": "https://we.ctrip.com/account/login",
    "success_indicators": ["we.ctrip.com/publish/", "we.ctrip.com/account/", "we.ctrip.com/"],
    "alt_login_cookies": [
        "login_uid",
        "DUID",
        "ticket_ctrip",
        "CtripUserInfo",
        "Session",
    ],
})
EXTRA_PLATFORM_CONFIG["sohu"].update({
    "login_url": "https://mp.sohu.com/mpfe/v4/contentManagement/first/page",
    "success_indicators": [
        "mp.sohu.com/mpfe/v4/contentManagement",
        "mp.sohu.com/mpfe/v4/main",
        "mp.sohu.com/profile",
    ],
    "login_cookie": "ppinf",
    "alt_login_cookies": ["pprdig", "passport", "IPLOC", "gidinf"],
})
EXTRA_PLATFORM_CONFIG["toutiao"].update({
    "login_url": "https://mp.toutiao.com/profile_v4/graphic/publish",
    "success_indicators": ["mp.toutiao.com/profile_v4", "mp.toutiao.com/management"],
    "alt_login_cookies": ["sid_tt", "uid_tt"],
})

PLATFORM_VERIFICATION_URLS = {
    "weibo": "https://weibo.com/",
    "ctrip": "https://we.ctrip.com/publish/contentManagement",
    "sohu": "https://mp.sohu.com/mpfe/v4/contentManagement/first/page",
    "toutiao": "https://mp.toutiao.com/profile_v4/graphic/publish",
}
EXTRA_PLATFORM_CONFIG["baijiahao"].update({
    "login_url": "https://baijiahao.baidu.com/builder/rc/edit",
    "success_indicators": ["baijiahao.baidu.com/builder/", "baijiahao.baidu.com/profile"],
    "alt_login_cookies": ["STOKEN", "BAIDUID"],
})

AUTHENTICATED_MARKERS.update({
    "zhihu": ("写文章", "创作中心", "内容管理", "我的主页"),
    "weibo": ("发微博", "创作中心", "个人主页", "账号设置"),
    "dianping": ("写点评", "我的点评", "个人中心", "我的收藏"),
    "ctrip": ("发布游记", "我的主页", "我的携程", "社区主页"),
    "sohu": ("内容管理", "发布文章", "个人中心", "账号名称"),
    "toutiao": ("作品管理", "发布文章", "创作中心", "数据分析"),
    "baijiahao": ("内容管理", "发布图文", "百家号指数", "收益分析"),
})

LOGIN_MARKERS.update({
    "zhihu": ("登录/注册", "扫码登录", "验证码登录", "进入知乎"),
    "weibo": ("微博登录", "扫码登录", "短信登录", "登录微博"),
    "dianping": ("手机号快捷登录", "验证码登录", "第三方账户登录", "登录/注册"),
    "ctrip": ("账号登录", "手机验证码登录", "扫码登录", "登录携程"),
    "sohu": ("账号登录", "手机登录", "注册账号", "找回账号或密码"),
    "toutiao": ("登录头条号", "扫码登录", "验证码登录", "手机号登录"),
    "baijiahao": ("登录百度账号", "扫码登录", "短信登录", "用户名登录"),
})

IDENTITY_SELECTORS.update({
    "zhihu": (
        ".AppHeader-profileEntry",
        "[class*='ProfileHeader-name']",
        "[class*='Creator'] [class*='name']",
        "img.Avatar[alt]",
    ),
    "weibo": (
        "[class*='head_name']",
        "[class*='headName']",
        "[class*='nickname']",
        "[class*='nickName']",
        "[class*='user-name']",
        "[class*='userName']",
        "[class*='ProfileHeader'] [class*='name']",
        "a[href*='/u/'][title]",
        "[class*='woo-avatar'] img[alt]",
        "img[alt][class*='avatar']",
    ),
    "dianping": (
        "[class*='user-name']",
        "[class*='userName']",
        "[class*='nickname']",
        "a[href*='/member/'][title]",
        "img[alt][class*='avatar']",
    ),
    "ctrip": (
        "[class*='user-name']",
        "[class*='userName']",
        "[class*='nickname']",
        "[class*='nickName']",
        "[class*='member-name']",
        "[class*='account-name']",
        "[class*='accountName']",
        "img[alt][class*='avatar']",
    ),
    "sohu": (
        "[class*='account-name']",
        "[class*='accountName']",
        "[class*='user-name']",
        "[class*='userName']",
        "[class*='nickname']",
        "[class*='nickName']",
        "[class*='media-name']",
        "[class*='mediaName']",
        "[class*='header'] img[alt]",
    ),
    "toutiao": (
        "[class*='account-name']",
        "[class*='user-name']",
        "[class*='nickname']",
        "[class*='avatar'] img[alt]",
        "img[alt][class*='avatar']",
    ),
    "baijiahao": (
        "[class*='account-name']",
        "[class*='user-name']",
        "[class*='nickname']",
        "[class*='author-name']",
        "img[alt][class*='avatar']",
    ),
})


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
        self.terminal_sessions: Dict[str, dict] = {}
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

    def get_browser_health(self) -> Dict[str, Any]:
        health = browser_health(PROJECT_ROOT, playwright_available=async_playwright is not None)
        health["active_sessions"] = sum(1 for session in self.active_sessions.values() if session.get("status") == "waiting")
        return health

    def _find_active_session(self, user_id: int, platform: str) -> tuple[str, dict] | None:
        storage_key = storage_platform(platform)
        for session_id, session in self.active_sessions.items():
            if session.get("user_id") == user_id and session.get("platform") == storage_key and session.get("status") in {"waiting", "verifying"}:
                return session_id, session
        return None

    async def _launch_native_cdp(self, executable: str, user_data_dir: Path, login_url: str):
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            port = reservation.getsockname()[1]
        endpoint = f"http://127.0.0.1:{port}"
        process = await asyncio.create_subprocess_exec(
            executable,
            f"--remote-debugging-port={port}",
            "--remote-debugging-address=127.0.0.1",
            f"--user-data-dir={user_data_dir}",
            "--no-first-run",
            "--no-default-browser-check",
            login_url,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )

        def cdp_ready() -> bool:
            try:
                with urllib.request.urlopen(f"{endpoint}/json/version", timeout=1) as response:
                    return response.status == 200
            except Exception:
                return False

        for _ in range(75):
            if process.returncode is not None:
                raise RuntimeError(f"native Chrome exited with code {process.returncode}")
            if await asyncio.to_thread(cdp_ready):
                break
            await asyncio.sleep(0.2)
        else:
            process.terminate()
            await process.wait()
            raise TimeoutError("native Chrome CDP endpoint timed out")

        browser = await self.playwright.chromium.connect_over_cdp(endpoint)
        if not browser.contexts:
            raise RuntimeError("native Chrome context is unavailable")
        context = browser.contexts[0]
        await asyncio.sleep(1.5)
        pages = context.pages
        page = next((item for item in reversed(pages) if item.url and item.url != "about:blank"), pages[-1] if pages else await context.new_page())
        return process, browser, context, page

    async def start_interactive_login(self, platform: str, *, user_id: int) -> Dict[str, Any]:
        key = normalize_platform(platform)
        if key not in self.platform_config and key in EXTRA_PLATFORM_CONFIG:
            self.platform_config[key] = EXTRA_PLATFORM_CONFIG[key]
        if key not in self.platform_config:
            return {"success": False, "code": "unsupported_platform", "error": f"暂不支持该平台登录: {platform}"}
        existing = self._find_active_session(user_id, platform)
        if existing:
            session_id, _ = existing
            return {
                "success": True,
                "session_id": session_id,
                "message": "登录窗口已经打开，请在该窗口完成扫码",
                "status": "waiting",
                "reused": True,
            }
        config = self.platform_config[key]
        context = None
        browser = None
        native_process = None
        native_mode = False
        try:
            loop_health = browser_event_loop_diagnostics()
            logger.info("[%s] event_loop=%s subprocess_supported=%s", key, loop_health["event_loop"], loop_health["subprocess_supported"])
            if not loop_health["subprocess_supported"]:
                return {
                    "success": False,
                    "code": "event_loop_incompatible",
                    "error": "开发服务的事件循环不支持登录浏览器，请重启开发服务后再试",
                }
            await self._ensure_playwright()
            logger.info("[%s] 启动可见浏览器...", key)
            user_data_dir = user_profile_dir(PROJECT_ROOT, user_id, key)
            user_data_dir.mkdir(parents=True, exist_ok=True)
            logger.info("[%s] Profile (user=%s): %s", key, user_id, user_data_dir)
            candidates = browser_launch_candidates(PROJECT_ROOT)
            if not candidates:
                return {"success": False, "code": "browser_missing", "error": "登录浏览器组件缺失，程序将在重启服务后自动修复"}
            launch_errors: list[BaseException] = []
            page = None
            if browser_launch_mode(key) == "native_cdp":
                native_mode = True
                for candidate in sorted(candidates, key=lambda item: item["source"] != "system_chrome"):
                    try:
                        logger.info("[%s] native CDP source=%s", key, candidate["source"])
                        native_process, browser, context, page = await self._launch_native_cdp(
                            candidate["executable"], user_data_dir, config["login_url"]
                        )
                        break
                    except Exception as launch_exc:
                        launch_errors.append(launch_exc)
                        logger.warning("[%s] native CDP source=%s failed: %s", key, candidate["source"], launch_exc)
            else:
                for candidate in candidates:
                    try:
                        logger.info("[%s] browser source=%s", key, candidate["source"])
                        context = await self.playwright.chromium.launch_persistent_context(
                            str(user_data_dir),
                            executable_path=candidate["executable"],
                            headless=False,
                            args=["--no-sandbox", "--disable-blink-features=AutomationControlled"],
                            viewport={"width": 1280, "height": 800},
                            locale="zh-CN",
                            user_agent=CHROME_UA,
                        )
                        break
                    except Exception as launch_exc:
                        launch_errors.append(launch_exc)
                        logger.warning("[%s] browser source=%s failed: %s", key, candidate["source"], launch_exc)
            if context is None:
                raise launch_errors[-1] if launch_errors else RuntimeError("browser was not found")
            try:
                from lib.connector_service import get_account_cookie_json

                stored_cookie_json = get_account_cookie_json(user_id, storage_platform(platform))
                stored_cookies = json.loads(stored_cookie_json) if stored_cookie_json else None
                if isinstance(stored_cookies, list) and stored_cookies:
                    await context.add_cookies(stored_cookies)
            except Exception as exc:
                logger.info("[%s] stored cookie import skipped: %s", key, exc)
            if STEALTH_PATH.exists():
                await context.add_init_script(path=str(STEALTH_PATH))
            page = page or (context.pages[0] if context.pages else await context.new_page())
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
                if not native_mode:
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
                "browser": browser,
                "context": context,
                "page": page,
                "native_process": native_process,
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
            diagnostic_id = uuid.uuid4().hex[:8]
            logger.exception("[%s] 启动浏览器失败 diagnostic=%s", key, diagnostic_id)
            if browser is not None:
                try:
                    await browser.close()
                except Exception:
                    pass
            elif context is not None:
                try:
                    await context.close()
                except Exception:
                    pass
            if native_process is not None and native_process.returncode is None:
                try:
                    native_process.terminate()
                    await native_process.wait()
                except Exception:
                    pass
            failure = classify_browser_launch_error(exc)
            return {"success": False, "code": failure["code"], "error": failure["message"], "diagnostic_id": diagnostic_id}

    async def _close_session(self, session: dict) -> None:
        try:
            if session.get("browser"):
                await session["browser"].close()
            elif session.get("context"):
                await session["context"].close()
        except Exception:
            pass
        process = session.get("native_process")
        if process is not None and process.returncode is None:
            try:
                process.terminate()
                await process.wait()
            except Exception:
                pass

    def _terminalize(self, session_id: str, result: Dict[str, Any]) -> Dict[str, Any]:
        session = self.active_sessions.pop(session_id, None)
        self.terminal_sessions[session_id] = {
            "user_id": session.get("user_id") if session else None,
            "result": dict(result),
            "created_at": time.time(),
        }
        cutoff = time.time() - 600
        for key, terminal in list(self.terminal_sessions.items()):
            if terminal["created_at"] < cutoff:
                self.terminal_sessions.pop(key, None)
        if session:
            asyncio.create_task(self._close_session(session))
        return result

    async def _extract_identity(self, page: Any, platform: str) -> Dict[str, str]:
        for selector in IDENTITY_SELECTORS.get(platform, ()):
            try:
                locator = page.locator(selector)
                for index in range(min(await locator.count(), 6)):
                    item = locator.nth(index)
                    if not await item.is_visible():
                        continue
                    nickname = ""
                    try:
                        nickname = clean_identity_text(await item.inner_text(timeout=1000))
                    except Exception:
                        pass
                    if not nickname:
                        for attribute in (
                            "aria-label",
                            "alt",
                            "title",
                            "data-name",
                            "data-nickname",
                        ):
                            nickname = clean_identity_text(
                                await item.get_attribute(attribute) or ""
                            )
                            if nickname:
                                break
                    if not nickname:
                        continue
                    platform_user_id = ""
                    for attribute in (
                        "data-user-id",
                        "data-userid",
                        "data-uid",
                        "data-finder-id",
                    ):
                        platform_user_id = (await item.get_attribute(attribute) or "").strip()
                        if platform_user_id:
                            break
                    return {"nickname": nickname, "platform_user_id": platform_user_id[:128]}
            except Exception:
                continue
        return {"nickname": "", "platform_user_id": ""}

    async def _extract_header_identity(self, page: Any, platform: str) -> Dict[str, str]:
        if platform not in {"ctrip", "toutiao"}:
            return {"nickname": "", "platform_user_id": ""}
        try:
            result = await page.evaluate(
                """
                (platform) => {
                  const rejected = new Set([
                    "首页", "创作", "发布", "内容管理", "游记管理", "消息",
                    "我的账号", "我的账户", "账号管理", "个人中心", "退出",
                    "作品管理", "数据统计", "收益", "激励计划", "创作灵感",
                    "创意学堂", "直播", "通知", "登录", "注册"
                  ]);
                  const clean = (value) => {
                    const text = String(value || "")
                      .replace(/\\s+/g, " ")
                      .replace(/^账号[：:]?\\s*/, "")
                      .replace(/^昵称[：:]?\\s*/, "")
                      .trim();
                    if (
                      !text ||
                      text.length < 2 ||
                      text.length > 64 ||
                      rejected.has(text) ||
                      /^\\d+$/.test(text)
                    ) return "";
                    return text;
                  };
                  const selectors = [
                    "header [class*='user']",
                    "header [class*='account']",
                    "header [class*='name']",
                    "[class*='header'] [class*='user']",
                    "[class*='header'] [class*='account']",
                    "[class*='header'] [class*='name']",
                    "[class*='top'] [class*='user']",
                    "[class*='top'] [class*='account']",
                    "[class*='avatar'] + *",
                    "[class*='avatar'] ~ [class*='name']",
                    "img[class*='avatar'][alt]"
                  ];
                  const candidates = [];
                  const seen = new Set();
                  for (const selector of selectors) {
                    for (const element of document.querySelectorAll(selector)) {
                      const rect = element.getBoundingClientRect();
                      const style = getComputedStyle(element);
                      if (
                        rect.width <= 0 ||
                        rect.height <= 0 ||
                        rect.bottom < 0 ||
                        rect.top > 220 ||
                        style.visibility === "hidden" ||
                        style.display === "none"
                      ) continue;
                      const values = [
                        element.textContent,
                        element.getAttribute("title"),
                        element.getAttribute("aria-label"),
                        element.getAttribute("alt")
                      ];
                      for (const raw of values) {
                        const nickname = clean(raw);
                        if (!nickname || seen.has(nickname)) continue;
                        seen.add(nickname);
                        let score = rect.left > window.innerWidth * 0.55 ? 4 : 0;
                        if (/user|account|name|avatar|profile/i.test(element.className || "")) score += 3;
                        if (element.querySelector("img") || element.previousElementSibling?.querySelector?.("img")) score += 2;
                        if (platform === "ctrip" && /[_A-Za-z0-9]/.test(nickname)) score += 1;
                        candidates.push({ nickname, score });
                      }
                    }
                  }
                  candidates.sort((left, right) => right.score - left.score);
                  return candidates[0] || { nickname: "", score: 0 };
                }
                """,
                platform,
            )
            nickname = clean_identity_text(str((result or {}).get("nickname") or ""))
            return {"nickname": nickname, "platform_user_id": ""}
        except Exception:
            logger.exception("%s header identity extraction failed", platform)
            return {"nickname": "", "platform_user_id": ""}

    async def _extract_douyin_identity_from_api(self, page: Any) -> Dict[str, str]:
        endpoints = (
            "https://creator.douyin.com/web/api/media/user/info/",
            "https://creator.douyin.com/aweme/v1/creator/user/info/",
        )
        for endpoint in endpoints:
            try:
                response = await asyncio.wait_for(
                    page.context.request.get(endpoint, timeout=10000),
                    timeout=12,
                )
                if not response.ok:
                    continue
                identity = extract_identity_from_payload(await response.json())
                if identity["nickname"]:
                    return identity
            except Exception as exc:
                logger.info("douyin identity endpoint unavailable endpoint=%s error=%s", endpoint, exc)
        return {"nickname": "", "platform_user_id": ""}

    async def _extract_identity_from_state(self, page: Any) -> Dict[str, str]:
        """Read account identity from authenticated-page hydrated browser state."""
        try:
            result = await page.evaluate(
                """
                () => {
                  const invalid = /^(登录|注册|扫码|创作者中心|个人中心|账号管理|抖音)$/;
                  const clean = (value) => {
                    const text = String(value || "").replace(/\\s+/g, " ").trim();
                    return text && text.length <= 64 && !invalid.test(text) ? text : "";
                  };
                  const selectors = [
                    "[data-e2e='user-name']",
                    "[data-e2e*='nickname']",
                    "[class*='userName']",
                    "[class*='user_name']",
                    "[class*='nickName']",
                    "[class*='nick_name']",
                    "[class*='accountName']",
                    "[class*='creatorName']",
                    "[class*='userinfo'] [class*='name']",
                    "[class*='userInfo'] [class*='name']"
                  ];
                  for (const selector of selectors) {
                    for (const element of document.querySelectorAll(selector)) {
                      const nickname = clean(element.textContent || element.getAttribute("title"));
                      if (nickname) {
                        return {
                          nickname,
                          platform_user_id:
                            element.getAttribute("data-user-id") ||
                            element.getAttribute("data-uid") ||
                            element.closest("[data-user-id]")?.getAttribute("data-user-id") ||
                            ""
                        };
                      }
                    }
                  }

                  const nicknameKeys = new Set([
                    "nickname", "nickName", "nick_name", "userName",
                    "user_name", "screenName", "screen_name", "nick",
                    "displayName", "display_name", "accountName", "account_name"
                  ]);
                  const idKeys = [
                    "uid", "userId", "user_id", "secUid", "sec_uid",
                    "openId", "open_id", "uniqueId", "unique_id"
                  ];
                  const seen = new WeakSet();
                  const inspect = (value, depth = 0) => {
                    if (!value || typeof value !== "object" || depth > 8 || seen.has(value)) return null;
                    seen.add(value);
                    for (const [key, child] of Object.entries(value)) {
                      if (nicknameKeys.has(key) && typeof child === "string") {
                        const nickname = clean(child);
                        if (nickname) {
                          let platform_user_id = "";
                          for (const idKey of idKeys) {
                            if (value[idKey] !== undefined && value[idKey] !== null) {
                              platform_user_id = String(value[idKey]);
                              break;
                            }
                          }
                          return { nickname, platform_user_id };
                        }
                      }
                    }
                    for (const child of Object.values(value)) {
                      const found = inspect(child, depth + 1);
                      if (found) return found;
                    }
                    return null;
                  };

                  const candidates = [];
                  for (const key of [
                    "__INITIAL_STATE__", "__NEXT_DATA__", "_SSR_DATA", "RENDER_DATA",
                    "__PRELOADED_STATE__", "__NUXT__", "__STORE__", "$CONFIG"
                  ]) {
                    if (window[key]) candidates.push(window[key]);
                  }
                  for (const storage of [window.localStorage, window.sessionStorage]) {
                    for (let index = 0; index < storage.length; index += 1) {
                      const key = storage.key(index);
                      const raw = key ? storage.getItem(key) : "";
                      if (!raw || raw.length > 2000000) continue;
                      try { candidates.push(JSON.parse(raw)); } catch {}
                    }
                  }
                  for (const script of document.querySelectorAll("script[type='application/json'], script#__NEXT_DATA__")) {
                    const raw = script.textContent || "";
                    if (!raw || raw.length > 5000000) continue;
                    try { candidates.push(JSON.parse(raw)); } catch {}
                  }
                  for (const candidate of candidates) {
                    const found = inspect(candidate);
                    if (found) return found;
                  }
                  return { nickname: "", platform_user_id: "" };
                }
                """
            )
            nickname = clean_identity_text(str((result or {}).get("nickname") or ""))
            return {
                "nickname": nickname,
                "platform_user_id": str((result or {}).get("platform_user_id") or "").strip(),
            }
        except Exception:
            logger.exception("hydrated identity extraction failed")
            return {"nickname": "", "platform_user_id": ""}

    async def _recover_douyin_creator_page(self, session: Dict[str, Any], page: Any):
        if session.get("douyin_identity_recovery_started"):
            return page
        session["douyin_identity_recovery_started"] = True
        try:
            context = session["context"]
            creator_page = await context.new_page()
            await creator_page.goto(
                "https://creator.douyin.com/creator-micro/content/manage",
                wait_until="domcontentloaded",
                timeout=45000,
            )
            await creator_page.wait_for_timeout(2500)
            session["page"] = creator_page
            return creator_page
        except Exception:
            logger.exception("douyin creator identity page recovery failed")
            session["douyin_identity_recovery_started"] = False
            return page

    async def _recover_platform_identity_page(
        self,
        session: Dict[str, Any],
        page: Any,
        platform: str,
    ):
        verification_url = PLATFORM_VERIFICATION_URLS.get(platform)
        if not verification_url or session.get("platform_identity_recovery_started"):
            return page
        session["platform_identity_recovery_started"] = True
        try:
            creator_page = await session["context"].new_page()
            await creator_page.goto(
                verification_url,
                wait_until="domcontentloaded",
                timeout=60000,
            )
            await creator_page.wait_for_timeout(3000)
            session["page"] = creator_page
            return creator_page
        except Exception:
            logger.exception("%s identity page recovery failed", platform)
            session["platform_identity_recovery_started"] = False
            return page

    async def _resolve_live_page(self, session: Dict[str, Any]):
        context = session.get("context")
        current = session.get("page")
        try:
            live_pages = [candidate for candidate in context.pages if not candidate.is_closed()]
        except Exception:
            live_pages = []
        if not live_pages and current is not None and not current.is_closed():
            live_pages = [current]
        if not live_pages:
            await asyncio.sleep(1)
            try:
                live_pages = [candidate for candidate in context.pages if not candidate.is_closed()]
            except Exception:
                return None
        if not live_pages:
            return None
        config = session.get("config") or {}
        indicators = tuple(config.get("success_indicators") or ())
        preferred = next(
            (candidate for candidate in reversed(live_pages) if any(marker in candidate.url for marker in indicators)),
            live_pages[-1],
        )
        session["page"] = preferred
        return preferred

    async def check_login_status(self, session_id: str, *, user_id: int | None = None) -> Dict[str, Any]:
        terminal = self.terminal_sessions.get(session_id)
        if terminal:
            if user_id is not None and terminal.get("user_id") != user_id:
                return {"status": "error", "code": "session_not_owned", "error": "登录会话不属于当前用户"}
            return dict(terminal["result"])
        if session_id not in self.active_sessions:
            return {"status": "expired", "error": "会话不存在或已过期"}
        session = self.active_sessions[session_id]
        if user_id is not None and session.get("user_id") != user_id:
            return {"status": "error", "code": "session_not_owned", "error": "登录会话不属于当前用户"}
        page = session["page"]
        context = session["context"]
        config = session["config"]
        platform = session["platform"]
        try:
            try:
                page = await self._resolve_live_page(session)
                if page is None:
                    return self._terminalize(session_id, {
                        "status": "cancelled",
                        "code": "browser_closed_before_verification",
                        "message": "登录窗口已关闭，账号尚未完成验证",
                    })
            except Exception:
                return self._terminalize(session_id, {
                    "status": "cancelled",
                    "code": "browser_closed_before_verification",
                    "message": "登录窗口已关闭，账号尚未完成验证",
                })

            current_url = page.url
            if any(ind and ind in current_url for ind in config.get("success_indicators", [])):
                await asyncio.sleep(2)
                current_url = page.url

            cookies = await asyncio.wait_for(context.cookies(), timeout=8)
            cookie_names = {c["name"] for c in cookies}
            auth_cookie_names = {
                config.get("login_cookie"),
                *config.get("alt_login_cookies", []),
            }
            has_login_cookie = any(name and name in cookie_names for name in auth_cookie_names)
            url_matched = any(
                indicator and indicator in current_url
                for indicator in config.get("success_indicators", [])
            )
            try:
                body = await asyncio.wait_for(page.inner_text("body"), timeout=8)
            except Exception:
                body = ""
            still_login_ui = any(marker in body for marker in LOGIN_MARKERS.get(platform, ()))
            authenticated_ui = any(marker in body for marker in AUTHENTICATED_MARKERS.get(platform, ()))
            identity = {"nickname": "", "platform_user_id": ""}
            if has_login_cookie and not still_login_ui:
                identity = await self._extract_identity(page, platform)
                if not identity["nickname"]:
                    identity = await self._extract_header_identity(page, platform)
                if platform in {"ctrip", "toutiao"} and identity["nickname"]:
                    authenticated_ui = True
                if platform == "douyin" and not identity["nickname"]:
                    identity = await self._extract_douyin_identity_from_api(page)
                if platform == "douyin" and not identity["nickname"]:
                    identity = await self._extract_identity_from_state(page)
                if platform == "douyin" and not identity["nickname"] and not authenticated_ui:
                    page = await self._recover_douyin_creator_page(session, page)
                    try:
                        body = await asyncio.wait_for(page.inner_text("body"), timeout=8)
                    except Exception:
                        body = ""
                    still_login_ui = any(marker in body for marker in LOGIN_MARKERS.get(platform, ()))
                    authenticated_ui = any(marker in body for marker in AUTHENTICATED_MARKERS.get(platform, ()))
                    url_matched = any(marker in page.url for marker in config["success_indicators"])
                    if not still_login_ui:
                        identity = await self._extract_identity(page, platform)
                        if not identity["nickname"]:
                            identity = await self._extract_header_identity(page, platform)
                        if platform in {"ctrip", "toutiao"} and identity["nickname"]:
                            authenticated_ui = True
                        if not identity["nickname"]:
                            identity = await self._extract_douyin_identity_from_api(page)
                        if not identity["nickname"]:
                            identity = await self._extract_identity_from_state(page)
                if platform != "douyin" and not identity["nickname"]:
                    page = await self._recover_platform_identity_page(session, page, platform)
                    current_url = page.url
                    try:
                        body = await asyncio.wait_for(page.inner_text("body"), timeout=8)
                    except Exception:
                        body = ""
                    still_login_ui = any(marker in body for marker in LOGIN_MARKERS.get(platform, ()))
                    authenticated_ui = any(marker in body for marker in AUTHENTICATED_MARKERS.get(platform, ()))
                    url_matched = any(
                        marker in current_url
                        for marker in config.get("success_indicators", [])
                    )
                    if not still_login_ui:
                        identity = await self._extract_identity(page, platform)
                        if not identity["nickname"]:
                            identity = await self._extract_header_identity(page, platform)
                        if not identity["nickname"] and authenticated_ui:
                            identity = await self._extract_identity_from_state(page)
                        if platform in {"ctrip", "toutiao"} and identity["nickname"]:
                            authenticated_ui = True
            login_success = evaluate_login_proof(
                has_login_cookie=has_login_cookie,
                url_matched=url_matched,
                still_login_ui=still_login_ui,
                authenticated_ui=authenticated_ui,
                nickname=identity["nickname"],
            )

            if login_success:
                result = {
                    "status": "success",
                    "message": "账号身份验证成功",
                    "cookies": "; ".join(f"{c['name']}={c['value']}" for c in cookies),
                    "cookie_json": json.dumps(cookies, ensure_ascii=False),
                    "platform": platform,
                    "account_info": identity,
                }
                return self._terminalize(session_id, result)

            elapsed = time.time() - session["start_time"]
            if (has_login_cookie or authenticated_ui) and not still_login_ui:
                verifying_since = session.setdefault("verification_started_at", time.time())
                if time.time() - verifying_since > 90:
                    return self._terminalize(session_id, {
                        "status": "error",
                        "code": "identity_not_verified",
                        "error": "已检测到登录，但无法确认真实账号昵称，请重新打开登录窗口",
                    })
            if elapsed > 300:
                return self._terminalize(session_id, {
                    "status": "timeout",
                    "code": "login_timeout",
                    "error": "登录超时，请重新验证",
                })
            if (has_login_cookie or authenticated_ui) and not still_login_ui:
                session["status"] = "verifying"
                return {
                    "status": "verifying",
                    "message": "已检测到登录，正在确认账号昵称",
                    "elapsed": int(elapsed),
                }
            return {
                "status": "waiting",
                "message": config["wait_text"],
                "elapsed": int(elapsed),
            }
        except Exception as exc:
            diagnostic_id = uuid.uuid4().hex[:8]
            logger.exception("check_login_status failed diagnostic=%s", diagnostic_id)
            if "closed" in str(exc).lower():
                return self._terminalize(session_id, {
                    "status": "cancelled",
                    "code": "browser_closed_before_verification",
                    "message": "登录窗口已关闭，账号尚未完成验证",
                    "diagnostic_id": diagnostic_id,
                })
            return self._terminalize(session_id, {
                "status": "error",
                "code": "login_status_failed",
                "error": "账号验证失败，请重新打开登录窗口",
                "diagnostic_id": diagnostic_id,
            })

    async def cancel_login(self, session_id: str, *, user_id: int | None = None) -> Dict[str, Any]:
        session = self.active_sessions.pop(session_id, None)
        if session and user_id is not None and session.get("user_id") != user_id:
            self.active_sessions[session_id] = session
            return {"success": False, "code": "session_not_owned", "message": "登录会话不属于当前用户"}
        if session:
            await self._close_session(session)
        return {"success": True, "message": "已取消"}


interactive_login_manager = InteractiveBrowserLogin()

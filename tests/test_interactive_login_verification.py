import unittest

from lib.interactive_login import (
    AUTHENTICATED_MARKERS,
    EXTRA_PLATFORM_CONFIG,
    IDENTITY_SELECTORS,
    LOGIN_MARKERS,
    InteractiveBrowserLogin,
    evaluate_login_proof,
    extract_identity_from_payload,
)


GEO_PLATFORMS = (
    "zhihu",
    "weibo",
    "dianping",
    "ctrip",
    "sohu",
    "toutiao",
    "baijiahao",
)


class LoginProofTests(unittest.TestCase):
    def test_extracts_douyin_media_user_identity(self) -> None:
        identity = extract_identity_from_payload({
            "data": {
                "user": {
                    "nickname": "真实创作者",
                    "user_id": "1201135501716220",
                },
            },
        })
        self.assertEqual(identity["nickname"], "真实创作者")
        self.assertEqual(identity["platform_user_id"], "1201135501716220")

    def test_rejects_generic_account_label(self) -> None:
        identity = extract_identity_from_payload({"data": {"nickname": "账号管理"}})
        self.assertEqual(identity["nickname"], "")

    def test_login_page_with_stale_cookie_is_not_success(self) -> None:
        self.assertFalse(evaluate_login_proof(
            has_login_cookie=True,
            url_matched=True,
            still_login_ui=True,
            authenticated_ui=False,
            nickname="",
        ))

    def test_many_cookies_without_identity_are_not_success(self) -> None:
        self.assertFalse(evaluate_login_proof(
            has_login_cookie=True,
            url_matched=True,
            still_login_ui=False,
            authenticated_ui=True,
            nickname="",
        ))

    def test_verified_identity_is_success(self) -> None:
        self.assertTrue(evaluate_login_proof(
            has_login_cookie=True,
            url_matched=True,
            still_login_ui=False,
            authenticated_ui=True,
            nickname="真实创作者",
        ))


class ClosedBrowserTests(unittest.IsolatedAsyncioTestCase):
    async def test_closed_browser_is_terminal_and_never_reads_cookies(self) -> None:
        class ClosedPage:
            def is_closed(self):
                return True

        class Context:
            async def cookies(self):
                raise AssertionError("cookies must not be read after close")

            async def close(self):
                return None

        manager = InteractiveBrowserLogin()
        manager.active_sessions["session"] = {
            "page": ClosedPage(),
            "context": Context(),
            "browser": None,
            "native_process": None,
            "platform": "douyin",
            "user_id": 4,
            "config": {},
            "start_time": 0,
            "status": "waiting",
        }
        first = await manager.check_login_status("session", user_id=4)
        second = await manager.check_login_status("session", user_id=4)
        self.assertEqual(first["code"], "browser_closed_before_verification")
        self.assertEqual(second, first)

    async def test_login_session_is_user_isolated(self) -> None:
        manager = InteractiveBrowserLogin()
        manager.terminal_sessions["session"] = {
            "user_id": 4,
            "result": {"status": "success"},
            "created_at": 1,
        }
        result = await manager.check_login_status("session", user_id=5)
        self.assertEqual(result["code"], "session_not_owned")


class GeoPlatformLoginTests(unittest.IsolatedAsyncioTestCase):
    def test_all_geo_platforms_have_strict_verification_rules(self) -> None:
        for platform in GEO_PLATFORMS:
            with self.subTest(platform=platform):
                self.assertTrue(AUTHENTICATED_MARKERS[platform])
                self.assertTrue(LOGIN_MARKERS[platform])
                self.assertTrue(IDENTITY_SELECTORS[platform])
                config = EXTRA_PLATFORM_CONFIG[platform]
                self.assertTrue(config["login_url"].startswith("https://"))
                self.assertTrue(config["success_indicators"])
                self.assertTrue(config["login_cookie"])

    def test_geo_platforms_open_platform_specific_login_entry(self) -> None:
        expected_entries = {
            "zhihu": "zhihu.com/signin",
            "weibo": "weibo.com/login.php",
            "dianping": "dianping.com/mlogin",
            "ctrip": "we.ctrip.com/account/login",
            "sohu": "mp.sohu.com/mpfe/",
            "toutiao": "mp.toutiao.com/profile_v4/graphic/publish",
            "baijiahao": "baijiahao.baidu.com/builder/",
        }
        for platform, expected in expected_entries.items():
            with self.subTest(platform=platform):
                self.assertIn(expected, EXTRA_PLATFORM_CONFIG[platform]["login_url"])

    def test_toutiao_csrf_cookie_is_not_treated_as_login_proof(self) -> None:
        config = EXTRA_PLATFORM_CONFIG["toutiao"]
        self.assertNotEqual(config["login_cookie"], "passport_csrf_token")
        self.assertNotIn("passport_csrf_token", config["alt_login_cookies"])

    def test_identity_selectors_do_not_capture_whole_header_containers(self) -> None:
        broad_selectors = {
            "header [class*='user']",
            "header [class*='account']",
            "[class*='header'] [class*='user']",
            "[class*='header'] [class*='account']",
        }
        for platform in ("ctrip", "toutiao"):
            with self.subTest(platform=platform):
                self.assertTrue(
                    broad_selectors.isdisjoint(IDENTITY_SELECTORS[platform])
                )

    async def test_identity_can_be_read_from_trusted_image_alt(self) -> None:
        class Item:
            async def is_visible(self):
                return True

            async def inner_text(self, timeout=1000):
                return ""

            async def get_attribute(self, name):
                if name == "alt":
                    return "real-zhihu-creator"
                if name == "data-user-id":
                    return "zhihu-user-1"
                return None

        class Locator:
            async def count(self):
                return 1

            def nth(self, index):
                return Item()

        class Page:
            def locator(self, selector):
                return Locator()

        manager = InteractiveBrowserLogin()
        identity = await manager._extract_identity(Page(), "zhihu")
        self.assertEqual(identity["nickname"], "real-zhihu-creator")
        self.assertEqual(identity["platform_user_id"], "zhihu-user-1")

    async def test_ctrip_identity_can_be_read_from_authenticated_header(self) -> None:
        class Page:
            async def evaluate(self, script, platform):
                self.platform = platform
                return {"nickname": "YoYo_2D3T9A", "score": 8}

        page = Page()
        manager = InteractiveBrowserLogin()
        identity = await manager._extract_header_identity(page, "ctrip")
        self.assertEqual(page.platform, "ctrip")
        self.assertEqual(identity["nickname"], "YoYo_2D3T9A")

    async def test_header_identity_extractor_is_limited_to_supported_platforms(self) -> None:
        class Page:
            async def evaluate(self, script, platform):
                raise AssertionError("unsupported platform must not inspect header")

        manager = InteractiveBrowserLogin()
        identity = await manager._extract_header_identity(Page(), "zhihu")
        self.assertEqual(identity["nickname"], "")


if __name__ == "__main__":
    unittest.main()

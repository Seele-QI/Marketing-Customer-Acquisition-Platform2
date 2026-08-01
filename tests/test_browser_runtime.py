import os
import tempfile
import unittest
from pathlib import Path

from lib.playwright_env import browser_event_loop_diagnostics, browser_launch_mode, classify_browser_launch_error, resolve_browser_runtime


class BrowserRuntimeTests(unittest.TestCase):
    def test_bundled_chromium_is_preferred(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            chrome = root / "resources" / "python" / ".browsers" / "chromium-1228" / "chrome-win64" / "chrome.exe"
            chrome.parent.mkdir(parents=True)
            chrome.write_bytes(b"test")
            original = os.environ.pop("PLAYWRIGHT_BROWSERS_PATH", None)
            try:
                runtime = resolve_browser_runtime(root, system_candidates=[])
            finally:
                if original is not None:
                    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = original

            self.assertEqual(runtime["source"], "bundled")
            self.assertEqual(Path(runtime["executable"]), chrome)
            self.assertEqual(Path(runtime["browsers_path"]), chrome.parents[2])

    def test_system_chrome_is_used_when_bundled_browser_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            chrome = root / "Google" / "Chrome" / "Application" / "chrome.exe"
            chrome.parent.mkdir(parents=True)
            chrome.write_bytes(b"test")
            original = os.environ.pop("PLAYWRIGHT_BROWSERS_PATH", None)
            try:
                runtime = resolve_browser_runtime(root, system_candidates=[chrome])
            finally:
                if original is not None:
                    os.environ["PLAYWRIGHT_BROWSERS_PATH"] = original

            self.assertEqual(runtime["source"], "system_chrome")
            self.assertEqual(Path(runtime["executable"]), chrome)

    def test_launch_errors_have_actionable_codes(self) -> None:
        profile = classify_browser_launch_error(RuntimeError("ProcessSingleton: profile is already in use"))
        missing = classify_browser_launch_error(RuntimeError("Executable doesn't exist at chrome.exe"))

        self.assertEqual(profile["code"], "profile_in_use")
        self.assertIn("登录窗口", profile["message"])
        self.assertEqual(missing["code"], "browser_missing")

    def test_platforms_that_block_playwright_navigation_use_native_cdp(self) -> None:
        self.assertEqual(browser_launch_mode("xiaohongshu"), "native_cdp")
        self.assertEqual(browser_launch_mode("kuaishou"), "native_cdp")
        self.assertEqual(browser_launch_mode("douyin"), "playwright")
        self.assertEqual(browser_launch_mode("shipinhao"), "playwright")

    def test_windows_selector_loop_is_reported_as_incompatible(self) -> None:
        SelectorLoop = type("_WindowsSelectorEventLoop", (), {})
        ProactorLoop = type("ProactorEventLoop", (), {})
        self.assertFalse(browser_event_loop_diagnostics(loop=SelectorLoop(), platform="win32")["subprocess_supported"])
        self.assertTrue(browser_event_loop_diagnostics(loop=ProactorLoop(), platform="win32")["subprocess_supported"])

    def test_not_implemented_subprocess_error_has_specific_code(self) -> None:
        failure = classify_browser_launch_error(NotImplementedError())
        self.assertEqual(failure["code"], "event_loop_incompatible")
        self.assertIn("开发服务", failure["message"])


if __name__ == "__main__":
    unittest.main()

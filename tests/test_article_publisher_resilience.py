import unittest

from lib.publisher.article import (
    ARTICLE_CONFIG,
    GENERIC_EDITOR_SELECTORS,
    _fill_text,
    _first_visible,
    _looks_like_login,
)


class _Element:
    def __init__(self, name, *, visible=True, width=0, height=0, fill_error=False):
        self.name = name
        self.visible = visible
        self.width = width
        self.height = height
        self.fill_error = fill_error
        self.events = []

    async def is_visible(self):
        return self.visible

    async def bounding_box(self):
        return {"width": self.width, "height": self.height}

    async def fill(self, value):
        if self.fill_error:
            raise RuntimeError("contenteditable does not implement fill")
        self.events.append(("fill", value))

    async def click(self):
        self.events.append(("click", None))

    async def press(self, key):
        self.events.append(("press", key))

    async def press_sequentially(self, value, delay=0):
        self.events.append(("type", value, delay))


class _Collection:
    def __init__(self, values):
        self.values = values

    async def count(self):
        return len(self.values)

    def nth(self, index):
        return self.values[index]


class _Scope:
    def __init__(self, selectors=None):
        self.selectors = selectors or {}

    def locator(self, selector):
        return _Collection(self.selectors.get(selector, []))


class _Page(_Scope):
    def __init__(self, selectors=None, frames=None):
        super().__init__(selectors)
        self.main_frame = object()
        self.frames = [self.main_frame, *(frames or [])]
        self.url = "https://creator.example.com/"


class ArticlePublisherResilienceTests(unittest.IsolatedAsyncioTestCase):
    async def test_finds_largest_editor_inside_iframe(self):
        search_box = _Element("search", width=300, height=32)
        editor = _Element("editor", width=900, height=600)
        page = _Page(
            {"div[contenteditable='true'][role='textbox']": [search_box]},
            frames=[_Scope({".ProseMirror": [editor]})],
        )

        found = await _first_visible(
            page,
            ["div[contenteditable='true'][role='textbox']", ".ProseMirror"],
            timeout_ms=250,
        )

        self.assertIs(found, editor)

    async def test_contenteditable_fill_uses_keyboard_fallback(self):
        editor = _Element("editor", fill_error=True)

        await _fill_text(editor, "正文内容")

        self.assertEqual(
            editor.events,
            [
                ("click", None),
                ("press", "Control+A"),
                ("press", "Backspace"),
                ("type", "正文内容", 1),
            ],
        )

    async def test_sms_login_page_is_never_treated_as_connected_creator_page(self):
        page = _Page()
        self.assertTrue(await _looks_like_login(page, "短信登录 发送验证码 登录即同意用户协议"))
        page.url = "https://creator.example.com/passport/login"
        self.assertTrue(await _looks_like_login(page, ""))

    def test_every_platform_has_resilient_entry_and_specific_editor_selectors(self):
        self.assertEqual(len(ARTICLE_CONFIG), 8)
        for platform, config in ARTICLE_CONFIG.items():
            with self.subTest(platform=platform):
                self.assertTrue(config["entry"])
                self.assertTrue(config["title"])
                self.assertTrue(config["editor"])
                self.assertTrue(config["publish"])
                self.assertNotIn("textarea", config["editor"])
        self.assertIn(".ProseMirror", GENERIC_EDITOR_SELECTORS)


if __name__ == "__main__":
    unittest.main()

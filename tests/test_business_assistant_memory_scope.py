import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.user_memory_service import UserMemoryService
from lib.user_memory_store import UserMemoryStore


class BusinessAssistantMemoryScopeTests(unittest.TestCase):
    def setUp(self):
        self._tempdir = tempfile.TemporaryDirectory()
        self.store = UserMemoryStore(
            str(Path(self._tempdir.name) / "memory.db")
        )
        self.service = UserMemoryService(self.store)
        for scope, key, value in [
            ("global", "industry", "本地餐饮"),
            ("positioning", "audience", "门店老板"),
            ("video", "visual_style", "真实门店纪实"),
            ("geo", "citation_style", "事实必须有来源"),
        ]:
            self.store.insert_item(
                user_id=1,
                scope=scope,
                category="preference" if "style" in key else "business",
                memory_key=key,
                value=value,
                source="manual",
                confidence=1,
            )

    def tearDown(self):
        self._tempdir.cleanup()

    def test_video_reads_shared_and_video_memory_only(self):
        result = self.service.retrieve_relevant_memories(
            user_id=1,
            scope="video",
            query="制作门店视频",
            max_items=20,
            max_chars=3000,
        )
        self.assertEqual(
            {item.scope for item in result.items},
            {"global", "positioning", "video"},
        )

    def test_geo_reads_shared_and_geo_memory_only(self):
        result = self.service.retrieve_relevant_memories(
            user_id=1,
            scope="geo",
            query="生成企业 GEO 文章",
            max_items=20,
            max_chars=3000,
        )
        self.assertEqual(
            {item.scope for item in result.items},
            {"global", "positioning", "geo"},
        )


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from lib.business_assistant_store import BusinessAssistantStore


class BusinessAssistantStoreTests(unittest.TestCase):
    def setUp(self):
        self._tempdir = tempfile.TemporaryDirectory()
        self.store = BusinessAssistantStore(
            str(Path(self._tempdir.name) / "business-assistant.db")
        )

    def tearDown(self):
        self._tempdir.cleanup()

    def test_projects_are_user_scoped(self):
        project = self.store.create_project(
            user_id=11,
            kind="video",
            title="首批口播",
            goal="生成三条成片",
            assistant_id="video-creation",
        )
        visible = self.store.get_project(user_id=11, project_id=project["id"])
        self.assertEqual(visible["title"], "首批口播")
        self.assertIsNone(
            self.store.get_project(user_id=22, project_id=project["id"])
        )
        self.assertEqual(self.store.list_projects(user_id=22), [])

    def test_project_revision_conflict(self):
        project = self.store.create_project(
            user_id=11,
            kind="geo",
            title="GEO 基建",
            goal="完成知识库",
            assistant_id="geo-growth",
        )
        updated = self.store.update_project(
            user_id=11,
            project_id=project["id"],
            revision=project["revision"],
            title="新版标题",
        )
        self.assertEqual(updated["revision"], 2)
        with self.assertRaises(BusinessAssistantStore.RevisionConflict):
            self.store.update_project(
                user_id=11,
                project_id=project["id"],
                revision=project["revision"],
                title="过期写入",
            )

    def test_completed_step_requires_real_evidence(self):
        project = self.store.create_project(
            user_id=11,
            kind="video",
            title="成片",
            goal="生成视频",
            assistant_id="video-creation",
        )
        steps = self.store.replace_steps(
            user_id=11,
            project_id=project["id"],
            revision=project["revision"],
            steps=[
                {
                    "stage": "generate",
                    "title": "生成首条成片",
                    "status": "active",
                    "order_index": 0,
                    "linked_view": "数字人视频创作（新）",
                }
            ],
        )
        step = steps[0]
        with self.assertRaises(BusinessAssistantStore.InvalidTransition):
            self.store.update_step(
                user_id=11,
                step_id=step["id"],
                revision=step["revision"],
                status="completed",
            )

        completed = self.store.update_step(
            user_id=11,
            step_id=step["id"],
            revision=step["revision"],
            status="completed",
            evidence={
                "source": "runtime_terminal",
                "taskId": "task-1",
                "status": "success",
            },
        )
        self.assertEqual(completed["status"], "completed")
        self.assertEqual(completed["linked_artifact"]["taskId"], "task-1")

    def test_messages_belong_to_project_owner(self):
        project = self.store.create_project(
            user_id=11,
            kind="geo",
            title="文章矩阵",
            goal="生成八篇文章",
            assistant_id="geo-growth",
        )
        message = self.store.append_message(
            user_id=11,
            project_id=project["id"],
            assistant_id="geo-growth",
            role="user",
            content="下一步做什么？",
            metadata={"page": "内容矩阵规划"},
        )
        self.assertEqual(message["content"], "下一步做什么？")
        self.assertEqual(
            len(
                self.store.list_messages(
                    user_id=11, project_id=project["id"]
                )
            ),
            1,
        )
        self.assertEqual(
            self.store.list_messages(user_id=22, project_id=project["id"]),
            [],
        )


if __name__ == "__main__":
    unittest.main()

import tempfile
import unittest
from pathlib import Path
import sys
import os
from types import SimpleNamespace
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
os.environ.setdefault("EMAIL_HASH_SALT", "0" * 64)

from fastapi import FastAPI
from fastapi.testclient import TestClient

import routes.business_assistant_routes as routes
from lib.business_assistant_store import BusinessAssistantStore


class BusinessAssistantRouteTests(unittest.TestCase):
    def setUp(self):
        self._tempdir = tempfile.TemporaryDirectory()
        self.store = BusinessAssistantStore(
            str(Path(self._tempdir.name) / "assistant-routes.db")
        )
        self.store_patch = patch.object(routes, "_store", return_value=self.store)
        self.auth_patch = patch.object(
            routes,
            "require_user",
            return_value=SimpleNamespace(id=11),
        )
        self.store_patch.start()
        self.auth_patch.start()
        app = FastAPI()
        app.include_router(routes.router)
        self.client = TestClient(app)

    def tearDown(self):
        self.store_patch.stop()
        self.auth_patch.stop()
        self._tempdir.cleanup()

    def test_project_crud_and_step_evidence(self):
        created = self.client.post(
            "/api/business-assistant/projects",
            json={
                "kind": "video",
                "title": "首批口播",
                "goal": "生成三条成片",
                "assistantId": "video-creation",
            },
        )
        self.assertEqual(created.status_code, 200)
        project = created.json()["project"]

        steps = self.client.put(
            f"/api/business-assistant/projects/{project['id']}/steps",
            json={
                "revision": project["revision"],
                "steps": [
                    {
                        "stage": "generate",
                        "title": "生成首条成片",
                        "status": "active",
                        "orderIndex": 0,
                        "linkedView": "数字人视频创作（新）",
                    }
                ],
            },
        )
        self.assertEqual(steps.status_code, 200)
        step = steps.json()["steps"][0]

        invalid = self.client.patch(
            f"/api/business-assistant/steps/{step['id']}",
            json={"revision": step["revision"], "status": "completed"},
        )
        self.assertEqual(invalid.status_code, 422)

        completed = self.client.patch(
            f"/api/business-assistant/steps/{step['id']}",
            json={
                "revision": step["revision"],
                "status": "completed",
                "evidence": {
                    "source": "runtime_terminal",
                    "taskId": "task-1",
                    "status": "success",
                },
            },
        )
        self.assertEqual(completed.status_code, 200)

    def test_cross_user_project_is_not_visible(self):
        project = self.store.create_project(
            user_id=22,
            kind="geo",
            title="其他账号项目",
            goal="隔离",
            assistant_id="geo-growth",
        )
        response = self.client.get(
            f"/api/business-assistant/projects/{project['id']}"
        )
        self.assertEqual(response.status_code, 404)

    def test_revision_conflict_returns_409(self):
        project = self.client.post(
            "/api/business-assistant/projects",
            json={
                "kind": "geo",
                "title": "GEO 基建",
                "goal": "完成知识库",
                "assistantId": "geo-growth",
            },
        ).json()["project"]
        first = self.client.patch(
            f"/api/business-assistant/projects/{project['id']}",
            json={"revision": 1, "title": "新标题"},
        )
        self.assertEqual(first.status_code, 200)
        stale = self.client.patch(
            f"/api/business-assistant/projects/{project['id']}",
            json={"revision": 1, "title": "过期标题"},
        )
        self.assertEqual(stale.status_code, 409)


if __name__ == "__main__":
    unittest.main()

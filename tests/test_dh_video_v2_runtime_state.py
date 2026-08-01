from fastapi import FastAPI
from fastapi.testclient import TestClient

from routes import dh_video_v2_routes as routes


def test_runtime_state_reports_only_non_terminal_tasks():
    app = FastAPI()
    app.include_router(routes.router)
    routes._dh_video_v2_task_store.clear()
    routes._dh_video_v2_task_store.update(
        {
            "running": {"status": "processing"},
            "queued": {"status": "queued"},
            "done": {"status": "completed"},
            "failed": {"status": "failed"},
        }
    )

    try:
        response = TestClient(app).get("/api/dh-video-v2/runtime-state")
        assert response.status_code == 200
        assert response.json() == {"active": True, "active_count": 2}
    finally:
        routes._dh_video_v2_task_store.clear()


import os
from unittest.mock import patch

from fastapi.testclient import TestClient

import main


def test_health_endpoint_ok():
    client = TestClient(main.app)
    with patch("subprocess.run") as mock_run:
        mock_run.return_value.returncode = 0
        resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["checks"]["ffmpeg"] == "ok"

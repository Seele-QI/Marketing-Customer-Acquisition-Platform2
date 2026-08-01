from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

import routes.agent_team_routes as routes
from lib.agent_team_store import AgentTeamStore


def make_client(tmp_path, monkeypatch, user_id=11):
    store = AgentTeamStore(str(tmp_path / "routes.db"))
    monkeypatch.setattr(routes, "_store", lambda: store)
    monkeypatch.setattr(routes, "require_user", lambda request: SimpleNamespace(id=user_id))
    monkeypatch.setenv("CREDIT_METERED_KEY", "internal-secret")
    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app), store


def test_authenticated_run_and_knowledge_routes(tmp_path, monkeypatch):
    client, store = make_client(tmp_path, monkeypatch)
    created = client.post("/api/agent-team/runs", json={"agentId": "legal-compliance", "prompt": "审合同"})
    assert created.status_code == 200
    run = created.json()["run"]
    assert client.get(f"/api/agent-team/runs/{run['id']}").status_code == 200

    imported = client.post(
        "/api/agent-team/knowledge/import",
        json={"scope": "department", "departmentId": "legal-compliance", "name": "制度", "text": "合同必须复核"},
    )
    assert imported.status_code == 200
    forbidden = client.post("/api/agent-team/knowledge/search", json={"query": "合同"})
    assert forbidden.status_code == 403
    found = client.post(
        "/api/agent-team/knowledge/search",
        headers={"X-Metered-Key": "internal-secret"},
        json={"query": "合同", "scope": "department", "departmentId": "legal-compliance"},
    )
    assert found.status_code == 200
    assert len(found.json()["items"]) == 1


def test_approval_requires_exact_approved_parameters(tmp_path, monkeypatch):
    client, store = make_client(tmp_path, monkeypatch)
    run = store.create_run(user_id=11, agent_id="public-affairs", prompt="发送")
    created = client.post(
        "/api/agent-team/approvals",
        headers={"X-Metered-Key": "internal-secret"},
        json={"runId": run["id"], "actionType": "external_send", "parameters": {"target": "a"}, "ttlSeconds": 300},
    )
    assert created.status_code == 200
    approval = created.json()["approval"]
    decided = client.post(
        f"/api/agent-team/approvals/{approval['id']}/decision",
        json={"revision": 1, "decision": "approved", "decidedBy": "负责人"},
    )
    assert decided.status_code == 200
    mismatch = client.post(
        f"/api/agent-team/approvals/{approval['id']}/execution-evidence",
        headers={"X-Metered-Key": "internal-secret"},
        json={"parameters": {"target": "b"}, "status": "completed", "evidence": {}},
    )
    assert mismatch.status_code == 409


def test_public_run_history_redacts_internal_model_routing(tmp_path, monkeypatch):
    client, _store = make_client(tmp_path, monkeypatch)
    created = client.post("/api/agent-team/runs", json={"agentId": "legal-compliance", "prompt": "审合同"})
    run = created.json()["run"]
    secret_route = {"providerName": "secret-provider", "model": "secret-model", "source": "cloud"}
    updated = client.patch(
        f"/api/agent-team/runs/{run['id']}",
        headers={"X-Metered-Key": "internal-secret"},
        json={
            "revision": 1,
            "status": "completed",
            "result": {"finalText": "完成", "routeSnapshots": [secret_route]},
        },
    )
    assert updated.status_code == 200
    event = client.post(
        f"/api/agent-team/runs/{run['id']}/events",
        headers={"X-Metered-Key": "internal-secret"},
        json={"eventType": "result", "payload": {"status": "completed", "routeSnapshots": [secret_route]}},
    )
    assert event.status_code == 200

    detail = client.get(f"/api/agent-team/runs/{run['id']}")
    listing = client.get("/api/agent-team/runs")
    assert detail.status_code == 200
    assert listing.status_code == 200
    public_json = f"{detail.text}\n{listing.text}"
    assert "secret-provider" not in public_json
    assert "secret-model" not in public_json
    assert detail.json()["run"]["result"]["modelRouting"] == {"source": "server", "successfulCalls": 1}

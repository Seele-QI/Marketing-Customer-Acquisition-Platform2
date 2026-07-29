from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient


@pytest.fixture()
def route_app(tmp_path, monkeypatch):
    db_path = str(tmp_path / "memory-routes.db")
    monkeypatch.setenv("CREDIT_DB_OVERRIDE", db_path)
    monkeypatch.setenv("CREDIT_METERED_KEY", "internal-test-key")

    import routes.user_memory_routes as routes
    from lib.user_memory_store import UserMemoryStore

    identity = {"user_id": 1}
    monkeypatch.setattr(
        routes,
        "require_user",
        lambda _request: SimpleNamespace(id=identity["user_id"]),
    )
    app = FastAPI()
    app.include_router(routes.router)
    return TestClient(app), UserMemoryStore(db_path), identity, routes


def test_routes_require_an_authenticated_user(route_app, monkeypatch):
    client, _, _, routes = route_app

    def unauthorized(_request):
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN"})

    monkeypatch.setattr(routes, "require_user", unauthorized)
    response = client.get("/api/memory/summary")
    assert response.status_code == 401
    assert response.json()["detail"]["code"] == "NOT_LOGGED_IN"


def test_observe_is_idempotent_and_never_accepts_target_user_id(route_app):
    client, _, identity, _ = route_app
    payload = {
        "scope": "copywriting",
        "sessionId": "session-a",
        "messageId": "message-a",
        "text": "我是做装修设计的",
        "user_id": 999,
    }
    first = client.post("/api/memory/observe", json=payload)
    second = client.post("/api/memory/observe", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["observationId"] == second.json()["observationId"]
    assert first.json()["created"] is True
    assert second.json()["created"] is False
    assert identity["user_id"] == 1


def test_internal_consolidation_and_retrieval_require_metered_key(route_app):
    client, _, _, _ = route_app
    response = client.post(
        "/api/memory/consolidate",
        json={"observationIds": [], "candidates": []},
    )
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "MEMORY_INTERNAL_FORBIDDEN"

    allowed = client.post(
        "/api/memory/consolidate",
        headers={"X-Metered-Key": "internal-test-key"},
        json={
            "observationIds": [],
            "candidates": [
                {
                    "operation": "create",
                    "scope": "global",
                    "category": "business",
                    "memoryKey": "industry",
                    "value": "装修设计",
                    "confidence": 0.95,
                    "stable": True,
                    "evidence": "用户说自己从事装修设计",
                }
            ],
        },
    )
    assert allowed.status_code == 200
    assert allowed.json()["created"] == 1

    retrieved = client.post(
        "/api/memory/retrieve",
        headers={"X-Metered-Key": "internal-test-key"},
        json={"scope": "copywriting", "query": "写装修文案", "maxItems": 10, "maxChars": 1000},
    )
    assert retrieved.status_code == 200
    assert retrieved.json()["count"] == 1
    assert "装修设计" in retrieved.json()["context"]


def test_retryable_consolidation_failure_requeues_claimed_observation(route_app):
    client, _, _, _ = route_app
    observed = client.post(
        "/api/memory/observe",
        json={
            "scope": "copywriting",
            "sessionId": "retry-session",
            "messageId": "retry-message",
            "text": "我偏好专业克制的表达",
        },
    ).json()
    observation_id = observed["observationId"]

    failed = client.post(
        "/api/memory/consolidate",
        headers={"X-Metered-Key": "internal-test-key"},
        json={
            "observationIds": [observation_id],
            "candidates": [],
            "retryableFailure": True,
            "errorCode": "MEMORY_EXTRACTION_FAILED",
        },
    )
    assert failed.status_code == 200
    assert failed.json() == {"failed": True, "retryable": True}

    retried = client.post(
        "/api/memory/observe",
        json={
            "scope": "copywriting",
            "sessionId": "new-session",
            "messageId": "new-message",
            "text": "触发重试",
        },
    ).json()
    assert observation_id in {row["id"] for row in retried["claimed"]}


def test_crud_is_account_scoped_and_stale_revisions_conflict(route_app):
    client, store, identity, _ = route_app
    item = store.insert_item(
        user_id=1,
        scope="global",
        category="identity",
        memory_key="role",
        value="老板",
        source="manual",
        confidence=1,
    )

    listed = client.get("/api/memory/items")
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()["items"]] == [item.id]

    updated = client.patch(
        f"/api/memory/items/{item.id}",
        json={"revision": item.revision, "value": "创始人", "pinned": True},
    )
    assert updated.status_code == 200
    assert updated.json()["item"]["value"] == "创始人"

    stale = client.patch(
        f"/api/memory/items/{item.id}",
        json={"revision": item.revision, "value": "过期覆盖"},
    )
    assert stale.status_code == 409
    assert stale.json()["detail"]["code"] == "MEMORY_REVISION_CONFLICT"
    assert "过期覆盖" not in str(stale.json())

    identity["user_id"] = 2
    assert client.patch(
        f"/api/memory/items/{item.id}",
        json={"revision": item.revision + 1, "value": "越权"},
    ).status_code == 404
    assert client.delete(
        f"/api/memory/items/{item.id}",
        params={"revision": item.revision + 1},
    ).status_code == 404


def test_retrieval_context_is_isolated_between_accounts(route_app):
    client, store, identity, _ = route_app
    store.insert_item(
        user_id=1,
        scope="global",
        category="business",
        memory_key="industry",
        value="account-one-renovation",
        source="manual",
        confidence=1,
    )
    store.insert_item(
        user_id=2,
        scope="global",
        category="business",
        memory_key="industry",
        value="account-two-fitness",
        source="manual",
        confidence=1,
    )

    first = client.post(
        "/api/memory/retrieve",
        headers={"X-Metered-Key": "internal-test-key"},
        json={"scope": "copywriting", "query": "industry", "maxItems": 10, "maxChars": 1000},
    )
    assert first.status_code == 200
    assert "account-one-renovation" in first.json()["context"]
    assert "account-two-fitness" not in first.json()["context"]

    identity["user_id"] = 2
    second = client.post(
        "/api/memory/retrieve",
        headers={"X-Metered-Key": "internal-test-key"},
        json={"scope": "copywriting", "query": "industry", "maxItems": 10, "maxChars": 1000},
    )
    assert second.status_code == 200
    assert "account-two-fitness" in second.json()["context"]
    assert "account-one-renovation" not in second.json()["context"]


def test_disable_restore_delete_clear_and_events(route_app):
    client, store, _, _ = route_app
    item = store.insert_item(
        user_id=1, scope="copywriting", category="constraint", memory_key="no_claims",
        value="不要夸大承诺", source="manual", confidence=1,
    )

    disabled = client.post(
        f"/api/memory/items/{item.id}/disable", json={"revision": item.revision}
    )
    assert disabled.status_code == 200
    disabled_item = disabled.json()["item"]
    assert disabled_item["status"] == "disabled"

    restored = client.post(
        f"/api/memory/items/{item.id}/restore",
        json={"revision": disabled_item["revision"]},
    )
    assert restored.status_code == 200
    restored_item = restored.json()["item"]

    deleted = client.delete(
        f"/api/memory/items/{item.id}", params={"revision": restored_item["revision"]}
    )
    assert deleted.status_code == 200
    assert client.get("/api/memory/items").json()["items"] == []
    assert len(client.get("/api/memory/events").json()["events"]) == 4

    extra = store.insert_item(
        user_id=1, scope="global", category="goal", memory_key="lead_goal",
        value="获得精准客户", source="manual", confidence=1,
    )
    assert extra.id
    assert client.post("/api/memory/clear").json()["deleted"] == 1


def test_settings_summary_and_legacy_import_are_idempotent(route_app):
    client, _, _, _ = route_app
    settings = client.get("/api/memory/settings")
    assert settings.status_code == 200
    assert settings.json()["settings"]["enabled"] is True

    patched = client.patch(
        "/api/memory/settings",
        json={"enabled": False, "scopeEnabled": {"copywriting": False}},
    )
    assert patched.json()["settings"]["scopeEnabled"]["copywriting"] is False

    legacy = {
        "industry": "装修设计",
        "role": "装修老板",
        "goals": ["持续获客"],
        "preferences": ["专业克制"],
        "facts": ["主要服务中小企业"],
    }
    first = client.post("/api/memory/import-legacy", json={"memory": legacy})
    second = client.post("/api/memory/import-legacy", json={"memory": legacy})
    assert first.status_code == 200
    assert first.json()["imported"] > 0
    assert second.json() == {"imported": 0, "alreadyImported": True}
    assert client.get("/api/memory/summary").json()["summary"]["total"] == first.json()["imported"]

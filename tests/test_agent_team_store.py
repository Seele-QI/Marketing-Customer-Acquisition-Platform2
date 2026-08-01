import json
import time

import pytest

from lib.agent_team_store import AgentTeamStore


@pytest.fixture()
def store(tmp_path):
    return AgentTeamStore(str(tmp_path / "agent-team.db"))


def test_runs_are_user_scoped_and_revision_guarded(store):
    run = store.create_run(user_id=11, agent_id="legal-compliance", prompt="审合同")
    assert store.get_run(user_id=11, run_id=run["id"])["agent_id"] == "legal-compliance"
    assert store.get_run(user_id=22, run_id=run["id"]) is None
    updated = store.update_run(
        user_id=11,
        run_id=run["id"],
        expected_revision=1,
        status="running",
        result={"text": "working"},
    )
    assert updated["revision"] == 2
    with pytest.raises(AgentTeamStore.RevisionConflict):
        store.update_run(user_id=11, run_id=run["id"], expected_revision=1, status="completed")


def test_knowledge_search_respects_user_and_scope(store):
    doc = store.import_knowledge(
        user_id=11,
        scope="department",
        department_id="legal-compliance",
        name="合同制度",
        text="供应商合同必须经过法务复核。",
    )
    assert doc["revision"] == 1
    assert len(store.search_knowledge(user_id=11, query="合同", scope="department", department_id="legal-compliance")) == 1
    assert store.search_knowledge(user_id=22, query="合同") == []
    assert store.search_knowledge(user_id=11, query="合同", scope="company") == []
    store.import_knowledge(user_id=11, scope="task", task_id="run-a", name="A", text="任务专属事实")
    assert len(store.search_knowledge(user_id=11, query="任务专属", scope="task", task_id="run-a")) == 1
    assert store.search_knowledge(user_id=11, query="任务专属", scope="task", task_id="run-b") == []


def test_approval_expiry_parameter_hash_and_immutable_evidence(store):
    run = store.create_run(user_id=11, agent_id="public-affairs", prompt="对外发送")
    params = {"channel": "email", "recipient": "partner@example.com"}
    approval = store.create_approval(
        user_id=11,
        run_id=run["id"],
        action_type="external_send",
        parameters=params,
        expires_at=int(time.time()) + 60,
    )
    approved = store.decide_approval(
        user_id=11,
        approval_id=approval["id"],
        expected_revision=1,
        decision="approved",
        decided_by="负责人",
    )
    evidence = store.record_execution_evidence(
        user_id=11,
        approval_id=approval["id"],
        parameters=params,
        status="completed",
        evidence={"message_id": "m-1"},
    )
    assert evidence["status"] == "completed"
    with pytest.raises(AgentTeamStore.ImmutableEvidence):
        store.record_execution_evidence(
            user_id=11,
            approval_id=approval["id"],
            parameters=params,
            status="completed",
            evidence={"message_id": "m-2"},
        )
    assert approved["status"] == "approved"

    second = store.create_approval(
        user_id=11,
        run_id=run["id"],
        action_type="external_send",
        parameters=params,
        expires_at=int(time.time()) + 60,
    )
    store.decide_approval(user_id=11, approval_id=second["id"], expected_revision=1, decision="approved", decided_by="负责人")
    with pytest.raises(AgentTeamStore.ParameterMismatch):
        store.record_execution_evidence(
            user_id=11,
            approval_id=second["id"],
            parameters={"channel": "email", "recipient": "other@example.com"},
            status="completed",
            evidence={},
        )

    expired = store.create_approval(
        user_id=11,
        run_id=run["id"],
        action_type="external_send",
        parameters=params,
        expires_at=int(time.time()) - 1,
    )
    with pytest.raises(AgentTeamStore.ApprovalExpired):
        store.decide_approval(user_id=11, approval_id=expired["id"], expected_revision=1, decision="approved", decided_by="负责人")


def test_events_are_append_only_and_user_scoped(store):
    run = store.create_run(user_id=11, agent_id="chief-coordinator", prompt="联合评审")
    event = store.append_event(user_id=11, run_id=run["id"], event_type="planned", payload={"members": 2})
    assert event["event_type"] == "planned"
    assert len(store.list_events(user_id=11, run_id=run["id"])) == 1
    assert store.list_events(user_id=22, run_id=run["id"]) == []

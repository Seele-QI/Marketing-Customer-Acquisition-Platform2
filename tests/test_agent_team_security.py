import time

import pytest

from lib.agent_team_store import AgentTeamStore


def test_cross_user_department_task_and_approval_boundaries(tmp_path):
    store = AgentTeamStore(str(tmp_path / "security.db"))
    run = store.create_run(user_id=101, agent_id="legal-compliance", prompt="审查")
    store.import_knowledge(
        user_id=101,
        scope="department",
        department_id="legal-compliance",
        name="法务制度",
        text="合同复核要求",
    )
    store.import_knowledge(
        user_id=101,
        scope="task",
        task_id=run["id"],
        name="本任务材料",
        text="只属于当前任务",
    )
    assert store.search_knowledge(user_id=202, query="合同") == []
    assert store.search_knowledge(user_id=101, query="合同", scope="department", department_id="finance-control") == []
    assert store.search_knowledge(user_id=101, query="当前任务", scope="task", task_id="another-run") == []

    approval = store.create_approval(
        user_id=101,
        run_id=run["id"],
        action_type="content_publish",
        parameters={"platform": "douyin", "title": "A"},
        expires_at=int(time.time()) + 60,
    )
    assert store.get_approval(user_id=202, approval_id=approval["id"]) is None
    with pytest.raises(AgentTeamStore.NotFound):
        store.decide_approval(
            user_id=202,
            approval_id=approval["id"],
            expected_revision=1,
            decision="approved",
            decided_by="other",
        )

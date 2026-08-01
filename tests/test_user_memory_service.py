from __future__ import annotations

from datetime import datetime, timezone

import pytest


@pytest.fixture()
def memory(tmp_path):
    from lib.user_memory_service import UserMemoryService
    from lib.user_memory_store import UserMemoryStore

    store = UserMemoryStore(str(tmp_path / "memory.db"))
    return store, UserMemoryService(store)


def candidate(
    value,
    *,
    operation="create",
    scope="global",
    category="business",
    memory_key="industry",
    confidence=0.9,
    stable=True,
    evidence="用户明确说明",
):
    from lib.user_memory_service import MemoryCandidate

    return MemoryCandidate(
        operation=operation,
        scope=scope,
        category=category,
        memory_key=memory_key,
        value=value,
        confidence=confidence,
        stable=stable,
        evidence=evidence,
    )


def test_same_fact_reinforces_instead_of_duplicating(memory):
    store, service = memory
    service.consolidate_candidates(user_id=1, observation_ids=["o1"], candidates=[candidate("装修设计")])
    first = store.get_active_item(
        user_id=1, scope="global", category="business", memory_key="industry"
    )

    result = service.consolidate_candidates(
        user_id=1,
        observation_ids=["o2"],
        candidates=[candidate(" 装修设计 ", operation="reinforce")],
    )
    current = store.get_active_item(
        user_id=1, scope="global", category="business", memory_key="industry"
    )

    assert result.reinforced == 1
    assert current.id == first.id
    assert current.strength > first.strength
    assert len(store.list_items(user_id=1)) == 1


def test_new_explicit_fact_supersedes_old_and_keeps_history(memory):
    store, service = memory
    service.consolidate_candidates(user_id=1, observation_ids=["o1"], candidates=[candidate("装修设计")])
    old = store.get_active_item(
        user_id=1, scope="global", category="business", memory_key="industry"
    )

    result = service.consolidate_candidates(
        user_id=1,
        observation_ids=["o2"],
        candidates=[candidate("家装培训", operation="supersede", confidence=0.96)],
    )
    current = store.get_active_item(
        user_id=1, scope="global", category="business", memory_key="industry"
    )

    assert result.superseded == 1
    assert current.value == "家装培训"
    assert store.get_item(user_id=1, item_id=old.id).status == "superseded"
    assert any(event.event_type == "superseded" for event in store.list_events(user_id=1))


def test_manual_memory_resists_low_confidence_automatic_replacement(memory):
    store, service = memory
    manual = store.insert_item(
        user_id=1,
        scope="global",
        category="identity",
        memory_key="role",
        value="创始人",
        source="manual",
        confidence=1,
    )

    result = service.consolidate_candidates(
        user_id=1,
        observation_ids=["o1"],
        candidates=[
            candidate(
                "运营",
                operation="supersede",
                category="identity",
                memory_key="role",
                confidence=0.72,
            )
        ],
    )

    assert result.ignored == 1
    assert store.get_active_item(
        user_id=1, scope="global", category="identity", memory_key="role"
    ).id == manual.id


@pytest.mark.parametrize(
    "value",
    [
        "手机号 13800138000",
        "身份证 110101199001011234",
        "银行卡 6222020202020202020",
        "api_key=sk-abcdefghijklmnopqrstuvwxyz123456",
        "密码是 MySecret!234",
    ],
)
def test_sensitive_values_are_rejected_before_persistence(memory, value):
    store, service = memory

    result = service.consolidate_candidates(
        user_id=1,
        observation_ids=["o1"],
        candidates=[candidate(value, category="fact", memory_key="contact")],
    )

    assert result.rejected_sensitive == 1
    assert store.list_items(user_id=1) == []
    assert value not in repr(store.list_events(user_id=1))


def test_ignore_and_unstable_temporary_requests_are_not_saved(memory):
    store, service = memory
    result = service.consolidate_candidates(
        user_id=1,
        observation_ids=["o1"],
        candidates=[
            candidate("今天写十条标题", operation="ignore", stable=False),
            candidate(
                "本次用活泼语气",
                scope="copywriting",
                category="preference",
                memory_key="temporary_tone",
                stable=False,
            ),
        ],
    )

    assert result.ignored == 2
    assert store.list_items(user_id=1) == []


def test_retrieval_uses_global_and_current_scope_but_not_other_modules(memory):
    store, service = memory
    store.insert_item(
        user_id=1, scope="global", category="business", memory_key="industry",
        value="装修设计", source="manual", confidence=1,
    )
    store.insert_item(
        user_id=1, scope="copywriting", category="preference", memory_key="tone",
        value="朋友圈文案要专业克制", source="manual", confidence=1,
    )
    store.insert_item(
        user_id=1, scope="geo", category="preference", memory_key="citation_style",
        value="GEO文章必须引用论文", source="manual", confidence=1,
    )

    result = service.retrieve_relevant_memories(
        user_id=1,
        scope="copywriting",
        query="帮我的装修业务写一条朋友圈文案",
        max_items=10,
        max_chars=1000,
    )

    assert {item.scope for item in result.items} == {"global", "copywriting"}
    assert all("GEO" not in str(item.value) for item in result.items)


def test_constraints_rank_before_preferences_and_budgets_are_enforced(memory):
    store, service = memory
    store.insert_item(
        user_id=1, scope="copywriting", category="preference", memory_key="tone",
        value="表达轻松自然", source="extracted", confidence=0.9,
    )
    store.insert_item(
        user_id=1, scope="copywriting", category="constraint", memory_key="no_claims",
        value="禁止承诺百分之百效果", source="extracted", confidence=0.9,
    )
    for index in range(8):
        store.insert_item(
            user_id=1, scope="global", category="fact", memory_key=f"fact_{index}",
            value=f"这是第{index}条较长的稳定业务事实", source="extracted", confidence=0.8,
        )

    result = service.retrieve_relevant_memories(
        user_id=1,
        scope="copywriting",
        query="写文案",
        max_items=3,
        max_chars=90,
    )

    assert len(result.items) <= 3
    assert len(result.context) <= 90
    assert result.items[0].category == "constraint"


def test_preferences_decay_in_score_without_being_deleted(memory):
    store, service = memory
    preference = store.insert_item(
        user_id=1,
        scope="copywriting",
        category="preference",
        memory_key="tone",
        value="喜欢活泼语气",
        source="extracted",
        confidence=0.9,
    )
    fact = store.insert_item(
        user_id=1,
        scope="global",
        category="business",
        memory_key="industry",
        value="装修设计",
        source="extracted",
        confidence=0.9,
    )
    old_time = int(datetime(2024, 1, 1, tzinfo=timezone.utc).timestamp())
    with store._transaction() as conn:
        conn.execute(
            "UPDATE user_memory_items SET last_confirmed_at=? WHERE id IN (?,?)",
            (old_time, preference.id, fact.id),
        )

    result = service.retrieve_relevant_memories(
        user_id=1,
        scope="copywriting",
        query="装修文案语气",
        max_items=10,
        max_chars=1000,
        now=int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp()),
    )
    scores = {item.memory_key: item.score for item in result.items}

    assert store.get_item(user_id=1, item_id=preference.id) is not None
    assert scores["industry"] > scores["tone"]

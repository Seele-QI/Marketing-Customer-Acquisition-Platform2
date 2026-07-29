from __future__ import annotations

import json

import pytest


@pytest.fixture()
def store(tmp_path):
    from lib.user_memory_store import UserMemoryStore

    return UserMemoryStore(str(tmp_path / "memory.db"))


def test_observations_are_idempotent_and_account_scoped(store):
    first = store.observe_user_message(
        user_id=1,
        scope="copywriting",
        session_id="session-a",
        message_id="message-a",
        text="我是做装修设计的",
    )
    duplicate = store.observe_user_message(
        user_id=1,
        scope="copywriting",
        session_id="session-a",
        message_id="message-a",
        text="我是做装修设计的",
    )
    other_account = store.observe_user_message(
        user_id=2,
        scope="copywriting",
        session_id="session-a",
        message_id="message-a",
        text="我是做餐饮的",
    )

    assert first.observation_id == duplicate.observation_id
    assert first.observation_id != other_account.observation_id
    assert first.created is True
    assert duplicate.created is False


def test_claim_complete_and_retry_observation_batch(store):
    first = store.observe_user_message(
        user_id=1,
        scope="copywriting",
        session_id="s",
        message_id="m1",
        text="我喜欢专业克制的语气",
    )
    second = store.observe_user_message(
        user_id=1,
        scope="copywriting",
        session_id="s",
        message_id="m2",
        text="不要使用夸张承诺",
    )

    claimed = store.claim_observation_batch(user_id=1, scope="copywriting", limit=10)
    assert {row.id for row in claimed} == {first.observation_id, second.observation_id}
    assert store.claim_observation_batch(user_id=1, scope="copywriting", limit=10) == []

    store.fail_observations(user_id=1, observation_ids=[first.observation_id], retryable=True)
    store.complete_observations(user_id=1, observation_ids=[second.observation_id])

    retry = store.claim_observation_batch(user_id=1, scope="copywriting", limit=10)
    assert [row.id for row in retry] == [first.observation_id]


def test_stale_processing_observation_is_reclaimed_after_worker_crash(store):
    observed = store.observe_user_message(
        user_id=1,
        scope="copywriting",
        session_id="crash-session",
        message_id="crash-message",
        text="我长期偏好专业表达",
    )
    claimed = store.claim_observation_batch(user_id=1, scope="copywriting", limit=10)
    assert [row.id for row in claimed] == [observed.observation_id]
    with store._transaction() as conn:
        conn.execute(
            "UPDATE user_memory_observations SET updated_at=0 WHERE id=?",
            (observed.observation_id,),
        )

    reclaimed = store.claim_observation_batch(user_id=1, scope="copywriting", limit=10)
    assert [row.id for row in reclaimed] == [observed.observation_id]
    assert reclaimed[0].attempts == 2


def test_only_one_active_item_exists_for_a_memory_key(store):
    first = store.insert_item(
        user_id=1,
        scope="global",
        category="business",
        memory_key="industry",
        value="装修设计",
        source="extracted",
        confidence=0.9,
    )

    with pytest.raises(store.ActiveMemoryExists):
        store.insert_item(
            user_id=1,
            scope="global",
            category="business",
            memory_key="industry",
            value="家装培训",
            source="extracted",
            confidence=0.9,
        )

    assert store.get_item(user_id=1, item_id=first.id) is not None
    assert store.get_item(user_id=2, item_id=first.id) is None


def test_updates_require_current_revision_and_append_events(store):
    item = store.insert_item(
        user_id=1,
        scope="copywriting",
        category="preference",
        memory_key="tone",
        value="专业",
        source="manual",
        confidence=1.0,
    )
    updated = store.update_item(
        user_id=1,
        item_id=item.id,
        expected_revision=item.revision,
        value="专业、克制",
        pinned=True,
    )

    assert updated.revision == item.revision + 1
    assert json.loads(updated.value_json) == "专业、克制"
    assert updated.pinned is True
    with pytest.raises(store.RevisionConflict):
        store.update_item(
            user_id=1,
            item_id=item.id,
            expected_revision=item.revision,
            value="过期写入",
        )

    events = store.list_events(user_id=1, item_id=item.id)
    assert [event.event_type for event in events] == ["created", "updated"]
    assert store.list_events(user_id=2, item_id=item.id) == []


def test_superseded_disabled_and_deleted_items_are_not_active(store):
    old = store.insert_item(
        user_id=1,
        scope="global",
        category="business",
        memory_key="industry",
        value="装修设计",
        source="extracted",
        confidence=0.8,
    )
    new = store.supersede_item(
        user_id=1,
        old_item_id=old.id,
        expected_revision=old.revision,
        value="家装培训",
        source="extracted",
        confidence=0.95,
    )

    assert store.get_item(user_id=1, item_id=old.id).status == "superseded"
    assert [item.id for item in store.list_items(user_id=1)] == [new.id]

    disabled = store.set_item_status(
        user_id=1,
        item_id=new.id,
        expected_revision=new.revision,
        status="disabled",
    )
    assert store.list_items(user_id=1) == []
    restored = store.set_item_status(
        user_id=1,
        item_id=new.id,
        expected_revision=disabled.revision,
        status="active",
    )
    deleted = store.set_item_status(
        user_id=1,
        item_id=new.id,
        expected_revision=restored.revision,
        status="deleted",
    )
    assert deleted.status == "deleted"
    assert store.get_item(user_id=1, item_id=new.id) is None
    assert store.get_item(user_id=1, item_id=new.id, include_deleted=True).status == "deleted"


def test_settings_and_legacy_import_marker_are_per_account(store):
    initial = store.get_settings(user_id=1)
    assert initial.enabled is True
    assert initial.scope_enabled["copywriting"] is True

    updated = store.update_settings(
        user_id=1,
        enabled=False,
        scope_enabled={"copywriting": False, "geo": True},
    )
    assert updated.enabled is False
    assert store.get_settings(user_id=2).enabled is True

    assert store.mark_legacy_imported(user_id=1) is True
    assert store.mark_legacy_imported(user_id=1) is False
    assert store.mark_legacy_imported(user_id=2) is True


def test_clear_items_soft_deletes_only_the_callers_active_items(store):
    first = store.insert_item(
        user_id=1,
        scope="global",
        category="identity",
        memory_key="role",
        value="老板",
        source="manual",
        confidence=1,
    )
    other = store.insert_item(
        user_id=2,
        scope="global",
        category="identity",
        memory_key="role",
        value="运营",
        source="manual",
        confidence=1,
    )

    assert store.clear_items(user_id=1) == 1
    assert store.get_item(user_id=1, item_id=first.id) is None
    assert store.get_item(user_id=2, item_id=other.id) is not None

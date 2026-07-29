"""验证 lib/api_auth.py 的鉴权 / 幂等 / 退款 / payload 校验。"""
import importlib
import os
import sqlite3
import tempfile
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi import HTTPException


@pytest.fixture()
def tmp_db(monkeypatch):
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("CREDIT_DB_OVERRIDE", path)
    monkeypatch.setenv("EMAIL_HASH_SALT", "test-salt")

    import lib.db as db_mod
    importlib.reload(db_mod)
    import lib.credit as credit_mod
    importlib.reload(credit_mod)
    import lib.api_auth as auth_mod
    importlib.reload(auth_mod)

    credit_mod.ensure_credit_schema()


    conn = sqlite3.connect(path)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email_hash TEXT NOT NULL,
            email_masked TEXT NOT NULL,
            login_name TEXT NOT NULL,
            password_hash TEXT,
            password_salt TEXT,
            nickname TEXT,
            status TEXT NOT NULL DEFAULT 'active',
            created_at INTEGER NOT NULL,
            last_seen_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS credit_accounts (
            user_id INTEGER PRIMARY KEY,
            balance INTEGER NOT NULL DEFAULT 0,
            total_recharged INTEGER NOT NULL DEFAULT 0,
            total_bonus INTEGER NOT NULL DEFAULT 0,
            total_consumed INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS credit_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            delta INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            ref_id TEXT,
            note TEXT,
            created_at INTEGER NOT NULL
        );
        """
    )
    conn.execute(
        "INSERT INTO users (email_hash, email_masked, login_name, status, created_at, last_seen_at) "
        "VALUES ('h1', 'a**@x', 'tester', 'active', 0, 0)"
    )
    user_id = conn.execute("SELECT id FROM users LIMIT 1").fetchone()[0]
    conn.execute(
        "INSERT INTO credit_accounts (user_id, balance, total_bonus, updated_at) VALUES (?, 10000, 10000, 0)",
        (user_id,),
    )
    conn.commit()
    conn.close()

    auth_mod.ensure_credit_idempotency_index()
    try:
        yield auth_mod, credit_mod, user_id
    finally:
        # teardown：把 lib.db / lib.credit / lib.api_auth reload 回 monkeypatch 还原后的 env
        # 否则全局 DB_PATH 仍指向已删除的 tmp 文件，污染后续测试
        monkeypatch.undo()
        importlib.reload(db_mod)
        importlib.reload(credit_mod)
        importlib.reload(auth_mod)
        try:
            os.unlink(path)
        except OSError:
            pass


def test_check_base64_size_ok(tmp_db):
    auth_mod, _, _ = tmp_db
    auth_mod.check_base64_size("A" * 1024, max_mb=1, name="image")


def test_check_base64_size_too_large(tmp_db):
    auth_mod, _, _ = tmp_db
    huge = "A" * (2 * 1024 * 1024)
    with pytest.raises(HTTPException) as exc:
        auth_mod.check_base64_size(huge, max_mb=1, name="image")
    assert exc.value.status_code == 413


def test_consume_with_idempotency_single_call(tmp_db):
    auth_mod, _, uid = tmp_db
    bal = auth_mod.consume_with_idempotency(user_id=uid, scene="ai_chat", ref_id="r1")
    assert bal == 10000 - 3


def test_poster_image_scene_costs_twenty_credits(tmp_db):
    auth_mod, _, uid = tmp_db
    assert auth_mod.SCENE_COST_TABLE["poster_image"] == 20
    balance = auth_mod.consume_with_idempotency(
        user_id=uid,
        scene="poster_image",
        ref_id="poster-image-1",
    )
    assert balance == 10000 - 20


def test_image_creation_scene_costs_twenty_credits(tmp_db):
    auth_mod, _, uid = tmp_db
    assert auth_mod.SCENE_COST_TABLE["image_creation"] == 20
    balance = auth_mod.consume_with_idempotency(
        user_id=uid,
        scene="image_creation",
        ref_id="image-creation-1",
    )
    assert balance == 10000 - 20


def test_consume_ai_llm_variable_cost(tmp_db):
    auth_mod, credit_mod, uid = tmp_db
    bal = auth_mod.consume_ai_llm(user_id=uid, ref_id="llm-1", cost=30)
    assert bal == 10000 - 30
    assert credit_mod.get_account(uid).balance == 10000 - 30
    # 幂等
    bal2 = auth_mod.consume_ai_llm(user_id=uid, ref_id="llm-1", cost=30)
    assert bal2 == bal


def test_consume_ai_llm_rejects_invalid_cost(tmp_db):
    auth_mod, _, uid = tmp_db
    with pytest.raises(HTTPException) as exc:
        auth_mod.consume_ai_llm(user_id=uid, ref_id="llm-bad", cost=0)
    assert exc.value.status_code == 400


def test_consume_with_idempotency_duplicate_ref(tmp_db):
    auth_mod, _, uid = tmp_db
    bal1 = auth_mod.consume_with_idempotency(user_id=uid, scene="ai_chat", ref_id="r-dup")
    bal2 = auth_mod.consume_with_idempotency(user_id=uid, scene="ai_chat", ref_id="r-dup")
    assert bal1 == bal2, "同一 ref_id 应只扣一次"


def test_consume_with_idempotency_records_business_task_context(tmp_db):
    auth_mod, credit_mod, uid = tmp_db
    auth_mod.consume_with_idempotency(
        user_id=uid,
        scene="dh_v2_plan_script",
        ref_id="video-context:plan",
        business_task_id="video-context",
        business_type="video_digital_human",
        billing_stage="script",
    )

    task = next(
        item
        for item in credit_mod.list_display_ledger(uid, 20)
        if item.get("business_task_id") == "video-context"
    )
    assert task["delta"] == -20
    assert task["breakdown"] == [
        {"stage": "script", "label": "口播文案", "amount": 20}
    ]


def test_consume_rejects_invalid_business_task_context(tmp_db):
    auth_mod, _, uid = tmp_db
    with pytest.raises(HTTPException) as exc:
        auth_mod.consume_with_idempotency(
            user_id=uid,
            scene="dh_v2_plan_script",
            ref_id="invalid-context",
            business_task_id="video-1",
            business_type="not-supported",
            billing_stage="script",
        )
    assert exc.value.status_code == 400


def test_consume_rejects_unknown_scene(tmp_db):
    auth_mod, _, uid = tmp_db
    with pytest.raises(HTTPException) as exc:
        auth_mod.consume_with_idempotency(user_id=uid, scene="hack_scene", ref_id="r2")
    assert exc.value.status_code == 400


def test_consume_requires_ref_id(tmp_db):
    auth_mod, _, uid = tmp_db
    with pytest.raises(HTTPException) as exc:
        auth_mod.consume_with_idempotency(user_id=uid, scene="ai_chat", ref_id="")
    assert exc.value.status_code == 400


def test_safe_refund_is_idempotent(tmp_db):
    auth_mod, credit_mod, uid = tmp_db
    auth_mod.consume_with_idempotency(user_id=uid, scene="ai_chat", ref_id="r-refund")
    after_consume = credit_mod.get_account(uid).balance
    auth_mod.safe_refund(user_id=uid, scene="ai_chat", ref_id="r-refund", reason="test")
    after_refund = credit_mod.get_account(uid).balance
    auth_mod.safe_refund(user_id=uid, scene="ai_chat", ref_id="r-refund", reason="test")
    after_refund2 = credit_mod.get_account(uid).balance
    assert after_refund - after_consume == 3
    assert after_refund == after_refund2, "重复退款应幂等"


def test_safe_refund_nets_against_the_original_business_task(tmp_db):
    auth_mod, credit_mod, uid = tmp_db
    auth_mod.consume_with_idempotency(
        user_id=uid,
        scene="dh_v2_plan_script",
        ref_id="video-refund:plan",
        business_task_id="video-refund",
        business_type="video_digital_human",
        billing_stage="script",
    )

    auth_mod.safe_refund(
        user_id=uid,
        scene="dh_v2_plan_script",
        ref_id="video-refund:plan",
        reason="plan failed",
    )

    task = next(
        item
        for item in credit_mod.list_display_ledger(uid, 20)
        if item.get("business_task_id") == "video-refund"
    )
    assert task["delta"] == 0


def test_assert_task_owner_blocks_other_user(tmp_db):
    auth_mod, _, uid = tmp_db
    from lib.auth import CurrentUser
    other = CurrentUser(id=uid + 100, email_masked="o**@x", login_name="other", nickname=None)
    with pytest.raises(HTTPException) as exc:
        auth_mod.assert_task_owner({"user_id": uid}, other, task_id="t1")
    assert exc.value.status_code == 403


def test_assert_task_owner_allows_owner(tmp_db):
    auth_mod, _, uid = tmp_db
    from lib.auth import CurrentUser
    owner = CurrentUser(id=uid, email_masked="a**@x", login_name="tester", nickname=None)
    auth_mod.assert_task_owner({"user_id": uid}, owner, task_id="t1")


def test_assert_task_owner_rejects_missing_owner(tmp_db):
    auth_mod, _, uid = tmp_db
    from lib.auth import CurrentUser
    user = CurrentUser(id=uid, email_masked="a**@x", login_name="tester", nickname=None)
    with pytest.raises(HTTPException) as exc:
        auth_mod.assert_task_owner({}, user, task_id="t1")
    assert exc.value.status_code == 403


def test_consume_voice_clone_costs_10(tmp_db):
    auth_mod, credit_mod, uid = tmp_db
    bal = auth_mod.consume_voice_clone(user_id=uid, ref_id="vc-1")
    assert bal == 10000 - 10
    assert credit_mod.get_account(uid).balance == 9990


def test_consume_voice_clone_idempotent(tmp_db):
    auth_mod, _, uid = tmp_db
    bal1 = auth_mod.consume_voice_clone(user_id=uid, ref_id="vc-dup")
    bal2 = auth_mod.consume_voice_clone(user_id=uid, ref_id="vc-dup")
    assert bal1 == bal2


def test_consume_video_creation_segments_variable_cost(tmp_db):
    auth_mod, credit_mod, uid = tmp_db
    bal = auth_mod.consume_video_creation_segments(
        user_id=uid, ref_id="vg-1:video", segment_count=3
    )
    assert bal == 10000 - 750
    assert credit_mod.get_account(uid).balance == 9250


def test_consume_video_creation_segments_idempotent(tmp_db):
    auth_mod, _, uid = tmp_db
    bal1 = auth_mod.consume_video_creation_segments(
        user_id=uid, ref_id="vg-dup:video", segment_count=2
    )
    bal2 = auth_mod.consume_video_creation_segments(
        user_id=uid, ref_id="vg-dup:video", segment_count=2
    )
    assert bal1 == bal2


def test_consume_with_idempotency_rejects_invalid_variable_cost(tmp_db):
    auth_mod, _, uid = tmp_db
    with pytest.raises(HTTPException) as exc:
        auth_mod.consume_with_idempotency(
            user_id=uid,
            scene="video_creation",
            ref_id="bad-cost",
            cost=251,
        )
    assert exc.value.status_code == 400


def test_geo_scenes_in_cost_table(tmp_db):
    auth_mod, _, uid = tmp_db
    for scene in (
        "geo_matrix_gen",
        "geo_skill_gen",
        "geo_research",
        "geo_authority_link",
        "dh_v2_plan_script",
        "dh_v2_video_retry",
        "dh_economy_video_segment",
        "dh_economy_video_retry",
        "promo_storyboard",
        "copy_extract",
        "video_image_to_video",
        "video_mashup",
    ):
        assert scene in auth_mod.SCENE_COST_TABLE
        bal = auth_mod.consume_with_idempotency(user_id=uid, scene=scene, ref_id=f"test-{scene}")
        assert bal < 10000


def test_consume_dh_v2_video_segments_variable_cost(tmp_db):
    auth_mod, credit_mod, uid = tmp_db
    bal = auth_mod.consume_dh_v2_video_segments(
        user_id=uid, ref_id="dhv2-1:video", segment_count=2
    )
    assert bal == 10000 - 900
    assert credit_mod.get_account(uid).balance == 9100


def test_consume_dh_v2_video_segments_idempotent(tmp_db):
    auth_mod, _, uid = tmp_db
    bal1 = auth_mod.consume_dh_v2_video_segments(
        user_id=uid, ref_id="dhv2-dup:video", segment_count=1
    )
    bal2 = auth_mod.consume_dh_v2_video_segments(
        user_id=uid, ref_id="dhv2-dup:video", segment_count=1
    )
    assert bal1 == bal2


def test_consume_dh_v2_video_segments_rejects_invalid_cost(tmp_db):
    auth_mod, _, uid = tmp_db
    with pytest.raises(HTTPException) as exc:
        auth_mod.consume_with_idempotency(
            user_id=uid,
            scene="dh_v2_video_segment",
            ref_id="bad-dhv2",
            cost=451,
        )
    assert exc.value.status_code == 400


def test_consume_economy_video_billing_is_idempotent(tmp_db):
    auth_mod, credit_mod, uid = tmp_db
    before = credit_mod.get_account(uid).balance

    first = auth_mod.consume_billing_event(
        user_id=uid,
        billing_key="video.dh_economy_segment",
        params={"duration_seconds": 36.0, "segment_count": 2},
        ref_id="economy-1:video",
    )
    second = auth_mod.consume_billing_event(
        user_id=uid,
        billing_key="video.dh_economy_segment",
        params={"duration_seconds": 36.0, "segment_count": 2},
        ref_id="economy-1:video",
    )

    assert first == second
    assert first[1:] == (500, "dh_economy_video_segment")
    assert credit_mod.get_account(uid).balance == before - 500


def test_hybrid_economy_billing_forwards_dynamic_params_to_cloud(tmp_db):
    auth_mod, _, uid = tmp_db
    request = SimpleNamespace(cookies={"session_id": "test-session"})

    with (
        patch("lib.cloud_client.is_cloud_hybrid_mode", return_value=True),
        patch("lib.request_context.get_current_request", return_value=request),
        patch(
            "lib.cloud_client.consume_billing_remote",
            create=True,
            return_value=(9000, 1000, "dh_economy_video_segment"),
        ) as remote_consume,
        patch.object(auth_mod, "consume_with_idempotency") as legacy_consume,
    ):
        result = auth_mod.consume_billing_event(
            user_id=uid,
            billing_key="video.dh_economy_segment",
            params={"duration_seconds": 61.0, "segment_count": 4},
            ref_id="economy-hybrid-61s:video",
            business_task_id="economy-hybrid-61s",
            business_type="dh-video-economy",
            billing_stage="video",
        )

    assert result == (9000, 1000, "dh_economy_video_segment")
    remote_consume.assert_called_once_with(
        request,
        billing_key="video.dh_economy_segment",
        params={"duration_seconds": 61.0, "segment_count": 4},
        ref_id="economy-hybrid-61s:video",
        business_task_id="economy-hybrid-61s",
        business_type="dh-video-economy",
        billing_stage="video",
    )
    legacy_consume.assert_not_called()

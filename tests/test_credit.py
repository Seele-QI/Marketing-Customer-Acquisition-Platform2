import os
import secrets
import threading

from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt-do-not-use-in-prod"
os.environ["CREDIT_REGISTER_BONUS"] = "100"

from lib import auth, credit  # noqa: E402


def _make_user(email="default@test.com"):
    h = auth.hash_email(email)
    return auth.get_or_create_user_by_hash(h, auth.mask_email(email))


def test_register_bonus_100():
    uid = _make_user("a@b.com")
    assert credit.get_account(uid).balance == 100


def test_consume_decrements_balance():
    uid = _make_user("c@d.com")
    after = credit.consume(uid, 30, ref_id="t")
    assert after == 70
    assert credit.get_account(uid).balance == 70


def test_consume_insufficient_raises_402():
    from fastapi import HTTPException
    uid = _make_user("e@f.com")
    raised = False
    try:
        credit.consume(uid, 9999)
    except HTTPException as e:
        assert e.status_code == 402
        assert e.detail["code"] == "INSUFFICIENT_CREDIT"
        raised = True
    assert raised


def test_refund_increments_balance():
    uid = _make_user("g@h.com")
    credit.consume(uid, 50)
    credit.refund(uid, 50, ref_id="t")
    assert credit.get_account(uid).balance == 100


def test_recompute_balance_matches():
    uid = _make_user("i@j.com")
    credit.consume(uid, 20)
    credit.refund(uid, 10)
    assert credit.recompute_balance(uid) == credit.get_account(uid).balance


def test_ledger_contains_bonus_and_consume():
    uid = _make_user("k@l.com")
    credit.consume(uid, 10)
    items = credit.list_ledger(uid, 10)
    types = {i["type"] for i in items}
    assert "register_bonus" in types
    assert "consume" in types


def test_display_ledger_groups_business_task_and_hides_small_calls():
    uid = _make_user("business-ledger@test.com")
    credit.admin_adjust_balance(uid, 2000, note="test funds")
    credit.consume(
        uid,
        20,
        ref_id="video-1:plan",
        note="口播文案",
        business_task_id="video-1",
        business_type="video_digital_human",
        billing_stage="script",
    )
    credit.consume(
        uid,
        10,
        ref_id="video-1:clone",
        note="音色克隆",
        business_task_id="video-1",
        business_type="video_digital_human",
        billing_stage="voice_clone",
    )
    credit.consume(
        uid,
        900,
        ref_id="video-1:segments",
        note="视频生成",
        business_task_id="video-1",
        business_type="video_digital_human",
        billing_stage="video_generation",
    )
    credit.consume(uid, 3, ref_id="chat-hidden", note="单次大模型聊天")

    items = credit.list_display_ledger(uid, 20)
    task_items = [item for item in items if item["entry_kind"] == "business_task"]

    assert len(task_items) == 1
    assert task_items[0]["business_task_id"] == "video-1"
    assert task_items[0]["type"] == "business_task"
    assert task_items[0]["delta"] == -930
    assert task_items[0]["note"] == "口播文案 20 + 音色克隆 10 + 视频生成 900，共 930 积分"
    assert task_items[0]["breakdown"] == [
        {"stage": "script", "label": "口播文案", "amount": 20},
        {"stage": "voice_clone", "label": "音色克隆", "amount": 10},
        {"stage": "video_generation", "label": "视频生成", "amount": 900},
    ]
    assert all(item.get("ref_id") != "chat-hidden" for item in items)


def test_display_ledger_keeps_business_tasks_separate_and_visible_credits():
    uid = _make_user("business-separate@test.com")
    credit.admin_adjust_balance(uid, 100, note="visible adjustment")
    for task_id in ("geo-1", "geo-2"):
        credit.consume(
            uid,
            25,
            ref_id=f"{task_id}:generation",
            note="内容生成",
            business_task_id=task_id,
            business_type="geo_matrix",
            billing_stage="llm_generation",
        )

    items = credit.list_display_ledger(uid, 20)

    assert {item.get("business_task_id") for item in items if item["entry_kind"] == "business_task"} == {
        "geo-1",
        "geo-2",
    }
    assert any(item["type"] == credit.TYPE_ADMIN_ADJUST for item in items)
    assert any(item["type"] == credit.TYPE_REGISTER_BONUS for item in items)


def test_display_ledger_does_not_lose_early_task_stages_behind_hidden_calls():
    uid = _make_user("business-deep-history@test.com")
    credit.admin_adjust_balance(uid, 5000, note="test funds")
    credit.consume(
        uid,
        20,
        ref_id="deep-video:plan",
        note="口播文案",
        business_task_id="deep-video",
        business_type="video_digital_human",
        billing_stage="script",
    )
    for index in range(2005):
        credit.consume(uid, 1, ref_id=f"hidden-chat:{index}", note="模型调用")
    credit.consume(
        uid,
        900,
        ref_id="deep-video:segments",
        note="视频生成",
        business_task_id="deep-video",
        business_type="video_digital_human",
        billing_stage="video_generation",
    )

    task = next(
        item
        for item in credit.list_display_ledger(uid, 20)
        if item.get("business_task_id") == "deep-video"
    )

    assert task["delta"] == -920
    assert [part["stage"] for part in task["breakdown"]] == ["script", "video_generation"]


def test_consume_zero_or_negative_raises():
    uid = _make_user("m@n.com")
    for bad in (0, -5):
        raised = False
        try:
            credit.consume(uid, bad)
        except Exception:
            raised = True
        assert raised, f"cost={bad} should raise"


def test_concurrent_consume_never_negative():
    uid = _make_user("o@p.com")
    initial = credit.get_account(uid).balance
    errors = []

    def worker():
        try:
            credit.consume(uid, 80)
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=worker) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    final = credit.get_account(uid).balance
    assert final >= 0
    assert initial - final == 80 or len(errors) == 1


def test_admin_list_users_and_adjust():
    uid = _make_user("admin-test@x.com")
    result = credit.admin_list_users(page=1, limit=100)
    assert result["total"] >= 1
    item = next(i for i in result["items"] if i["id"] == uid)
    assert item["balance"] == 100
    assert item["password"] == "—"

    new_balance = credit.admin_adjust_balance(uid, 50, note="test bonus")
    assert new_balance == 150
    assert credit.get_account(uid).balance == 150

    ledger = credit.list_ledger(uid, 5)
    assert any(i["type"] == credit.TYPE_ADMIN_ADJUST for i in ledger)

    from fastapi import HTTPException
    raised = False
    try:
        credit.admin_adjust_balance(uid, -9999, note="too much")
    except HTTPException as e:
        assert e.status_code == 402
        raised = True
    assert raised


def test_admin_create_user_lists_password():
    login_name = f"admin_create_{secrets.token_hex(4)}"
    password = "Password123"
    created = credit.admin_create_user(login_name, password)
    assert created["login_name"] == login_name
    assert created["password"] == password
    assert created["balance"] == 100

    listed = credit.admin_list_users(page=1, limit=100, search=login_name)
    item = next(i for i in listed["items"] if i["id"] == created["id"])
    assert item["password"] == password

    try:
        credit.admin_create_user(login_name, password)
        assert False, "should raise"
    except ValueError as e:
        assert "账号已存在" in str(e)

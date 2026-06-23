import os
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
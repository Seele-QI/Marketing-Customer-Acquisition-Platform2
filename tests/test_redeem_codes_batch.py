"""兑换码按批次查询。"""
import os

import pytest

import lib.db
from tests.conftest import setup_test_db


@pytest.fixture(autouse=True)
def _sync_test_db():
    if not os.getenv("CREDIT_DB_OVERRIDE"):
        setup_test_db()
    lib.db.DB_PATH = os.environ["CREDIT_DB_OVERRIDE"]
    os.environ.setdefault("EMAIL_HASH_SALT", "test-salt")


from lib.credit import generate_redeem_codes, list_redeem_codes_by_batch, redeem_code  # noqa: E402
from lib import auth  # noqa: E402


def test_list_redeem_codes_by_batch_returns_formatted_codes():
    items = generate_redeem_codes(5000, 3, note="batch-test")
    assert len(items) == 3
    batch_id = items[0]["batch_id"]

    listed = list_redeem_codes_by_batch(batch_id)
    assert len(listed) == 3
    assert all("-" in row["code"] for row in listed)
    assert all(row["batch_id"] == batch_id for row in listed)
    assert all(row["status"] == "active" for row in listed)


def test_list_redeem_codes_by_batch_shows_redeemed_status():
    items = generate_redeem_codes(8000, 1, note="redeem-status")
    batch_id = items[0]["batch_id"]
    code = items[0]["code"]

    user_id = auth.create_password_user("redeem_batch_user", "Password123")
    redeem_code(user_id, code)

    listed = list_redeem_codes_by_batch(batch_id)
    assert len(listed) == 1
    assert listed[0]["status"] == "redeemed"
    assert listed[0]["redeemed_at"] is not None


def test_list_redeem_codes_by_batch_empty_for_unknown():
    assert list_redeem_codes_by_batch("") == []
    assert list_redeem_codes_by_batch("nonexistent_batch") == []

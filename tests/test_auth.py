import os
import sys

# 必须在 import lib 之前设好环境变量
from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt"
os.environ["CREDIT_REGISTER_BONUS"] = "100"
os.environ["CREDIT_EMAIL_TOKEN_TTL_SECONDS"] = "900"

from lib import auth  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
import main as main_module  # noqa: E402


client = TestClient(main_module.app)


def test_hash_email_deterministic():
    assert auth.hash_email("a@b.com") == auth.hash_email("a@b.com")


def test_hash_email_case_insensitive():
    assert auth.hash_email("Alice@Example.com") == auth.hash_email("alice@example.com")


def test_hash_email_64_hex():
    h = auth.hash_email("x@y.com")
    assert len(h) == 64
    int(h, 16)  # must parse


def test_mask_email_standard():
    assert auth.mask_email("alice@example.com") == "a**e@example.com"


def test_mask_email_short_local():
    assert auth.mask_email("ab@gmail.com") == "a*@gmail.com"


def test_mask_email_no_at():
    assert auth.mask_email("not-an-email") == "***"


def test_token_roundtrip():
    tok = auth.generate_token()
    assert len(tok) >= 32  # base64url of 32 bytes
    auth.save_email_token("alice@example.com", tok)
    info = auth.consume_email_token(tok)
    assert info is not None
    assert info["email_hash"] == auth.hash_email("alice@example.com")
    assert info["email_masked"] == "a**e@example.com"


def test_token_single_use():
    tok = auth.generate_token()
    auth.save_email_token("alice@example.com", tok)
    assert auth.consume_email_token(tok) is not None
    assert auth.consume_email_token(tok) is None


def test_token_invalid_returns_none():
    auth.save_email_token("alice@example.com", auth.generate_token())
    assert auth.consume_email_token("nonexistent-token") is None


def test_token_expired_returns_none():
    os.environ["CREDIT_EMAIL_TOKEN_TTL_SECONDS"] = "0"  # expired immediately
    # Note: env var read at module import; we need to set before save
    # This test is best-effort; rely on DB query for expires_at
    import importlib
    importlib.reload(auth)
    tok = auth.generate_token()
    auth.save_email_token("alice@example.com", tok)
    assert auth.consume_email_token(tok) is None
    # restore
    os.environ["CREDIT_EMAIL_TOKEN_TTL_SECONDS"] = "900"


def test_get_or_create_user_idempotent():
    a = auth.get_or_create_user_by_hash(auth.hash_email("x@y.com"), "x**@y.com")
    b = auth.get_or_create_user_by_hash(auth.hash_email("x@y.com"), "x**@y.com")
    assert a == b


def test_get_or_create_user_registers_bonus():
    from lib.credit import get_account
    uid = auth.get_or_create_user_by_hash(auth.hash_email("new@user.com"), "n**w@user.com")
    assert get_account(uid).balance == 100


def test_session_create_and_destroy():
    import time
    from lib.db import connect
    uid = auth.get_or_create_user_by_hash(auth.hash_email("sess@x.com"), "s**s@x.com")
    ua, ip = "ua", "1.2.3.4"
    sid = auth.create_session(uid, ua, ip)
    # check session row
    conn = connect()
    try:
        row = conn.execute("SELECT user_id FROM sessions WHERE id = ?", (sid,)).fetchone()
        assert row["user_id"] == uid
    finally:
        conn.close()
    auth.destroy_session(sid)
    conn = connect()
    try:
        row = conn.execute("SELECT id FROM sessions WHERE id = ?", (sid,)).fetchone()
        assert row is None
    finally:
        conn.close()


def test_password_register_returns_email_masked_and_bonus_balance():
    resp = client.post(
        "/api/auth/register",
        json={
            "login_name": "alice_test",
            "password": "Password123",
            "confirm_password": "Password123",
        },
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["user"]["login_name"] == "alice_test"
    assert data["user"]["email_masked"] == "alice_test"
    assert data["balance"] == 100


def test_password_login_returns_email_masked_and_balance():
    created_user_id = auth.create_password_user("bob_test", "Password123")

    resp = client.post(
        "/api/auth/login",
        json={
            "login_name": "bob_test",
            "password": "Password123",
        },
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["user"]["id"] == created_user_id
    assert data["user"]["login_name"] == "bob_test"
    assert data["user"]["email_masked"] == "bob_test"
    assert data["balance"] == 100


def test_credit_consume_ai_chat_always_costs_3_points():
    client.post(
        "/api/auth/register",
        json={
            "login_name": "chat_cost_user",
            "password": "Password123",
            "confirm_password": "Password123",
        },
    )

    resp = client.post(
        "/api/credit/consume",
        json={
            "scene": "ai_chat",
            "cost": 1,
            "ref_id": "chat-1",
            "note": "chat-1",
        },
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["scene"] == "ai_chat"
    assert data["cost"] == 3
    assert data["balance"] == 97


def test_credit_consume_video_creation_always_costs_500_points():
    from lib.credit import refund

    user_id = auth.create_password_user("video_cost_user", "Password123")
    refund(user_id, 1000, ref_id="topup", note="test topup")

    login_resp = client.post(
        "/api/auth/login",
        json={
            "login_name": "video_cost_user",
            "password": "Password123",
        },
    )
    assert login_resp.status_code == 200, login_resp.text

    resp = client.post(
        "/api/credit/consume",
        json={
            "scene": "video_creation",
            "cost": 1,
            "ref_id": "video-1",
            "note": "video-1",
        },
    )

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["scene"] == "video_creation"
    assert data["cost"] == 500
    assert data["balance"] == 600

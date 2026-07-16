"""云端混合模式：本地用户影子行 + 矩阵项目 FK。"""
import os

from tests.conftest import setup_test_db

setup_test_db()
os.environ["EMAIL_HASH_SALT"] = "test-salt-do-not-use-in-prod"

from fastapi import HTTPException  # noqa: E402

from lib.auth import CurrentUser  # noqa: E402
from lib.db import connect  # noqa: E402
from lib.geo_matrix_store import create_project  # noqa: E402
from lib.local_user_shadow import ensure_local_user_shadow  # noqa: E402


def _cloud_user(uid: int = 900001) -> CurrentUser:
    return CurrentUser(
        id=uid,
        email_masked="u***@cloud.test",
        login_name=f"cloud_login_{uid}",
        nickname="云端用户",
    )


def test_ensure_local_user_shadow_creates_and_is_idempotent():
    user = _cloud_user(900101)
    ensure_local_user_shadow(user)
    ensure_local_user_shadow(user)  # 幂等

    conn = connect()
    try:
        row = conn.execute("SELECT id, email_hash, login_name FROM users WHERE id = ?", (900101,)).fetchone()
        assert row is not None
        assert row["id"] == 900101
        assert str(row["email_hash"]).startswith("cloud:900101")
    finally:
        conn.close()


def test_create_project_after_shadow_succeeds():
    user = _cloud_user(900202)
    ensure_local_user_shadow(user)
    project = create_project(user_id=user.id, name="混合模式矩阵")
    assert project["name"] == "混合模式矩阵"
    assert project["userId"] == user.id


def test_create_project_without_shadow_returns_json_error():
    missing_uid = 900303
    conn = connect()
    try:
        assert conn.execute("SELECT 1 FROM users WHERE id = ?", (missing_uid,)).fetchone() is None
    finally:
        conn.close()

    try:
        create_project(user_id=missing_uid, name="应失败")
        raise AssertionError("expected HTTPException")
    except HTTPException as e:
        assert e.status_code == 500
        assert isinstance(e.detail, dict)
        assert e.detail.get("code") == "LOCAL_USER_MISSING"


def test_cloud_auth_httpx_ignores_system_proxy(monkeypatch):
    """桌面混合模式鉴权不得走 Windows 系统代理（代理关闭时会 10061 → 误报未登录）。"""
    os.environ["CLOUD_API_URL"] = "https://cloud.test"
    captured: dict = {}

    class _Resp:
        status_code = 200

        def json(self):
            return {
                "user": {
                    "id": 900404,
                    "email_masked": "x***@t.com",
                    "login_name": "u900404",
                    "nickname": None,
                }
            }

    class _Client:
        def __init__(self, *args, **kwargs):
            captured.update(kwargs)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, *args, **kwargs):
            return _Resp()

    monkeypatch.setattr("httpx.Client", _Client)
    monkeypatch.setattr(
        "lib.local_user_shadow.ensure_local_user_shadow",
        lambda user: None,
    )

    from lib.cloud_client import get_current_user_remote

    class _Req:
        cookies = {"session_id": "sid-test"}

    user = get_current_user_remote(_Req())
    assert user is not None
    assert user.id == 900404
    assert captured.get("trust_env") is False


def test_cloud_auth_me_uses_short_ttl_cache(monkeypatch):
    """同一 session 短时间内二次鉴权应命中缓存，避免重复打云端 /me。"""
    os.environ["CLOUD_API_URL"] = "https://cloud.test"
    call_count = {"n": 0}

    class _Resp:
        status_code = 200

        def json(self):
            return {
                "user": {
                    "id": 900505,
                    "email_masked": "c***@t.com",
                    "login_name": "u900505",
                    "nickname": None,
                }
            }

    class _Client:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def get(self, *args, **kwargs):
            call_count["n"] += 1
            return _Resp()

    monkeypatch.setattr("httpx.Client", _Client)
    monkeypatch.setattr(
        "lib.local_user_shadow.ensure_local_user_shadow",
        lambda user: None,
    )

    from lib.cloud_client import get_current_user_remote, invalidate_remote_auth_cache

    invalidate_remote_auth_cache()

    class _Req:
        cookies = {"session_id": "sid-cache-test"}

    u1 = get_current_user_remote(_Req())
    u2 = get_current_user_remote(_Req())
    assert u1 is not None and u2 is not None
    assert u1.id == u2.id == 900505
    assert call_count["n"] == 1

    invalidate_remote_auth_cache("sid-cache-test")
    u3 = get_current_user_remote(_Req())
    assert u3 is not None
    assert call_count["n"] == 2

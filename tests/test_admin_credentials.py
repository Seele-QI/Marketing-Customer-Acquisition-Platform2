"""管理员账号密码校验。"""
import os

import pytest

from lib import auth


@pytest.fixture(autouse=True)
def _admin_env(monkeypatch):
    digest, salt = auth.hash_password("lm654743559")
    monkeypatch.setenv("ADMIN_LOGIN_NAME", "18000634365")
    monkeypatch.setenv("ADMIN_PASSWORD_HASH", digest)
    monkeypatch.setenv("ADMIN_PASSWORD_SALT", salt)
    monkeypatch.setattr(auth, "ADMIN_LOGIN_NAME", "18000634365")
    monkeypatch.setattr(auth, "ADMIN_PASSWORD_HASH", digest)
    monkeypatch.setattr(auth, "ADMIN_PASSWORD_SALT", salt)


def test_verify_admin_login_success():
    assert auth.verify_admin_login("18000634365", "lm654743559") is True
    assert auth.verify_admin_login(" 18000634365 ", "lm654743559") is True


def test_verify_admin_login_wrong_password():
    assert auth.verify_admin_login("18000634365", "wrong-password") is False


def test_verify_admin_login_wrong_account():
    assert auth.verify_admin_login("99999999999", "lm654743559") is False


def test_verify_admin_login_missing_env(monkeypatch):
    monkeypatch.setattr(auth, "ADMIN_PASSWORD_HASH", "")
    assert auth.verify_admin_login("18000634365", "lm654743559") is False

"""验证 lib/rate_limit.py 的 IP/邮箱限频真正落地。

历史回归点：check_ip 曾因查错表而永远返回 True；本测试守护该回归。
"""
import os
import tempfile

import pytest


@pytest.fixture()
def tmp_db(monkeypatch):
    """每个测试用独立 sqlite 文件，避免污染生产 DB。"""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    monkeypatch.setenv("CREDIT_DB_OVERRIDE", path)

    import importlib

    import lib.db as db_mod

    importlib.reload(db_mod)
    import lib.rate_limit as rl_mod

    importlib.reload(rl_mod)
    rl_mod._ensure_schema()
    yield rl_mod
    try:
        os.unlink(path)
    except OSError:
        pass


def test_check_ip_passes_initially(tmp_db):
    ok, _ = tmp_db.check_ip("1.2.3.4")
    assert ok is True


def test_check_ip_blocks_after_threshold(tmp_db):
    ip = "10.20.30.40"
    for _ in range(10):
        tmp_db.record("ip", ip)
    ok, msg = tmp_db.check_ip(ip)
    assert ok is False
    assert "频繁" in msg


def test_check_email_blocks_after_threshold(tmp_db):
    h = "hash_abc_def"
    tmp_db.record("email", h)
    ok, msg = tmp_db.check_email(h)
    assert ok is False, f"应当因 1 分钟内 1 次上限被拒，实际通过: {msg}"


def test_record_isolated_by_scope(tmp_db):
    for _ in range(10):
        tmp_db.record("ip", "9.9.9.9")
    ok_email, _ = tmp_db.check_email("9.9.9.9")
    assert ok_email is True, "scope 隔离失效：IP 计数串到了 email scope"


def test_empty_key_is_noop(tmp_db):
    tmp_db.record("ip", "")
    ok, _ = tmp_db.check_ip("")
    assert ok is True

"""共享测试夹具：建临时数据库、加载 schema。"""
import os
import sqlite3
import sys
import tempfile

import pytest

# 必须在任何测试模块 import lib.auth 之前设置（auth 模块加载时校验）
os.environ.setdefault("EMAIL_HASH_SALT", "0" * 64)


@pytest.fixture(autouse=True)
def _force_local_auth_and_credit(monkeypatch):
    """单测强制本地 SQLite 会话/积分；避免 .env 中 CLOUD_API_URL 导致走云端委托。"""
    monkeypatch.setenv("CLOUD_API_URL", "")


def setup_test_db() -> str:
    """创建临时 SQLite，调用 init_credit_db.migrate() 建表，返回路径。"""
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    os.environ["CREDIT_DB_OVERRIDE"] = tmp.name
    sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
    from scripts.init_credit_db import migrate
    conn = sqlite3.connect(tmp.name)
    try:
        migrate(conn)
        conn.commit()
    finally:
        conn.close()
    return tmp.name
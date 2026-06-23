"""共享测试夹具：建临时数据库、加载 schema。"""
import os
import sqlite3
import sys
import tempfile


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
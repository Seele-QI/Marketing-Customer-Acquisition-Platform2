"""SQLite 连接与事务辅助。所有积分写入必须走 transaction()。"""
import os
import sqlite3
from contextlib import contextmanager
from typing import Iterator

_OVERRIDE = os.getenv("CREDIT_DB_OVERRIDE", "").strip()
DB_PATH = (
    _OVERRIDE
    if _OVERRIDE
    else os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "accounts.db")
)


def connect() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=10, isolation_level=None)
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA foreign_keys = ON")
    conn.row_factory = sqlite3.Row
    return conn


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    """BEGIN IMMEDIATE 事务；遇异常自动 ROLLBACK。"""
    conn = connect()
    try:
        conn.execute("BEGIN IMMEDIATE")
        yield conn
        conn.execute("COMMIT")
    except Exception:
        conn.execute("ROLLBACK")
        raise
    finally:
        conn.close()

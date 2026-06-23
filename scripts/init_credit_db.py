"""幂等地初始化 / 迁移积分系统 schema。"""
import os
import sqlite3
import sys

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "accounts.db")


def _column_exists(conn, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(r[1] == column for r in rows)


def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    return row is not None


def migrate(conn: sqlite3.Connection) -> None:
    # users: 全新 / 旧 phone schema / email 已迁移 三种状态
    if not _table_exists(conn, "users"):
        conn.executescript("""
            CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email_hash TEXT UNIQUE NOT NULL,
                email_masked TEXT NOT NULL,
                login_name TEXT UNIQUE NOT NULL DEFAULT '',
                password_hash TEXT NOT NULL DEFAULT '',
                password_salt TEXT NOT NULL DEFAULT '',
                nickname TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL
            );
        """)
    elif _column_exists(conn, "users", "phone_hash"):
        conn.execute("ALTER TABLE users RENAME COLUMN phone_hash TO email_hash")
        conn.execute("ALTER TABLE users RENAME COLUMN phone_masked TO email_masked")
    if not _column_exists(conn, "users", "login_name"):
        conn.execute("ALTER TABLE users ADD COLUMN login_name TEXT NOT NULL DEFAULT ''")
    if not _column_exists(conn, "users", "password_hash"):
        conn.execute("ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''")
    if not _column_exists(conn, "users", "password_salt"):
        conn.execute("ALTER TABLE users ADD COLUMN password_salt TEXT NOT NULL DEFAULT ''")

    # sessions / credit_accounts / credit_ledger: 不变（幂等）
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL,
            last_active_at INTEGER NOT NULL,
            user_agent TEXT,
            ip_first TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            login_name TEXT NOT NULL,
            ip TEXT NOT NULL DEFAULT '',
            success INTEGER NOT NULL DEFAULT 0,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_login_attempts_name_time ON login_attempts(login_name, created_at);
        CREATE INDEX IF NOT EXISTS idx_login_attempts_ip_time ON login_attempts(ip, created_at);

        CREATE TABLE IF NOT EXISTS credit_accounts (
            user_id INTEGER PRIMARY KEY REFERENCES users(id),
            balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
            total_recharged INTEGER NOT NULL DEFAULT 0,
            total_bonus INTEGER NOT NULL DEFAULT 0,
            total_consumed INTEGER NOT NULL DEFAULT 0,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS credit_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id),
            type TEXT NOT NULL,
            delta INTEGER NOT NULL,
            balance_after INTEGER NOT NULL,
            ref_id TEXT,
            note TEXT,
            created_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ledger_user_time ON credit_ledger(user_id, created_at);

        CREATE TABLE IF NOT EXISTS credit_redeem_codes (
            code TEXT PRIMARY KEY,
            amount INTEGER NOT NULL CHECK (amount > 0),
            status TEXT NOT NULL DEFAULT 'active',
            batch_id TEXT NOT NULL DEFAULT '',
            note TEXT NOT NULL DEFAULT '',
            created_by_user_id INTEGER REFERENCES users(id),
            redeemed_by_user_id INTEGER REFERENCES users(id),
            created_at INTEGER NOT NULL,
            redeemed_at INTEGER
        );
        CREATE INDEX IF NOT EXISTS idx_redeem_codes_status_amount ON credit_redeem_codes(status, amount);
        CREATE INDEX IF NOT EXISTS idx_redeem_codes_batch ON credit_redeem_codes(batch_id);
    """)

    # email_tokens: 处理 sms_codes 迁移 / 新建
    if _table_exists(conn, "sms_codes"):
        # 先删旧索引（重命名表后旧索引的列引用会失效）
        conn.execute("DROP INDEX IF EXISTS idx_sms_codes_phone")
        conn.execute("ALTER TABLE sms_codes RENAME TO email_tokens")
    # 处理 email_tokens 表：旧字段迁移 + 列补齐
    if _table_exists(conn, "email_tokens"):
        if _column_exists(conn, "email_tokens", "phone_hash"):
            conn.execute("ALTER TABLE email_tokens RENAME COLUMN phone_hash TO email_hash")
        if _column_exists(conn, "email_tokens", "code_hash"):
            conn.execute("ALTER TABLE email_tokens DROP COLUMN code_hash")
        if _column_exists(conn, "email_tokens", "attempts"):
            conn.execute("ALTER TABLE email_tokens DROP COLUMN attempts")
        if not _column_exists(conn, "email_tokens", "token_hash"):
            conn.execute("ALTER TABLE email_tokens ADD COLUMN token_hash TEXT NOT NULL DEFAULT ''")
        if not _column_exists(conn, "email_tokens", "email_masked"):
            conn.execute("ALTER TABLE email_tokens ADD COLUMN email_masked TEXT NOT NULL DEFAULT ''")
        if not _column_exists(conn, "email_tokens", "used_at"):
            conn.execute("ALTER TABLE email_tokens ADD COLUMN used_at INTEGER")
        conn.execute("DROP INDEX IF EXISTS idx_sms_codes_phone")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_email_tokens_email ON email_tokens(email_hash, created_at)"
        )
    else:
        conn.executescript("""
            CREATE TABLE email_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email_hash TEXT NOT NULL,
                email_masked TEXT NOT NULL DEFAULT '',
                token_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                used_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS idx_email_tokens_email ON email_tokens(email_hash, created_at);
        """)


def main() -> int:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        migrate(conn)
        conn.commit()
    finally:
        conn.close()
    print(f"[ok] schema ensured at {DB_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
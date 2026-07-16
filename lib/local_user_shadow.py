"""云端混合模式下，为本地 SQLite FK 表幂等写入用户影子行。

积分账本仍走云端 consume_remote；此处只保证 users.id 存在，
以便 geo_matrix_projects 等 REFERENCES users(id) 的本地表可写入。
"""
from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

from lib.db import transaction

if TYPE_CHECKING:
    from lib.auth import CurrentUser

logger = logging.getLogger(__name__)


def ensure_local_user_shadow(user: "CurrentUser") -> None:
    """若本地 users 无该云端 user.id，则插入影子行（幂等）。"""
    uid = int(user.id)
    now_ms = int(time.time() * 1000)
    email_masked = (user.email_masked or "").strip() or f"cloud-user-{uid}"
    email_hash = f"cloud:{uid}"
    login_name = (user.login_name or "").strip() or f"cloud_{uid}"

    with transaction() as conn:
        row = conn.execute("SELECT id FROM users WHERE id = ?", (uid,)).fetchone()
        if row is not None:
            return

        # 避免与已有本地用户的 UNIQUE(email_hash / login_name) 冲突
        if conn.execute(
            "SELECT 1 FROM users WHERE email_hash = ?", (email_hash,)
        ).fetchone():
            email_hash = f"cloud:{uid}:{now_ms}"
        if conn.execute(
            "SELECT 1 FROM users WHERE login_name = ?", (login_name,)
        ).fetchone():
            login_name = f"cloud_{uid}_{now_ms}"

        conn.execute(
            """
            INSERT INTO users (
                id, email_hash, email_masked, login_name,
                password_hash, password_salt, nickname, status,
                created_at, last_seen_at
            ) VALUES (?, ?, ?, ?, '', '', ?, 'active', ?, ?)
            """,
            (
                uid,
                email_hash,
                email_masked,
                login_name,
                user.nickname,
                now_ms,
                now_ms,
            ),
        )
        logger.info("created local user shadow id=%s", uid)

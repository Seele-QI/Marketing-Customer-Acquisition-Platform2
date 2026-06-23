"""邮箱 Magic Link 登录：发链接、验证 token、用户创建、session 管理。"""
import hashlib
import hmac
import os
import secrets
import sys
import time
from dataclasses import dataclass
from typing import Optional


from lib.db import connect, transaction

ADMIN_SESSION_COOKIE = "admin_session_id"

EMAIL_HASH_SALT = os.getenv("EMAIL_HASH_SALT", "")
if not EMAIL_HASH_SALT:
    if os.getenv("DEV_EMAIL_MODE", "0") == "1" or "--reload" in sys.argv:
        EMAIL_HASH_SALT = "dev-email-hash-salt"
    else:
        raise RuntimeError("EMAIL_HASH_SALT env var is required")

REGISTER_BONUS = int(os.getenv("CREDIT_REGISTER_BONUS", "100"))
SESSION_TTL_DAYS = int(os.getenv("CREDIT_SESSION_TTL_DAYS", "30"))
EMAIL_TOKEN_TTL_S = int(os.getenv("CREDIT_EMAIL_TOKEN_TTL_SECONDS", "900"))

SESSION_COOKIE = "session_id"
ADMIN_LOGIN_NAME = os.getenv("ADMIN_LOGIN_NAME", "18000634365")
ADMIN_PASSWORD_HASH = os.getenv("ADMIN_PASSWORD_HASH", "")


def normalize_login_name(login_name: str) -> str:
    normalized = login_name.strip().lower()
    normalized = normalized.replace(" ", "")
    if not normalized:
        return ""
    return normalized


def validate_login_name(login_name: str) -> Optional[str]:
    if len(login_name) < 3:
        return "账号至少 3 位"
    if len(login_name) > 32:
        return "账号不能超过 32 位"
    if not all(ch.isalnum() or ch in "._-@" for ch in login_name):
        return "账号仅支持字母、数字和 . _ - @"
    return None


def validate_password(password: str) -> Optional[str]:
    if len(password) < 8:
        return "密码至少 8 位"
    if len(password) > 64:
        return "密码不能超过 64 位"
    return None


def hash_password(password: str, salt: str | None = None) -> tuple[str, str]:
    salt_value = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt_value.encode("utf-8"),
        210_000,
    )
    return digest.hex(), salt_value


def verify_password(password: str, password_hash: str, salt: str | None = None) -> bool:
    if not password_hash or not salt:
        return False
    digest, _ = hash_password(password, salt)
    return hmac.compare_digest(digest, password_hash)


def hash_email(email: str) -> str:
    return hashlib.sha256((EMAIL_HASH_SALT + email.lower().strip()).encode("utf-8")).hexdigest()


def mask_email(email: str) -> str:
    """f**@gmail.com 风格脱敏。"""
    email = email.strip()
    if "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    if not local:
        return "***@" + domain
    if len(local) <= 2:
        masked_local = local[0] + "*"
    else:
        masked_local = local[0] + "**" + local[-1]
    return masked_local + "@" + domain


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def generate_token() -> str:
    return secrets.token_urlsafe(32)


def save_email_token(email: str, token: str) -> None:
    email_h = hash_email(email)
    token_h = hash_token(token)
    masked = mask_email(email)
    now_ms = int(time.time() * 1000)
    expires = now_ms + EMAIL_TOKEN_TTL_S * 1000
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO email_tokens (email_hash, email_masked, token_hash, created_at, expires_at, used, used_at) VALUES (?, ?, ?, ?, ?, 0, NULL)",
            (email_h, masked, token_h, now_ms, expires),
        )
        conn.commit()
    finally:
        conn.close()


def consume_email_token(token: str) -> Optional[dict]:
    """校验 token。返回 {'email_hash': ..., 'email_masked': ...} 或 None。"""
    token_h = hash_token(token)
    now_ms = int(time.time() * 1000)
    conn = connect()
    try:
        row = conn.execute(
            """SELECT id, email_hash, email_masked FROM email_tokens
               WHERE token_hash = ? AND used = 0 AND expires_at > ?
               ORDER BY created_at DESC LIMIT 1""",
            (token_h, now_ms),
        ).fetchone()
        if not row:
            return None
        conn.execute(
            "UPDATE email_tokens SET used = 1, used_at = ? WHERE id = ?",
            (now_ms, row["id"]),
        )
        conn.commit()
        return {"email_hash": row["email_hash"], "email_masked": row["email_masked"]}
    finally:
        conn.close()


def get_or_create_user_by_hash(email_hash: str, email_masked: str) -> int:
    """通过 email_hash 创建或获取用户。email 明文不传进来——保持 hash 单向性。"""
    now_ms = int(time.time() * 1000)
    with transaction() as conn:
        row = conn.execute(
            "SELECT id FROM users WHERE email_hash = ?", (email_hash,)
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE users SET last_seen_at = ? WHERE id = ?", (now_ms, row["id"])
            )
            return int(row["id"])
        base_login_name = normalize_login_name(email_masked)
        login_name = base_login_name or f"user_{secrets.token_hex(4)}"
        cur = conn.execute(
            "INSERT INTO users (email_hash, email_masked, login_name, status, created_at, last_seen_at) VALUES (?, ?, ?, 'active', ?, ?)",
            (email_hash, email_masked, login_name, now_ms, now_ms),
        )
        user_id = int(cur.lastrowid)
        conn.execute(
            "INSERT INTO credit_accounts (user_id, balance, total_bonus, updated_at) VALUES (?, 0, 0, ?)",
            (user_id, now_ms),
        )
        conn.execute(
            "INSERT INTO credit_ledger (user_id, type, delta, balance_after, note, created_at) VALUES (?, 'register_bonus', ?, ?, '注册赠送', ?)",
            (user_id, REGISTER_BONUS, REGISTER_BONUS, now_ms),
        )
        conn.execute(
            "UPDATE credit_accounts SET balance = ?, total_bonus = ?, updated_at = ? WHERE user_id = ?",
            (REGISTER_BONUS, REGISTER_BONUS, now_ms, user_id),
        )
        return user_id


def create_session(user_id: int, user_agent: str, ip: str) -> str:
    sid = secrets.token_urlsafe(32)
    now_ms = int(time.time() * 1000)
    expires = now_ms + SESSION_TTL_DAYS * 86400 * 1000
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO sessions (id, user_id, created_at, expires_at, last_active_at, user_agent, ip_first) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (sid, user_id, now_ms, expires, now_ms, user_agent[:512] if user_agent else "", ip or ""),
        )
        conn.commit()
    finally:
        conn.close()
    return sid


def destroy_session(sid: str) -> None:
    conn = connect()
    try:
        conn.execute("DELETE FROM sessions WHERE id = ?", (sid,))
        conn.commit()
    finally:
        conn.close()


@dataclass
class CurrentUser:
    id: int
    email_masked: str
    login_name: str
    nickname: Optional[str]


def create_password_user(login_name: str, password: str) -> int:
    login_name_norm = normalize_login_name(login_name)
    if not login_name_norm:
        raise ValueError("账号不能为空")
    login_name_error = validate_login_name(login_name_norm)
    if login_name_error:
        raise ValueError(login_name_error)
    password_error = validate_password(password or "")
    if password_error:
        raise ValueError(password_error)
    password_hash, password_salt = hash_password(password)
    email_hash = hash_email(f"{login_name_norm}@local")
    now_ms = int(time.time() * 1000)
    with transaction() as conn:
        row = conn.execute("SELECT id FROM users WHERE login_name = ?", (login_name_norm,)).fetchone()
        if row:
            raise ValueError("账号已存在")
        cur = conn.execute(
            "INSERT INTO users (email_hash, email_masked, login_name, password_hash, password_salt, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, 'active', ?, ?)",
            (email_hash, login_name_norm, login_name_norm, password_hash, password_salt, now_ms, now_ms),
        )
        user_id = int(cur.lastrowid)
        conn.execute(
            "INSERT INTO credit_accounts (user_id, balance, total_bonus, updated_at) VALUES (?, 0, 0, ?)",
            (user_id, now_ms),
        )
        conn.execute(
            "INSERT INTO credit_ledger (user_id, type, delta, balance_after, note, created_at) VALUES (?, 'register_bonus', ?, ?, '账号注册赠送', ?)",
            (user_id, REGISTER_BONUS, REGISTER_BONUS, now_ms),
        )
        conn.execute(
            "UPDATE credit_accounts SET balance = ?, total_bonus = ?, updated_at = ? WHERE user_id = ?",
            (REGISTER_BONUS, REGISTER_BONUS, now_ms, user_id),
        )
        return user_id


def record_login_attempt(login_name: str, ip: str, success: bool) -> None:
    conn = connect()
    try:
        conn.execute(
            "INSERT INTO login_attempts (login_name, ip, success, created_at) VALUES (?, ?, ?, ?)",
            (normalize_login_name(login_name), ip or "", 1 if success else 0, int(time.time() * 1000)),
        )
        conn.commit()
    finally:
        conn.close()


def _login_rate_limited(login_name: str, ip: str) -> bool:
    now_ms = int(time.time() * 1000)
    since = now_ms - 10 * 60 * 1000
    conn = connect()
    try:
        total = conn.execute(
            "SELECT COUNT(*) FROM login_attempts WHERE created_at >= ? AND login_name = ? AND success = 0",
            (since, normalize_login_name(login_name)),
        ).fetchone()[0]
        by_ip = conn.execute(
            "SELECT COUNT(*) FROM login_attempts WHERE created_at >= ? AND ip = ? AND success = 0",
            (since, ip or ""),
        ).fetchone()[0]
        return int(total) >= 5 or int(by_ip) >= 10
    finally:
        conn.close()


def verify_password_login(login_name: str, password: str, ip: str = "") -> Optional[int]:
    login_name_norm = normalize_login_name(login_name)
    if _login_rate_limited(login_name_norm, ip):
        return None
    conn = connect()
    try:
        row = conn.execute(
            "SELECT id, password_hash, password_salt, status FROM users WHERE login_name = ?", (login_name_norm,)
        ).fetchone()
        if not row or row["status"] != "active":
            record_login_attempt(login_name_norm, ip, False)
            return None
        if not verify_password(password, row["password_hash"], row["password_salt"]):
            record_login_attempt(login_name_norm, ip, False)
            return None
        now_ms = int(time.time() * 1000)
        conn.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (now_ms, row["id"]))
        conn.commit()
        record_login_attempt(login_name_norm, ip, True)
        return int(row["id"])
    finally:
        conn.close()


def get_user_identity(user_id: int) -> Optional[dict]:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT id, email_masked, login_name FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            return None
        return {
            "id": int(row["id"]),
            "email_masked": row["email_masked"],
            "login_name": row["login_name"],
        }
    finally:
        conn.close()


def get_current_user(request) -> Optional[CurrentUser]:
    sid = request.cookies.get(SESSION_COOKIE)
    if not sid:
        return None
    now_ms = int(time.time() * 1000)
    conn = connect()
    try:
        row = conn.execute(
            """SELECT s.user_id, s.expires_at, u.email_masked, u.login_name, u.nickname, u.status
               FROM sessions s JOIN users u ON u.id = s.user_id
               WHERE s.id = ?""",
            (sid,),
        ).fetchone()
        if not row:
            return None
        if row["expires_at"] < now_ms or row["status"] != "active":
            return None
        new_expires = now_ms + SESSION_TTL_DAYS * 86400 * 1000
        conn.execute(
            "UPDATE sessions SET last_active_at = ?, expires_at = ? WHERE id = ?",
            (now_ms, new_expires, sid),
        )
        conn.commit()
        return CurrentUser(
            id=int(row["user_id"]),
            email_masked=row["email_masked"],
            login_name=row["login_name"],
            nickname=row["nickname"],
        )
    finally:
        conn.close()

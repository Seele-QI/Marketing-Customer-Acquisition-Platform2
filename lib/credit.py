"""积分核心：余额查询、扣费、退款、兑换码、对账。"""
import logging
import secrets
import string
import time
from dataclasses import dataclass

from fastapi import HTTPException

from lib.db import connect, transaction

TYPE_REGISTER_BONUS = "register_bonus"
TYPE_RECHARGE = "recharge"
TYPE_CONSUME = "consume"
TYPE_REFUND = "refund"
TYPE_ADMIN_ADJUST = "admin_adjust"
TYPE_REDEEM_CODE = "redeem_code"
VIDEO_CREATION_COST = 500
CHAT_COST = 3
REDEEM_CODE_AMOUNTS = (5000, 8000, 10000, 20000, 30000)
REDEEM_CODE_LENGTH = 16
DEFAULT_REDEEM_CODE_NOTE = "系统生成兑换码"
ADMIN_REDEEM_CODES_VISIBLE = False


class CreditError(HTTPException):
    def __init__(self, code: str, message: str, status: int = 400, **extra):
        super().__init__(status_code=status, detail={"code": code, "message": message, **extra})


def ensure_credit_schema() -> None:
    conn = connect()
    try:
        conn.executescript("""
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
        conn.commit()
    finally:
        conn.close()


@dataclass
class Account:
    user_id: int
    balance: int
    total_recharged: int
    total_bonus: int
    total_consumed: int


def get_account(user_id: int) -> Account:
    conn = connect()
    try:
        row = conn.execute(
            "SELECT user_id, balance, total_recharged, total_bonus, total_consumed FROM credit_accounts WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            return Account(user_id, 0, 0, 0, 0)
        return Account(
            user_id=int(row["user_id"]),
            balance=int(row["balance"]),
            total_recharged=int(row["total_recharged"]),
            total_bonus=int(row["total_bonus"]),
            total_consumed=int(row["total_consumed"]),
        )
    finally:
        conn.close()


def list_ledger(user_id: int, limit: int = 20) -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            """SELECT id, type, delta, balance_after, ref_id, note, created_at
               FROM credit_ledger WHERE user_id = ?
               ORDER BY created_at DESC, id DESC LIMIT ?""",
            (user_id, limit),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def consume(user_id: int, cost: int, ref_id: str = "", note: str = "") -> int:
    """扣费。余额不足抛 402。返回扣后余额。"""
    if cost <= 0:
        raise CreditError("INVALID_COST", "cost 必须正数", status=400)
    now_ms = int(time.time() * 1000)
    with transaction() as conn:
        row = conn.execute(
            "SELECT balance FROM credit_accounts WHERE user_id = ?", (user_id,)
        ).fetchone()
        if not row:
            raise CreditError("ACCOUNT_NOT_FOUND", "账户不存在", status=404)
        if row["balance"] < cost:
            raise CreditError(
                "INSUFFICIENT_CREDIT",
                "积分不足",
                status=402,
                need=cost,
                have=row["balance"],
            )
        new_balance = row["balance"] - cost
        conn.execute(
            "UPDATE credit_accounts SET balance = ?, total_consumed = total_consumed + ?, updated_at = ? WHERE user_id = ?",
            (new_balance, cost, now_ms, user_id),
        )
        conn.execute(
            """INSERT INTO credit_ledger (user_id, type, delta, balance_after, ref_id, note, created_at)
               VALUES (?, 'consume', ?, ?, ?, ?, ?)""",
            (user_id, -cost, new_balance, ref_id, note, now_ms),
        )
        return new_balance


def refund(user_id: int, amount: int, ref_id: str = "", note: str = "") -> int:
    """退款。仅允许退 consume 类型。返回退后余额。"""
    if amount <= 0:
        raise CreditError("INVALID_AMOUNT", "amount 必须正数", status=400)
    now_ms = int(time.time() * 1000)
    with transaction() as conn:
        row = conn.execute(
            "SELECT balance FROM credit_accounts WHERE user_id = ?", (user_id,)
        ).fetchone()
        if not row:
            raise CreditError("ACCOUNT_NOT_FOUND", "账户不存在", status=404)
        new_balance = row["balance"] + amount
        conn.execute(
            "UPDATE credit_accounts SET balance = ?, updated_at = ? WHERE user_id = ?",
            (new_balance, now_ms, user_id),
        )
        conn.execute(
            """INSERT INTO credit_ledger (user_id, type, delta, balance_after, ref_id, note, created_at)
               VALUES (?, 'refund', ?, ?, ?, ?, ?)""",
            (user_id, amount, new_balance, ref_id, note or "调用失败退款", now_ms),
        )
        return new_balance


def _normalize_redeem_code(code: str) -> str:
    return "".join((code or "").upper().split()).replace("-", "")


def _format_redeem_code(raw: str) -> str:
    chunks = [raw[i:i + 4] for i in range(0, len(raw), 4)]
    return "-".join(chunks)


def generate_redeem_code_value() -> str:
    alphabet = string.ascii_uppercase + string.digits
    raw = "".join(secrets.choice(alphabet) for _ in range(REDEEM_CODE_LENGTH))
    return _format_redeem_code(raw)


def generate_redeem_codes(
    amount: int,
    count: int = 1,
    *,
    created_by_user_id: int | None = None,
    batch_id: str = "",
    note: str = DEFAULT_REDEEM_CODE_NOTE,
) -> list[dict]:
    if amount not in REDEEM_CODE_AMOUNTS:
        raise CreditError("INVALID_REDEEM_AMOUNT", "不支持该兑换码额度", status=400, allowed=list(REDEEM_CODE_AMOUNTS))
    if count < 1 or count > 500:
        raise CreditError("INVALID_REDEEM_COUNT", "单次生成数量需在 1-500 之间", status=400)
    now_ms = int(time.time() * 1000)
    final_batch_id = batch_id.strip() or f"batch_{now_ms}_{secrets.token_hex(3)}"
    created: list[dict] = []
    with transaction() as conn:
        while len(created) < count:
            code = generate_redeem_code_value()
            normalized = _normalize_redeem_code(code)
            exists = conn.execute("SELECT 1 FROM credit_redeem_codes WHERE code = ?", (normalized,)).fetchone()
            if exists:
                continue
            conn.execute(
                """INSERT INTO credit_redeem_codes
                   (code, amount, status, batch_id, note, created_by_user_id, created_at)
                   VALUES (?, ?, 'active', ?, ?, ?, ?)""",
                (normalized, amount, final_batch_id, note.strip() or DEFAULT_REDEEM_CODE_NOTE, created_by_user_id, now_ms),
            )
            created.append({"code": _format_redeem_code(normalized), "amount": amount, "batch_id": final_batch_id})
    return created


def redeem_code(user_id: int, code: str) -> dict:
    normalized = _normalize_redeem_code(code)
    if len(normalized) < 8:
        raise CreditError("INVALID_REDEEM_CODE", "兑换码格式不正确", status=400)
    now_ms = int(time.time() * 1000)
    with transaction() as conn:
        row = conn.execute(
            "SELECT code, amount, status FROM credit_redeem_codes WHERE code = ?",
            (normalized,),
        ).fetchone()
        if not row:
            raise CreditError("REDEEM_CODE_NOT_FOUND", "兑换码不存在", status=404)
        if row["status"] != "active":
            raise CreditError("REDEEM_CODE_USED", "兑换码已被使用或失效", status=409)
        amount = int(row["amount"])
        acct = conn.execute("SELECT balance FROM credit_accounts WHERE user_id = ?", (user_id,)).fetchone()
        if not acct:
            raise CreditError("ACCOUNT_NOT_FOUND", "账户不存在", status=404)
        new_balance = int(acct["balance"]) + amount
        conn.execute(
            "UPDATE credit_accounts SET balance = ?, total_recharged = total_recharged + ?, updated_at = ? WHERE user_id = ?",
            (new_balance, amount, now_ms, user_id),
        )
        conn.execute(
            """UPDATE credit_redeem_codes
               SET status = 'redeemed', redeemed_by_user_id = ?, redeemed_at = ?
               WHERE code = ? AND status = 'active'""",
            (user_id, now_ms, normalized),
        )
        conn.execute(
            """INSERT INTO credit_ledger (user_id, type, delta, balance_after, ref_id, note, created_at)
               VALUES (?, 'redeem_code', ?, ?, ?, '兑换码充值', ?)""",
            (user_id, amount, new_balance, normalized, now_ms),
        )
        return {"code": _format_redeem_code(normalized), "amount": amount, "balance": new_balance}


def list_redeem_code_batches(limit: int = 50) -> list[dict]:
    conn = connect()
    try:
        rows = conn.execute(
            """SELECT batch_id, amount, COUNT(*) AS total,
                      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active_count,
                      SUM(CASE WHEN status = 'redeemed' THEN 1 ELSE 0 END) AS redeemed_count,
                      MIN(created_at) AS created_at
               FROM credit_redeem_codes
               GROUP BY batch_id, amount
               ORDER BY created_at DESC
               LIMIT ?""",
            (max(1, min(200, limit)),),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def recompute_balance(user_id: int) -> int:
    """从流水重算余额，返回新余额；与缓存不匹配时报警。"""
    conn = connect()
    try:
        row = conn.execute(
            "SELECT COALESCE(SUM(delta), 0) AS s FROM credit_ledger WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        computed = int(row["s"])
        acct = conn.execute(
            "SELECT balance FROM credit_accounts WHERE user_id = ?", (user_id,)
        ).fetchone()
        cached = int(acct["balance"]) if acct else 0
        if computed != cached:
            logging.error(
                "balance mismatch user=%s cached=%s computed=%s", user_id, cached, computed
            )
        return computed
    finally:
        conn.close()

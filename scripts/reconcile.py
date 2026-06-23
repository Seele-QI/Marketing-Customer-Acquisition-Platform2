"""全量对账：检查所有用户的 balance 与 ledger 之和是否一致。"""
import os
import sqlite3
import sys

DB = os.path.join(os.path.dirname(__file__), "..", "data", "accounts.db")


def main() -> int:
    if not os.path.exists(DB):
        print(f"[skip] db not found: {DB}")
        return 0
    conn = sqlite3.connect(DB)
    try:
        rows = conn.execute(
            """SELECT u.id, u.phone_masked, ca.balance AS cached,
                      COALESCE((SELECT SUM(delta) FROM credit_ledger WHERE user_id = u.id), 0) AS computed
               FROM users u
               LEFT JOIN credit_accounts ca ON ca.user_id = u.id"""
        ).fetchall()
    finally:
        conn.close()

    mismatches = [r for r in rows if (r["cached"] or 0) != r["computed"]]
    print(f"users={len(rows)} mismatches={len(mismatches)}")
    for r in mismatches:
        diff = (r["computed"] or 0) - (r["cached"] or 0)
        print(
            f"  user_id={r['id']} phone={r['phone_masked']} "
            f"cached={r['cached']} computed={r['computed']} diff={diff}"
        )
    return 1 if mismatches else 0


if __name__ == "__main__":
    sys.exit(main())

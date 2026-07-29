import importlib
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path


class ConnectorAccountMigrationTests(unittest.TestCase):
    def setUp(self) -> None:
        os.environ.setdefault("COOKIE_ENCRYPTION_KEY", "test-only-cookie-key-with-at-least-32-characters")
        self.connector = importlib.import_module("lib.connector_service")

    def test_legacy_accounts_table_is_migrated_without_claiming_old_credentials(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database = Path(temp_dir) / "accounts.db"
            connection = sqlite3.connect(database)
            connection.execute(
                """
                CREATE TABLE accounts (
                    id TEXT PRIMARY KEY,
                    platform TEXT NOT NULL,
                    nickname TEXT DEFAULT '',
                    cookie_encrypted TEXT NOT NULL,
                    cookie_iv TEXT NOT NULL,
                    login_status TEXT DEFAULT 'unknown',
                    created_at REAL NOT NULL,
                    updated_at REAL NOT NULL
                )
                """
            )
            connection.execute(
                "INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                ("legacy", "douyin", "legacy-user", "cipher", "iv", "valid", 1.0, 1.0),
            )
            connection.commit()
            connection.close()

            original_db = self.connector._ACCOUNTS_DB
            self.connector._ACCOUNTS_DB = str(database)
            try:
                self.connector._init_accounts_db()
                connection = sqlite3.connect(database)
                try:
                    columns = {row[1] for row in connection.execute("PRAGMA table_info(accounts)")}
                    legacy_user_id = connection.execute(
                        "SELECT user_id FROM accounts WHERE id = 'legacy'"
                    ).fetchone()[0]
                    legacy_status = connection.execute(
                        "SELECT login_status FROM accounts WHERE id = 'legacy'"
                    ).fetchone()[0]
                    indexes = {row[1] for row in connection.execute("PRAGMA index_list(accounts)")}
                finally:
                    connection.close()

                self.assertIn("user_id", columns)
                self.assertIn("platform_user_id", columns)
                self.assertIn("verified_at", columns)
                self.assertEqual(legacy_user_id, 0)
                self.assertEqual(legacy_status, "unverified")
                self.assertIn("idx_accounts_user_platform", indexes)
                self.assertFalse(self.connector.get_all_platforms(42)[0]["connected"])
            finally:
                self.connector._ACCOUNTS_DB = original_db

    def test_only_identity_verified_account_is_connected(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            database = Path(temp_dir) / "accounts.db"
            original_db = self.connector._ACCOUNTS_DB
            self.connector._ACCOUNTS_DB = str(database)
            try:
                cookie_json = '[{"name":"sessionid","value":"valid","domain":".douyin.com","path":"/"}]'
                self.connector.save_cookie_payload(7, "douyin", cookie_json, verified=False)
                unverified = next(p for p in self.connector.get_all_platforms(7) if p["platform_id"] == "douyin")
                self.assertFalse(unverified["connected"])
                self.assertEqual(unverified["verification_status"], "unverified")

                account = self.connector.save_cookie_payload(
                    7,
                    "douyin",
                    cookie_json,
                    nickname="真实账号",
                    platform_user_id="user-7",
                    verified=True,
                )
                platform = next(p for p in self.connector.get_all_platforms(7) if p["platform_id"] == "douyin")
                self.assertTrue(platform["connected"])
                self.assertEqual(platform["account_info"]["nickname"], "真实账号")
                self.assertIsNotNone(account["verified_at"])
            finally:
                self.connector._ACCOUNTS_DB = original_db


if __name__ == "__main__":
    unittest.main()

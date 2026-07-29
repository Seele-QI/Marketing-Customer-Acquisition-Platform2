"""Account-scoped durable storage for long-term user memory.

The store deliberately contains no LLM logic.  It owns isolation, revisions,
idempotent observations and an append-only audit trail.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
import uuid
from contextlib import closing, contextmanager
from dataclasses import dataclass
from typing import Any, Iterator, Mapping, Sequence


@dataclass(frozen=True)
class ObservationReceipt:
    observation_id: str
    created: bool


@dataclass(frozen=True)
class MemoryObservation:
    id: str
    user_id: int
    scope: str
    session_id: str
    message_id: str
    text: str
    status: str
    attempts: int
    created_at: int


@dataclass(frozen=True)
class MemoryItem:
    id: str
    user_id: int
    scope: str
    category: str
    memory_key: str
    value_json: str
    normalized_value: str
    status: str
    source: str
    confidence: float
    strength: float
    pinned: bool
    revision: int
    first_seen_at: int
    last_confirmed_at: int
    created_at: int
    updated_at: int

    @property
    def value(self) -> Any:
        return json.loads(self.value_json)


@dataclass(frozen=True)
class MemoryEvent:
    id: int
    user_id: int
    item_id: str
    event_type: str
    old_value_json: str | None
    new_value_json: str | None
    metadata_json: str
    created_at: int


@dataclass(frozen=True)
class MemorySettings:
    user_id: int
    enabled: bool
    scope_enabled: dict[str, bool]
    legacy_imported_at: int | None
    updated_at: int


class UserMemoryStore:
    class RevisionConflict(RuntimeError):
        pass

    class ActiveMemoryExists(RuntimeError):
        pass

    class ItemNotFound(LookupError):
        pass

    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or (os.getenv("CREDIT_DB_OVERRIDE") or "").strip()
        if not self.db_path:
            self.db_path = os.path.join(
                os.path.dirname(os.path.dirname(__file__)), "data", "accounts.db"
            )
        self.ensure_memory_schema()

    def _connect(self) -> sqlite3.Connection:
        parent = os.path.dirname(os.path.abspath(self.db_path))
        os.makedirs(parent, exist_ok=True)
        conn = sqlite3.connect(self.db_path, timeout=10, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL")
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    @contextmanager
    def _transaction(self) -> Iterator[sqlite3.Connection]:
        conn = self._connect()
        try:
            conn.execute("BEGIN IMMEDIATE")
            yield conn
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.close()

    def ensure_memory_schema(self) -> None:
        # sqlite3.executescript manages its own transaction boundary, so it must
        # not run inside the explicit BEGIN IMMEDIATE helper.
        conn = self._connect()
        try:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS user_memory_items (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    scope TEXT NOT NULL,
                    category TEXT NOT NULL,
                    memory_key TEXT NOT NULL,
                    value_json TEXT NOT NULL,
                    normalized_value TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active',
                    source TEXT NOT NULL,
                    confidence REAL NOT NULL,
                    strength REAL NOT NULL DEFAULT 1,
                    pinned INTEGER NOT NULL DEFAULT 0,
                    revision INTEGER NOT NULL DEFAULT 1,
                    first_seen_at INTEGER NOT NULL,
                    last_confirmed_at INTEGER NOT NULL,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    CHECK (status IN ('active','superseded','disabled','deleted')),
                    CHECK (source IN ('extracted','manual','legacy'))
                );
                CREATE UNIQUE INDEX IF NOT EXISTS uq_user_memory_active_key
                    ON user_memory_items(user_id, scope, category, memory_key)
                    WHERE status = 'active';
                CREATE INDEX IF NOT EXISTS ix_user_memory_items_user_status
                    ON user_memory_items(user_id, status, scope);

                CREATE TABLE IF NOT EXISTS user_memory_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    item_id TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    old_value_json TEXT,
                    new_value_json TEXT,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS ix_user_memory_events_user_item
                    ON user_memory_events(user_id, item_id, id);

                CREATE TABLE IF NOT EXISTS user_memory_observations (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    scope TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    message_id TEXT NOT NULL,
                    text TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    attempts INTEGER NOT NULL DEFAULT 0,
                    retryable INTEGER NOT NULL DEFAULT 1,
                    last_error_code TEXT,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    UNIQUE(user_id, session_id, message_id),
                    CHECK (status IN ('pending','processing','completed','failed'))
                );
                CREATE INDEX IF NOT EXISTS ix_user_memory_observations_claim
                    ON user_memory_observations(user_id, scope, status, created_at);

                CREATE TABLE IF NOT EXISTS user_memory_settings (
                    user_id INTEGER PRIMARY KEY,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    scope_enabled_json TEXT NOT NULL,
                    legacy_imported_at INTEGER,
                    updated_at INTEGER NOT NULL
                );
                """
            )
        finally:
            conn.close()

    @staticmethod
    def _now() -> int:
        return int(time.time())

    @staticmethod
    def _json(value: Any) -> str:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

    @staticmethod
    def _normalize(value: Any) -> str:
        if isinstance(value, str):
            return " ".join(value.casefold().split())
        return UserMemoryStore._json(value).casefold()

    @staticmethod
    def _item(row: sqlite3.Row | None) -> MemoryItem | None:
        if row is None:
            return None
        return MemoryItem(
            id=row["id"],
            user_id=int(row["user_id"]),
            scope=row["scope"],
            category=row["category"],
            memory_key=row["memory_key"],
            value_json=row["value_json"],
            normalized_value=row["normalized_value"],
            status=row["status"],
            source=row["source"],
            confidence=float(row["confidence"]),
            strength=float(row["strength"]),
            pinned=bool(row["pinned"]),
            revision=int(row["revision"]),
            first_seen_at=int(row["first_seen_at"]),
            last_confirmed_at=int(row["last_confirmed_at"]),
            created_at=int(row["created_at"]),
            updated_at=int(row["updated_at"]),
        )

    def _append_event(
        self,
        conn: sqlite3.Connection,
        *,
        user_id: int,
        item_id: str,
        event_type: str,
        old_value_json: str | None,
        new_value_json: str | None,
        metadata: Mapping[str, Any] | None = None,
    ) -> None:
        conn.execute(
            "INSERT INTO user_memory_events "
            "(user_id,item_id,event_type,old_value_json,new_value_json,metadata_json,created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (
                user_id,
                item_id,
                event_type,
                old_value_json,
                new_value_json,
                self._json(dict(metadata or {})),
                self._now(),
            ),
        )

    def observe_user_message(
        self,
        *,
        user_id: int,
        scope: str,
        session_id: str,
        message_id: str,
        text: str,
    ) -> ObservationReceipt:
        now = self._now()
        observation_id = str(uuid.uuid4())
        with self._transaction() as conn:
            existing = conn.execute(
                "SELECT id FROM user_memory_observations "
                "WHERE user_id=? AND session_id=? AND message_id=?",
                (user_id, session_id, message_id),
            ).fetchone()
            if existing is not None:
                return ObservationReceipt(existing["id"], False)
            conn.execute(
                "INSERT INTO user_memory_observations "
                "(id,user_id,scope,session_id,message_id,text,status,created_at,updated_at) "
                "VALUES (?,?,?,?,?,?,'pending',?,?)",
                (observation_id, user_id, scope, session_id, message_id, text, now, now),
            )
        return ObservationReceipt(observation_id, True)

    def claim_observation_batch(
        self, *, user_id: int, scope: str, limit: int = 10
    ) -> list[MemoryObservation]:
        limit = max(1, min(int(limit), 50))
        now = self._now()
        stale_before = now - 300
        with self._transaction() as conn:
            rows = conn.execute(
                "SELECT * FROM user_memory_observations "
                "WHERE user_id=? AND scope=? AND "
                "(status='pending' OR (status='failed' AND retryable=1) "
                "OR (status='processing' AND updated_at<?)) "
                "ORDER BY created_at,id LIMIT ?",
                (user_id, scope, stale_before, limit),
            ).fetchall()
            if not rows:
                return []
            ids = [row["id"] for row in rows]
            conn.executemany(
                "UPDATE user_memory_observations SET status='processing', attempts=attempts+1, "
                "updated_at=? WHERE user_id=? AND id=?",
                [(now, user_id, observation_id) for observation_id in ids],
            )
            return [
                MemoryObservation(
                    id=row["id"],
                    user_id=int(row["user_id"]),
                    scope=row["scope"],
                    session_id=row["session_id"],
                    message_id=row["message_id"],
                    text=row["text"],
                    status="processing",
                    attempts=int(row["attempts"]) + 1,
                    created_at=int(row["created_at"]),
                )
                for row in rows
            ]

    def complete_observations(self, *, user_id: int, observation_ids: Sequence[str]) -> None:
        self._set_observation_state(
            user_id=user_id, observation_ids=observation_ids, status="completed", retryable=False
        )

    def fail_observations(
        self,
        *,
        user_id: int,
        observation_ids: Sequence[str],
        retryable: bool,
        error_code: str = "MEMORY_EXTRACTION_FAILED",
    ) -> None:
        self._set_observation_state(
            user_id=user_id,
            observation_ids=observation_ids,
            status="failed",
            retryable=retryable,
            error_code=error_code,
        )

    def _set_observation_state(
        self,
        *,
        user_id: int,
        observation_ids: Sequence[str],
        status: str,
        retryable: bool,
        error_code: str | None = None,
    ) -> None:
        if not observation_ids:
            return
        now = self._now()
        with self._transaction() as conn:
            conn.executemany(
                "UPDATE user_memory_observations SET status=?,retryable=?,last_error_code=?,updated_at=? "
                "WHERE user_id=? AND id=?",
                [
                    (status, int(retryable), error_code, now, user_id, observation_id)
                    for observation_id in observation_ids
                ],
            )

    def insert_item(
        self,
        *,
        user_id: int,
        scope: str,
        category: str,
        memory_key: str,
        value: Any,
        source: str,
        confidence: float,
        strength: float = 1.0,
        pinned: bool = False,
    ) -> MemoryItem:
        now = self._now()
        item_id = str(uuid.uuid4())
        value_json = self._json(value)
        try:
            with self._transaction() as conn:
                conn.execute(
                    "INSERT INTO user_memory_items "
                    "(id,user_id,scope,category,memory_key,value_json,normalized_value,status,source,"
                    "confidence,strength,pinned,revision,first_seen_at,last_confirmed_at,created_at,updated_at) "
                    "VALUES (?,?,?,?,?,?,?,'active',?,?,?,?,1,?,?,?,?)",
                    (
                        item_id,
                        user_id,
                        scope,
                        category,
                        memory_key,
                        value_json,
                        self._normalize(value),
                        source,
                        float(confidence),
                        float(strength),
                        int(pinned),
                        now,
                        now,
                        now,
                        now,
                    ),
                )
                self._append_event(
                    conn,
                    user_id=user_id,
                    item_id=item_id,
                    event_type="created",
                    old_value_json=None,
                    new_value_json=value_json,
                    metadata={"source": source},
                )
        except sqlite3.IntegrityError as exc:
            if "UNIQUE constraint failed" in str(exc):
                raise self.ActiveMemoryExists(memory_key) from exc
            raise
        item = self.get_item(user_id=user_id, item_id=item_id)
        assert item is not None
        return item

    def get_active_item(
        self, *, user_id: int, scope: str, category: str, memory_key: str
    ) -> MemoryItem | None:
        with closing(self._connect()) as conn:
            row = conn.execute(
                "SELECT * FROM user_memory_items WHERE user_id=? AND scope=? AND category=? "
                "AND memory_key=? AND status='active'",
                (user_id, scope, category, memory_key),
            ).fetchone()
        return self._item(row)

    def get_item(
        self, *, user_id: int, item_id: str, include_deleted: bool = False
    ) -> MemoryItem | None:
        query = "SELECT * FROM user_memory_items WHERE user_id=? AND id=?"
        params: tuple[Any, ...] = (user_id, item_id)
        if not include_deleted:
            query += " AND status!='deleted'"
        with closing(self._connect()) as conn:
            row = conn.execute(query, params).fetchone()
        return self._item(row)

    def list_items(
        self,
        *,
        user_id: int,
        scope: str | None = None,
        status: str = "active",
    ) -> list[MemoryItem]:
        query = "SELECT * FROM user_memory_items WHERE user_id=? AND status=?"
        params: list[Any] = [user_id, status]
        if scope is not None:
            query += " AND scope=?"
            params.append(scope)
        query += " ORDER BY pinned DESC, updated_at DESC, id"
        with closing(self._connect()) as conn:
            rows = conn.execute(query, params).fetchall()
        return [self._item(row) for row in rows if row is not None]

    def get_summary(self, *, user_id: int) -> dict[str, Any]:
        items = self.list_items(user_id=user_id)
        return {
            "total": len(items),
            "byScope": dict(_counts(item.scope for item in items)),
            "byCategory": dict(_counts(item.category for item in items)),
        }

    def update_item(
        self,
        *,
        user_id: int,
        item_id: str,
        expected_revision: int,
        value: Any | None = None,
        pinned: bool | None = None,
        source: str = "manual",
    ) -> MemoryItem:
        with self._transaction() as conn:
            row = conn.execute(
                "SELECT * FROM user_memory_items WHERE user_id=? AND id=? AND status!='deleted'",
                (user_id, item_id),
            ).fetchone()
            if row is None:
                raise self.ItemNotFound(item_id)
            if int(row["revision"]) != int(expected_revision):
                raise self.RevisionConflict(item_id)
            next_value_json = row["value_json"] if value is None else self._json(value)
            next_normalized = row["normalized_value"] if value is None else self._normalize(value)
            next_pinned = int(row["pinned"]) if pinned is None else int(pinned)
            now = self._now()
            conn.execute(
                "UPDATE user_memory_items SET value_json=?,normalized_value=?,pinned=?,source=?,"
                "revision=revision+1,last_confirmed_at=?,updated_at=? WHERE user_id=? AND id=?",
                (
                    next_value_json,
                    next_normalized,
                    next_pinned,
                    source,
                    now,
                    now,
                    user_id,
                    item_id,
                ),
            )
            self._append_event(
                conn,
                user_id=user_id,
                item_id=item_id,
                event_type="updated",
                old_value_json=row["value_json"],
                new_value_json=next_value_json,
                metadata={"pinned": bool(next_pinned), "source": source},
            )
        item = self.get_item(user_id=user_id, item_id=item_id)
        assert item is not None
        return item

    def reinforce_item(
        self,
        *,
        user_id: int,
        item_id: str,
        expected_revision: int,
        confidence: float,
        amount: float = 0.25,
    ) -> MemoryItem:
        with self._transaction() as conn:
            row = conn.execute(
                "SELECT * FROM user_memory_items WHERE user_id=? AND id=? AND status='active'",
                (user_id, item_id),
            ).fetchone()
            if row is None:
                raise self.ItemNotFound(item_id)
            if int(row["revision"]) != int(expected_revision):
                raise self.RevisionConflict(item_id)
            now = self._now()
            strength = min(10.0, float(row["strength"]) + max(0.0, amount))
            next_confidence = max(float(row["confidence"]), float(confidence))
            conn.execute(
                "UPDATE user_memory_items SET strength=?,confidence=?,revision=revision+1,"
                "last_confirmed_at=?,updated_at=? WHERE user_id=? AND id=?",
                (strength, next_confidence, now, now, user_id, item_id),
            )
            self._append_event(
                conn,
                user_id=user_id,
                item_id=item_id,
                event_type="reinforced",
                old_value_json=row["value_json"],
                new_value_json=row["value_json"],
                metadata={"strength": strength, "confidence": next_confidence},
            )
        item = self.get_item(user_id=user_id, item_id=item_id)
        assert item is not None
        return item

    def supersede_item(
        self,
        *,
        user_id: int,
        old_item_id: str,
        expected_revision: int,
        value: Any,
        source: str,
        confidence: float,
    ) -> MemoryItem:
        now = self._now()
        new_id = str(uuid.uuid4())
        new_value_json = self._json(value)
        with self._transaction() as conn:
            old = conn.execute(
                "SELECT * FROM user_memory_items WHERE user_id=? AND id=? AND status='active'",
                (user_id, old_item_id),
            ).fetchone()
            if old is None:
                raise self.ItemNotFound(old_item_id)
            if int(old["revision"]) != int(expected_revision):
                raise self.RevisionConflict(old_item_id)
            conn.execute(
                "UPDATE user_memory_items SET status='superseded',revision=revision+1,updated_at=? "
                "WHERE user_id=? AND id=?",
                (now, user_id, old_item_id),
            )
            conn.execute(
                "INSERT INTO user_memory_items "
                "(id,user_id,scope,category,memory_key,value_json,normalized_value,status,source,"
                "confidence,strength,pinned,revision,first_seen_at,last_confirmed_at,created_at,updated_at) "
                "VALUES (?,?,?,?,?,?,?,'active',?,?,1,0,1,?,?,?,?)",
                (
                    new_id,
                    user_id,
                    old["scope"],
                    old["category"],
                    old["memory_key"],
                    new_value_json,
                    self._normalize(value),
                    source,
                    float(confidence),
                    now,
                    now,
                    now,
                    now,
                ),
            )
            self._append_event(
                conn,
                user_id=user_id,
                item_id=old_item_id,
                event_type="superseded",
                old_value_json=old["value_json"],
                new_value_json=new_value_json,
                metadata={"replacementItemId": new_id},
            )
            self._append_event(
                conn,
                user_id=user_id,
                item_id=new_id,
                event_type="created",
                old_value_json=None,
                new_value_json=new_value_json,
                metadata={"source": source, "supersedesItemId": old_item_id},
            )
        item = self.get_item(user_id=user_id, item_id=new_id)
        assert item is not None
        return item

    def set_item_status(
        self,
        *,
        user_id: int,
        item_id: str,
        expected_revision: int,
        status: str,
    ) -> MemoryItem:
        if status not in {"active", "disabled", "deleted"}:
            raise ValueError("unsupported memory status")
        with self._transaction() as conn:
            row = conn.execute(
                "SELECT * FROM user_memory_items WHERE user_id=? AND id=?",
                (user_id, item_id),
            ).fetchone()
            if row is None or row["status"] == "deleted":
                raise self.ItemNotFound(item_id)
            if int(row["revision"]) != int(expected_revision):
                raise self.RevisionConflict(item_id)
            now = self._now()
            try:
                conn.execute(
                    "UPDATE user_memory_items SET status=?,revision=revision+1,updated_at=? "
                    "WHERE user_id=? AND id=?",
                    (status, now, user_id, item_id),
                )
            except sqlite3.IntegrityError as exc:
                raise self.ActiveMemoryExists(row["memory_key"]) from exc
            self._append_event(
                conn,
                user_id=user_id,
                item_id=item_id,
                event_type=status,
                old_value_json=row["value_json"],
                new_value_json=row["value_json"],
            )
        item = self.get_item(user_id=user_id, item_id=item_id, include_deleted=True)
        assert item is not None
        return item

    def clear_items(self, *, user_id: int) -> int:
        now = self._now()
        with self._transaction() as conn:
            rows = conn.execute(
                "SELECT * FROM user_memory_items WHERE user_id=? AND status IN ('active','disabled')",
                (user_id,),
            ).fetchall()
            for row in rows:
                conn.execute(
                    "UPDATE user_memory_items SET status='deleted',revision=revision+1,updated_at=? "
                    "WHERE user_id=? AND id=?",
                    (now, user_id, row["id"]),
                )
                self._append_event(
                    conn,
                    user_id=user_id,
                    item_id=row["id"],
                    event_type="deleted",
                    old_value_json=row["value_json"],
                    new_value_json=None,
                    metadata={"reason": "clear_all"},
                )
            return len(rows)

    def list_events(
        self, *, user_id: int, item_id: str | None = None, limit: int = 100
    ) -> list[MemoryEvent]:
        query = "SELECT * FROM user_memory_events WHERE user_id=?"
        params: list[Any] = [user_id]
        if item_id is not None:
            query += " AND item_id=?"
            params.append(item_id)
        query += " ORDER BY id LIMIT ?"
        params.append(max(1, min(int(limit), 500)))
        with closing(self._connect()) as conn:
            rows = conn.execute(query, params).fetchall()
        return [
            MemoryEvent(
                id=int(row["id"]),
                user_id=int(row["user_id"]),
                item_id=row["item_id"],
                event_type=row["event_type"],
                old_value_json=row["old_value_json"],
                new_value_json=row["new_value_json"],
                metadata_json=row["metadata_json"],
                created_at=int(row["created_at"]),
            )
            for row in rows
        ]

    def get_settings(self, *, user_id: int) -> MemorySettings:
        with self._transaction() as conn:
            row = conn.execute(
                "SELECT * FROM user_memory_settings WHERE user_id=?", (user_id,)
            ).fetchone()
            if row is None:
                now = self._now()
                defaults = {
                    "global": True,
                    "copywriting": True,
                    "positioning": True,
                    "video": True,
                    "geo": True,
                }
                conn.execute(
                    "INSERT INTO user_memory_settings "
                    "(user_id,enabled,scope_enabled_json,updated_at) VALUES (?,1,?,?)",
                    (user_id, self._json(defaults), now),
                )
                row = conn.execute(
                    "SELECT * FROM user_memory_settings WHERE user_id=?", (user_id,)
                ).fetchone()
        assert row is not None
        return self._settings(row)

    def update_settings(
        self,
        *,
        user_id: int,
        enabled: bool | None = None,
        scope_enabled: Mapping[str, bool] | None = None,
    ) -> MemorySettings:
        current = self.get_settings(user_id=user_id)
        merged_scopes = dict(current.scope_enabled)
        if scope_enabled:
            merged_scopes.update({str(key): bool(value) for key, value in scope_enabled.items()})
        with self._transaction() as conn:
            conn.execute(
                "UPDATE user_memory_settings SET enabled=?,scope_enabled_json=?,updated_at=? "
                "WHERE user_id=?",
                (
                    int(current.enabled if enabled is None else enabled),
                    self._json(merged_scopes),
                    self._now(),
                    user_id,
                ),
            )
        return self.get_settings(user_id=user_id)

    def mark_legacy_imported(self, *, user_id: int) -> bool:
        self.get_settings(user_id=user_id)
        with self._transaction() as conn:
            cursor = conn.execute(
                "UPDATE user_memory_settings SET legacy_imported_at=?,updated_at=? "
                "WHERE user_id=? AND legacy_imported_at IS NULL",
                (self._now(), self._now(), user_id),
            )
            return cursor.rowcount == 1

    @staticmethod
    def _settings(row: sqlite3.Row) -> MemorySettings:
        return MemorySettings(
            user_id=int(row["user_id"]),
            enabled=bool(row["enabled"]),
            scope_enabled=json.loads(row["scope_enabled_json"]),
            legacy_imported_at=(
                int(row["legacy_imported_at"])
                if row["legacy_imported_at"] is not None
                else None
            ),
            updated_at=int(row["updated_at"]),
        )


def _counts(values: Sequence[str] | Any) -> dict[str, int]:
    result: dict[str, int] = {}
    for value in values:
        result[value] = result.get(value, 0) + 1
    return result


_default_store: UserMemoryStore | None = None


def get_user_memory_store() -> UserMemoryStore:
    """Return a process-local store, refreshing when the configured DB changes."""
    global _default_store
    configured = (os.getenv("CREDIT_DB_OVERRIDE") or "").strip()
    if _default_store is None or (configured and _default_store.db_path != configured):
        _default_store = UserMemoryStore(configured or None)
    return _default_store

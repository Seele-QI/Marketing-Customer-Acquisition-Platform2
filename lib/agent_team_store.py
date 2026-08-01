"""Durable, user-scoped store for enterprise agent runs, knowledge, approvals and evidence."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import time
import uuid
from contextlib import contextmanager
from typing import Any, Iterator


def _now() -> int:
    return int(time.time())


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _parameter_hash(parameters: dict[str, Any]) -> str:
    return hashlib.sha256(_json(parameters).encode("utf-8")).hexdigest()


class AgentTeamStore:
    class NotFound(Exception):
        pass

    class RevisionConflict(Exception):
        pass

    class ApprovalExpired(Exception):
        pass

    class ApprovalNotGranted(Exception):
        pass

    class ParameterMismatch(Exception):
        pass

    class ImmutableEvidence(Exception):
        pass

    def __init__(self, db_path: str):
        self.db_path = db_path
        os.makedirs(os.path.dirname(os.path.abspath(db_path)), exist_ok=True)
        self._init_schema()

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=10, isolation_level=None)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
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

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS agent_runs (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    agent_id TEXT NOT NULL,
                    prompt TEXT NOT NULL,
                    status TEXT NOT NULL,
                    result_json TEXT NOT NULL DEFAULT '{}',
                    revision INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_agent_runs_user_status_updated
                    ON agent_runs(user_id, status, updated_at DESC);

                CREATE TABLE IF NOT EXISTS agent_run_members (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL REFERENCES agent_runs(id),
                    user_id INTEGER NOT NULL,
                    agent_id TEXT NOT NULL,
                    member_role TEXT NOT NULL,
                    status TEXT NOT NULL,
                    output_json TEXT NOT NULL DEFAULT '{}',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_agent_members_user_run ON agent_run_members(user_id, run_id);

                CREATE TABLE IF NOT EXISTS agent_run_events (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL REFERENCES agent_runs(id),
                    user_id INTEGER NOT NULL,
                    event_type TEXT NOT NULL,
                    payload_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_agent_events_user_run_created
                    ON agent_run_events(user_id, run_id, created_at);

                CREATE TABLE IF NOT EXISTS agent_knowledge_documents (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    scope TEXT NOT NULL,
                    department_id TEXT,
                    task_id TEXT,
                    name TEXT NOT NULL,
                    source_type TEXT NOT NULL DEFAULT 'upload',
                    revision INTEGER NOT NULL DEFAULT 1,
                    status TEXT NOT NULL DEFAULT 'active',
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_agent_docs_user_scope_updated
                    ON agent_knowledge_documents(user_id, scope, updated_at DESC);

                CREATE TABLE IF NOT EXISTS agent_knowledge_chunks (
                    id TEXT PRIMARY KEY,
                    document_id TEXT NOT NULL REFERENCES agent_knowledge_documents(id),
                    user_id INTEGER NOT NULL,
                    scope TEXT NOT NULL,
                    department_id TEXT,
                    task_id TEXT,
                    chunk_index INTEGER NOT NULL,
                    text TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_agent_chunks_user_scope
                    ON agent_knowledge_chunks(user_id, scope, department_id);

                CREATE TABLE IF NOT EXISTS agent_approvals (
                    id TEXT PRIMARY KEY,
                    run_id TEXT NOT NULL REFERENCES agent_runs(id),
                    user_id INTEGER NOT NULL,
                    action_type TEXT NOT NULL,
                    parameter_hash TEXT NOT NULL,
                    parameters_json TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'pending',
                    decided_by TEXT,
                    decision_note TEXT,
                    expires_at INTEGER NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_agent_approvals_user_status_updated
                    ON agent_approvals(user_id, status, updated_at DESC);

                CREATE TABLE IF NOT EXISTS agent_execution_evidence (
                    id TEXT PRIMARY KEY,
                    approval_id TEXT NOT NULL UNIQUE REFERENCES agent_approvals(id),
                    run_id TEXT NOT NULL REFERENCES agent_runs(id),
                    user_id INTEGER NOT NULL,
                    parameter_hash TEXT NOT NULL,
                    status TEXT NOT NULL,
                    evidence_json TEXT NOT NULL,
                    created_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_agent_evidence_user_run
                    ON agent_execution_evidence(user_id, run_id, created_at DESC);
                """
            )
            for table, column in (
                ("agent_knowledge_documents", "task_id"),
                ("agent_knowledge_chunks", "task_id"),
            ):
                columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
                if column not in columns:
                    conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} TEXT")

    @staticmethod
    def _run(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["result"] = json.loads(result.pop("result_json"))
        return result

    @staticmethod
    def _approval(row: sqlite3.Row) -> dict[str, Any]:
        result = dict(row)
        result["parameters"] = json.loads(result.pop("parameters_json"))
        result.pop("parameter_hash", None)
        return result

    def create_run(self, *, user_id: int, agent_id: str, prompt: str, status: str = "queued") -> dict[str, Any]:
        now = _now()
        run_id = _id("run")
        with self._transaction() as conn:
            conn.execute(
                "INSERT INTO agent_runs(id,user_id,agent_id,prompt,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
                (run_id, user_id, agent_id, prompt, status, now, now),
            )
            row = conn.execute("SELECT * FROM agent_runs WHERE id=? AND user_id=?", (run_id, user_id)).fetchone()
        return self._run(row)

    def get_run(self, *, user_id: int, run_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM agent_runs WHERE id=? AND user_id=?", (run_id, user_id)).fetchone()
        return self._run(row) if row else None

    def list_runs(self, *, user_id: int, status: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        sql = "SELECT * FROM agent_runs WHERE user_id=?"
        params: list[Any] = [user_id]
        if status:
            sql += " AND status=?"
            params.append(status)
        sql += " ORDER BY updated_at DESC LIMIT ?"
        params.append(max(1, min(limit, 200)))
        with self._connect() as conn:
            return [self._run(row) for row in conn.execute(sql, params).fetchall()]

    def update_run(self, *, user_id: int, run_id: str, expected_revision: int, status: str, result: dict[str, Any] | None = None) -> dict[str, Any]:
        with self._transaction() as conn:
            row = conn.execute("SELECT * FROM agent_runs WHERE id=? AND user_id=?", (run_id, user_id)).fetchone()
            if not row:
                raise self.NotFound()
            if row["revision"] != expected_revision:
                raise self.RevisionConflict()
            conn.execute(
                "UPDATE agent_runs SET status=?, result_json=?, revision=revision+1, updated_at=? WHERE id=? AND user_id=?",
                (status, _json(result if result is not None else json.loads(row["result_json"])), _now(), run_id, user_id),
            )
            updated = conn.execute("SELECT * FROM agent_runs WHERE id=? AND user_id=?", (run_id, user_id)).fetchone()
        return self._run(updated)

    def append_event(self, *, user_id: int, run_id: str, event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
        event_id = _id("evt")
        now = _now()
        with self._transaction() as conn:
            exists = conn.execute("SELECT 1 FROM agent_runs WHERE id=? AND user_id=?", (run_id, user_id)).fetchone()
            if not exists:
                raise self.NotFound()
            conn.execute(
                "INSERT INTO agent_run_events(id,run_id,user_id,event_type,payload_json,created_at) VALUES(?,?,?,?,?,?)",
                (event_id, run_id, user_id, event_type, _json(payload), now),
            )
        return {"id": event_id, "run_id": run_id, "event_type": event_type, "payload": payload, "created_at": now}

    def list_events(self, *, user_id: int, run_id: str, limit: int = 200) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT * FROM agent_run_events WHERE user_id=? AND run_id=? ORDER BY created_at,id LIMIT ?",
                (user_id, run_id, max(1, min(limit, 500))),
            ).fetchall()
        return [{**dict(row), "payload": json.loads(row["payload_json"])} for row in rows]

    def import_knowledge(self, *, user_id: int, scope: str, name: str, text: str, department_id: str | None = None, task_id: str | None = None, source_type: str = "upload") -> dict[str, Any]:
        if scope not in {"task", "department", "company"}:
            raise ValueError("invalid scope")
        if scope == "department" and not department_id:
            raise ValueError("department_id required")
        if scope == "task" and not task_id:
            raise ValueError("task_id required")
        doc_id = _id("doc")
        now = _now()
        chunks = [text[i : i + 2000] for i in range(0, min(len(text), 100_000), 2000) if text[i : i + 2000].strip()]
        if not chunks:
            raise ValueError("empty text")
        with self._transaction() as conn:
            conn.execute(
                "INSERT INTO agent_knowledge_documents(id,user_id,scope,department_id,task_id,name,source_type,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (doc_id, user_id, scope, department_id, task_id, name, source_type, now, now),
            )
            conn.executemany(
                "INSERT INTO agent_knowledge_chunks(id,document_id,user_id,scope,department_id,task_id,chunk_index,text,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                [(_id("chk"), doc_id, user_id, scope, department_id, task_id, index, chunk, now) for index, chunk in enumerate(chunks)],
            )
            row = conn.execute("SELECT * FROM agent_knowledge_documents WHERE id=?", (doc_id,)).fetchone()
        return dict(row)

    def search_knowledge(self, *, user_id: int, query: str, scope: str | None = None, department_id: str | None = None, task_id: str | None = None, limit: int = 12) -> list[dict[str, Any]]:
        sql = "SELECT c.*,d.name FROM agent_knowledge_chunks c JOIN agent_knowledge_documents d ON d.id=c.document_id WHERE c.user_id=? AND d.status='active'"
        params: list[Any] = [user_id]
        if scope:
            sql += " AND c.scope=?"
            params.append(scope)
        if department_id:
            sql += " AND c.department_id=?"
            params.append(department_id)
        if task_id:
            sql += " AND c.task_id=?"
            params.append(task_id)
        if query.strip():
            sql += " AND c.text LIKE ?"
            params.append(f"%{query.strip()[:200]}%")
        sql += " ORDER BY d.updated_at DESC,c.chunk_index LIMIT ?"
        params.append(max(1, min(limit, 50)))
        with self._connect() as conn:
            return [dict(row) for row in conn.execute(sql, params).fetchall()]

    def create_approval(self, *, user_id: int, run_id: str, action_type: str, parameters: dict[str, Any], expires_at: int) -> dict[str, Any]:
        approval_id = _id("apr")
        now = _now()
        with self._transaction() as conn:
            exists = conn.execute("SELECT 1 FROM agent_runs WHERE id=? AND user_id=?", (run_id, user_id)).fetchone()
            if not exists:
                raise self.NotFound()
            conn.execute(
                "INSERT INTO agent_approvals(id,run_id,user_id,action_type,parameter_hash,parameters_json,expires_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
                (approval_id, run_id, user_id, action_type, _parameter_hash(parameters), _json(parameters), expires_at, now, now),
            )
            row = conn.execute("SELECT * FROM agent_approvals WHERE id=?", (approval_id,)).fetchone()
        return self._approval(row)

    def get_approval(self, *, user_id: int, approval_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM agent_approvals WHERE id=? AND user_id=?",
                (approval_id, user_id),
            ).fetchone()
        return self._approval(row) if row else None

    def get_execution_evidence(self, *, user_id: int, approval_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT * FROM agent_execution_evidence WHERE approval_id=? AND user_id=?",
                (approval_id, user_id),
            ).fetchone()
        if not row:
            return None
        result = dict(row)
        result["evidence"] = json.loads(result.pop("evidence_json"))
        result.pop("parameter_hash", None)
        return result

    def decide_approval(self, *, user_id: int, approval_id: str, expected_revision: int, decision: str, decided_by: str, note: str = "") -> dict[str, Any]:
        if decision not in {"approved", "rejected"}:
            raise ValueError("invalid decision")
        with self._transaction() as conn:
            row = conn.execute("SELECT * FROM agent_approvals WHERE id=? AND user_id=?", (approval_id, user_id)).fetchone()
            if not row:
                raise self.NotFound()
            if row["revision"] != expected_revision:
                raise self.RevisionConflict()
            if row["status"] != "pending":
                raise self.RevisionConflict()
            if row["expires_at"] < _now():
                raise self.ApprovalExpired()
            conn.execute(
                "UPDATE agent_approvals SET status=?,decided_by=?,decision_note=?,revision=revision+1,updated_at=? WHERE id=? AND user_id=?",
                (decision, decided_by, note, _now(), approval_id, user_id),
            )
            updated = conn.execute("SELECT * FROM agent_approvals WHERE id=?", (approval_id,)).fetchone()
        return self._approval(updated)

    def record_execution_evidence(self, *, user_id: int, approval_id: str, parameters: dict[str, Any], status: str, evidence: dict[str, Any]) -> dict[str, Any]:
        with self._transaction() as conn:
            approval = conn.execute("SELECT * FROM agent_approvals WHERE id=? AND user_id=?", (approval_id, user_id)).fetchone()
            if not approval:
                raise self.NotFound()
            if approval["status"] != "approved":
                raise self.ApprovalNotGranted()
            if approval["expires_at"] < _now():
                raise self.ApprovalExpired()
            expected_hash = _parameter_hash(parameters)
            if approval["parameter_hash"] != expected_hash:
                raise self.ParameterMismatch()
            existing = conn.execute("SELECT 1 FROM agent_execution_evidence WHERE approval_id=?", (approval_id,)).fetchone()
            if existing:
                raise self.ImmutableEvidence()
            evidence_id = _id("exe")
            now = _now()
            conn.execute(
                "INSERT INTO agent_execution_evidence(id,approval_id,run_id,user_id,parameter_hash,status,evidence_json,created_at) VALUES(?,?,?,?,?,?,?,?)",
                (evidence_id, approval_id, approval["run_id"], user_id, expected_hash, status, _json(evidence), now),
            )
        return {"id": evidence_id, "approval_id": approval_id, "run_id": approval["run_id"], "status": status, "evidence": evidence, "created_at": now}


_STORE: AgentTeamStore | None = None


def get_agent_team_store() -> AgentTeamStore:
    global _STORE
    if _STORE is None:
        from lib.db import DB_PATH

        _STORE = AgentTeamStore(DB_PATH)
    return _STORE

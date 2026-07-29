"""Durable, account-scoped storage for video and GEO business projects."""
from __future__ import annotations

import json
import os
import secrets
import sqlite3
import time
from contextlib import closing
from typing import Any


def _now() -> int:
    return int(time.time())


def _id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(12)}"


def _json(value: object) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


class BusinessAssistantStore:
    class RevisionConflict(RuntimeError):
        pass

    class ProjectNotFound(RuntimeError):
        pass

    class StepNotFound(RuntimeError):
        pass

    class InvalidTransition(RuntimeError):
        pass

    _PROJECT_STATUSES = {"active", "paused", "completed", "archived"}
    _STEP_STATUSES = {"pending", "active", "blocked", "completed"}
    _PROJECT_KINDS = {"video", "geo"}
    _ASSISTANTS = {"video": "video-creation", "geo": "geo-growth"}
    _EVIDENCE_SOURCES = {"draft_saved", "runtime_terminal", "geo_score"}

    def __init__(self, db_path: str | os.PathLike[str] | None = None):
        configured = (os.getenv("CREDIT_DB_OVERRIDE") or "").strip()
        self.db_path = str(
            db_path
            or configured
            or os.path.join(
                os.path.dirname(os.path.dirname(__file__)),
                "data",
                "accounts.db",
            )
        )
        self.ensure_schema()

    def _connect(self) -> sqlite3.Connection:
        parent = os.path.dirname(os.path.abspath(self.db_path))
        if parent:
            os.makedirs(parent, exist_ok=True)
        conn = sqlite3.connect(self.db_path, timeout=10)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")
        return conn

    def ensure_schema(self) -> None:
        with closing(self._connect()) as conn, conn:
            conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS business_projects (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    kind TEXT NOT NULL CHECK(kind IN ('video','geo')),
                    title TEXT NOT NULL,
                    goal TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'active'
                        CHECK(status IN ('active','paused','completed','archived')),
                    current_stage TEXT NOT NULL DEFAULT '',
                    assistant_id TEXT NOT NULL,
                    revision INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS ix_business_projects_user_updated
                    ON business_projects(user_id, updated_at DESC);

                CREATE TABLE IF NOT EXISTS business_project_steps (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    user_id INTEGER NOT NULL,
                    stage TEXT NOT NULL,
                    title TEXT NOT NULL,
                    status TEXT NOT NULL
                        CHECK(status IN ('pending','active','blocked','completed')),
                    order_index INTEGER NOT NULL,
                    linked_view TEXT,
                    linked_task_id TEXT,
                    linked_artifact_json TEXT NOT NULL DEFAULT '{}',
                    blocked_reason TEXT,
                    revision INTEGER NOT NULL DEFAULT 1,
                    created_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES business_projects(id)
                        ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS ix_business_steps_project_order
                    ON business_project_steps(user_id, project_id, order_index);

                CREATE TABLE IF NOT EXISTS business_assistant_messages (
                    id TEXT PRIMARY KEY,
                    project_id TEXT NOT NULL,
                    user_id INTEGER NOT NULL,
                    assistant_id TEXT NOT NULL,
                    role TEXT NOT NULL CHECK(role IN ('user','assistant','system')),
                    content TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    created_at INTEGER NOT NULL,
                    FOREIGN KEY(project_id) REFERENCES business_projects(id)
                        ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS ix_business_messages_project_created
                    ON business_assistant_messages(user_id, project_id, created_at);
                """
            )

    @staticmethod
    def _project(row: sqlite3.Row | None) -> dict[str, Any] | None:
        return dict(row) if row is not None else None

    @staticmethod
    def _step(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        value = dict(row)
        value["linked_artifact"] = json.loads(
            value.pop("linked_artifact_json") or "{}"
        )
        return value

    @staticmethod
    def _message(row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        value = dict(row)
        value["metadata"] = json.loads(value.pop("metadata_json") or "{}")
        return value

    def create_project(
        self,
        *,
        user_id: int,
        kind: str,
        title: str,
        goal: str,
        assistant_id: str | None = None,
    ) -> dict[str, Any]:
        if kind not in self._PROJECT_KINDS:
            raise ValueError("unsupported project kind")
        expected_assistant = self._ASSISTANTS[kind]
        resolved_assistant = assistant_id or expected_assistant
        if resolved_assistant != expected_assistant:
            raise ValueError("assistant does not match project kind")
        clean_title = title.strip()
        clean_goal = goal.strip()
        if not clean_title or not clean_goal:
            raise ValueError("project title and goal are required")
        now = _now()
        project_id = _id("bprj")
        with closing(self._connect()) as conn, conn:
            conn.execute(
                """
                INSERT INTO business_projects
                (id,user_id,kind,title,goal,status,current_stage,assistant_id,
                 revision,created_at,updated_at)
                VALUES(?,?,?,?,?,'active','',?,1,?,?)
                """,
                (
                    project_id,
                    user_id,
                    kind,
                    clean_title[:200],
                    clean_goal[:4000],
                    resolved_assistant,
                    now,
                    now,
                ),
            )
            row = conn.execute(
                "SELECT * FROM business_projects WHERE id=? AND user_id=?",
                (project_id, user_id),
            ).fetchone()
        return self._project(row) or {}

    def list_projects(
        self,
        *,
        user_id: int,
        kind: str | None = None,
        status: str | None = None,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        clauses = ["user_id=?"]
        params: list[object] = [user_id]
        if kind is not None:
            if kind not in self._PROJECT_KINDS:
                raise ValueError("unsupported project kind")
            clauses.append("kind=?")
            params.append(kind)
        if status is not None:
            if status not in self._PROJECT_STATUSES:
                raise ValueError("unsupported project status")
            clauses.append("status=?")
            params.append(status)
        params.append(max(1, min(int(limit), 100)))
        query = (
            "SELECT * FROM business_projects WHERE "
            + " AND ".join(clauses)
            + " ORDER BY updated_at DESC, id DESC LIMIT ?"
        )
        with closing(self._connect()) as conn, conn:
            rows = conn.execute(query, params).fetchall()
        return [self._project(row) or {} for row in rows]

    def get_project(
        self, *, user_id: int, project_id: str
    ) -> dict[str, Any] | None:
        with closing(self._connect()) as conn, conn:
            row = conn.execute(
                "SELECT * FROM business_projects WHERE id=? AND user_id=?",
                (project_id, user_id),
            ).fetchone()
        return self._project(row)

    def get_project_with_steps(
        self, *, user_id: int, project_id: str
    ) -> dict[str, Any] | None:
        project = self.get_project(user_id=user_id, project_id=project_id)
        if not project:
            return None
        project["steps"] = self.list_steps(
            user_id=user_id, project_id=project_id
        )
        return project

    def update_project(
        self,
        *,
        user_id: int,
        project_id: str,
        revision: int,
        **patch: object,
    ) -> dict[str, Any]:
        allowed = {"title", "goal", "status", "current_stage"}
        updates: list[str] = []
        params: list[object] = []
        for key, value in patch.items():
            if key not in allowed or value is None:
                continue
            if key == "status" and value not in self._PROJECT_STATUSES:
                raise ValueError("unsupported project status")
            text = str(value).strip()
            if key in {"title", "goal"} and not text:
                raise ValueError(f"{key} cannot be empty")
            max_len = 200 if key in {"title", "current_stage"} else 4000
            updates.append(f"{key}=?")
            params.append(text[:max_len])
        if not updates:
            project = self.get_project(user_id=user_id, project_id=project_id)
            if not project:
                raise self.ProjectNotFound()
            return project
        now = _now()
        params.extend([now, project_id, user_id, revision])
        with closing(self._connect()) as conn, conn:
            cursor = conn.execute(
                f"""
                UPDATE business_projects
                SET {", ".join(updates)}, revision=revision+1, updated_at=?
                WHERE id=? AND user_id=? AND revision=?
                """,
                params,
            )
            if cursor.rowcount != 1:
                exists = conn.execute(
                    "SELECT 1 FROM business_projects WHERE id=? AND user_id=?",
                    (project_id, user_id),
                ).fetchone()
                if exists:
                    raise self.RevisionConflict()
                raise self.ProjectNotFound()
            row = conn.execute(
                "SELECT * FROM business_projects WHERE id=? AND user_id=?",
                (project_id, user_id),
            ).fetchone()
        return self._project(row) or {}

    def replace_steps(
        self,
        *,
        user_id: int,
        project_id: str,
        revision: int,
        steps: list[dict[str, object]],
    ) -> list[dict[str, Any]]:
        if len(steps) > 30:
            raise ValueError("too many project steps")
        now = _now()
        with closing(self._connect()) as conn, conn:
            project = conn.execute(
                "SELECT * FROM business_projects WHERE id=? AND user_id=?",
                (project_id, user_id),
            ).fetchone()
            if not project:
                raise self.ProjectNotFound()
            if int(project["revision"]) != revision:
                raise self.RevisionConflict()
            conn.execute(
                "DELETE FROM business_project_steps WHERE project_id=? AND user_id=?",
                (project_id, user_id),
            )
            for index, step in enumerate(steps):
                status = str(step.get("status") or "pending")
                if status not in self._STEP_STATUSES:
                    raise ValueError("unsupported step status")
                title = str(step.get("title") or "").strip()
                stage = str(step.get("stage") or "").strip()
                if not title or not stage:
                    raise ValueError("step stage and title are required")
                conn.execute(
                    """
                    INSERT INTO business_project_steps
                    (id,project_id,user_id,stage,title,status,order_index,
                     linked_view,linked_task_id,linked_artifact_json,
                     blocked_reason,revision,created_at,updated_at)
                    VALUES(?,?,?,?,?,?,?,?,?,? ,?,1,?,?)
                    """,
                    (
                        _id("bstep"),
                        project_id,
                        user_id,
                        stage[:80],
                        title[:300],
                        status,
                        int(step.get("order_index", index)),
                        str(step.get("linked_view") or "")[:200] or None,
                        str(step.get("linked_task_id") or "")[:200] or None,
                        _json(step.get("linked_artifact") or {}),
                        str(step.get("blocked_reason") or "")[:1000] or None,
                        now,
                        now,
                    ),
                )
            first_active = next(
                (
                    str(step.get("stage") or "")
                    for step in steps
                    if step.get("status") == "active"
                ),
                str(steps[0].get("stage") or "") if steps else "",
            )
            cursor = conn.execute(
                """
                UPDATE business_projects
                SET current_stage=?, revision=revision+1, updated_at=?
                WHERE id=? AND user_id=? AND revision=?
                """,
                (first_active[:200], now, project_id, user_id, revision),
            )
            if cursor.rowcount != 1:
                raise self.RevisionConflict()
        return self.list_steps(user_id=user_id, project_id=project_id)

    def list_steps(
        self, *, user_id: int, project_id: str
    ) -> list[dict[str, Any]]:
        with closing(self._connect()) as conn, conn:
            rows = conn.execute(
                """
                SELECT * FROM business_project_steps
                WHERE project_id=? AND user_id=?
                ORDER BY order_index ASC, created_at ASC
                """,
                (project_id, user_id),
            ).fetchall()
        return [self._step(row) or {} for row in rows]

    @classmethod
    def _valid_completion_evidence(
        cls, evidence: dict[str, object] | None
    ) -> bool:
        if not isinstance(evidence, dict):
            return False
        source = evidence.get("source")
        if source not in cls._EVIDENCE_SOURCES:
            return False
        if source == "runtime_terminal":
            return bool(evidence.get("taskId")) and evidence.get("status") == "success"
        if source == "draft_saved":
            return bool(evidence.get("draftId"))
        if source == "geo_score":
            return bool(evidence.get("scoreId") or evidence.get("artifactId"))
        return False

    def update_step(
        self,
        *,
        user_id: int,
        step_id: str,
        revision: int,
        status: str,
        evidence: dict[str, object] | None = None,
        blocked_reason: str | None = None,
        linked_task_id: str | None = None,
    ) -> dict[str, Any]:
        if status not in self._STEP_STATUSES:
            raise ValueError("unsupported step status")
        if status == "completed" and not self._valid_completion_evidence(evidence):
            raise self.InvalidTransition(
                "completed steps require saved draft, terminal task, or GEO score evidence"
            )
        now = _now()
        artifact_json = _json(evidence or {})
        with closing(self._connect()) as conn, conn:
            cursor = conn.execute(
                """
                UPDATE business_project_steps
                SET status=?, linked_artifact_json=?,
                    blocked_reason=?, linked_task_id=COALESCE(?, linked_task_id),
                    revision=revision+1, updated_at=?
                WHERE id=? AND user_id=? AND revision=?
                """,
                (
                    status,
                    artifact_json,
                    (blocked_reason or "")[:1000] or None,
                    (linked_task_id or "")[:200] or None,
                    now,
                    step_id,
                    user_id,
                    revision,
                ),
            )
            if cursor.rowcount != 1:
                exists = conn.execute(
                    "SELECT 1 FROM business_project_steps WHERE id=? AND user_id=?",
                    (step_id, user_id),
                ).fetchone()
                if exists:
                    raise self.RevisionConflict()
                raise self.StepNotFound()
            row = conn.execute(
                "SELECT * FROM business_project_steps WHERE id=? AND user_id=?",
                (step_id, user_id),
            ).fetchone()
            if row:
                conn.execute(
                    "UPDATE business_projects SET updated_at=? WHERE id=? AND user_id=?",
                    (now, row["project_id"], user_id),
                )
        return self._step(row) or {}

    def append_message(
        self,
        *,
        user_id: int,
        project_id: str,
        assistant_id: str,
        role: str,
        content: str,
        metadata: dict[str, object] | None = None,
    ) -> dict[str, Any]:
        if role not in {"user", "assistant", "system"}:
            raise ValueError("unsupported message role")
        clean_content = content.strip()
        if not clean_content:
            raise ValueError("message content is required")
        message_id = _id("bmsg")
        now = _now()
        with closing(self._connect()) as conn, conn:
            project = conn.execute(
                "SELECT assistant_id FROM business_projects WHERE id=? AND user_id=?",
                (project_id, user_id),
            ).fetchone()
            if not project:
                raise self.ProjectNotFound()
            if project["assistant_id"] != assistant_id:
                raise ValueError("assistant does not match project")
            conn.execute(
                """
                INSERT INTO business_assistant_messages
                (id,project_id,user_id,assistant_id,role,content,metadata_json,created_at)
                VALUES(?,?,?,?,?,?,?,?)
                """,
                (
                    message_id,
                    project_id,
                    user_id,
                    assistant_id,
                    role,
                    clean_content[:40_000],
                    _json(metadata or {}),
                    now,
                ),
            )
            row = conn.execute(
                "SELECT * FROM business_assistant_messages WHERE id=? AND user_id=?",
                (message_id, user_id),
            ).fetchone()
        return self._message(row) or {}

    def list_messages(
        self,
        *,
        user_id: int,
        project_id: str,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        with closing(self._connect()) as conn, conn:
            project = conn.execute(
                "SELECT 1 FROM business_projects WHERE id=? AND user_id=?",
                (project_id, user_id),
            ).fetchone()
            if not project:
                return []
            rows = conn.execute(
                """
                SELECT * FROM business_assistant_messages
                WHERE project_id=? AND user_id=?
                ORDER BY created_at DESC, id DESC LIMIT ?
                """,
                (project_id, user_id, max(1, min(int(limit), 100))),
            ).fetchall()
        return [self._message(row) or {} for row in reversed(rows)]


_default_store: BusinessAssistantStore | None = None


def get_business_assistant_store() -> BusinessAssistantStore:
    global _default_store
    configured = (os.getenv("CREDIT_DB_OVERRIDE") or "").strip()
    if _default_store is None or (
        configured and os.path.abspath(_default_store.db_path) != os.path.abspath(configured)
    ):
        _default_store = BusinessAssistantStore(configured or None)
    return _default_store

"""GEO 内容矩阵项目 CRUD（SQLite）。"""
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Optional

from fastapi import HTTPException

from lib.db import connect, transaction

DEFAULT_PLATFORMS = ["xiaohongshu", "douyin", "zhihu"]
EMPTY_MATRIX: dict[str, Any] = {"platforms": []}

_SCHEMA_READY = False


def _ensure_schema() -> None:
    """首次 CRUD 前幂等迁移（与 main.ensure_app_schema 双保险）。"""
    global _SCHEMA_READY
    if _SCHEMA_READY:
        return
    from scripts.init_credit_db import migrate

    conn = connect()
    try:
        migrate(conn)
        _SCHEMA_READY = True
    finally:
        conn.close()


def _now() -> int:
    return int(time.time())


def _parse_json(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return fallback


def _row_to_dict(row) -> dict[str, Any]:
    keys = row.keys() if hasattr(row, "keys") else []
    provider = row["provider"] if "provider" in keys else "deepseek"
    return {
        "id": row["id"],
        "userId": row["user_id"],
        "name": row["name"],
        "platforms": _parse_json(row["platforms_json"], []),
        "modelSkillId": row["model_skill_id"],
        "viralSkillIds": _parse_json(row["viral_skill_ids_json"], []),
        "enterpriseSkillId": row["enterprise_skill_id"],
        "enterpriseSnapshot": row["enterprise_snapshot"],
        "provider": provider or "deepseek",
        "matrix": _parse_json(row["matrix_json"], EMPTY_MATRIX),
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


def list_projects(user_id: int) -> list[dict[str, Any]]:
    _ensure_schema()
    with transaction() as conn:
        rows = conn.execute(
            "SELECT * FROM geo_matrix_projects WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_project(project_id: str, user_id: int) -> dict[str, Any]:
    _ensure_schema()
    with transaction() as conn:
        row = conn.execute(
            "SELECT * FROM geo_matrix_projects WHERE id = ? AND user_id = ?",
            (project_id, user_id),
        ).fetchone()
    if row is None:
        raise HTTPException(
            status_code=404,
            detail={"code": "NOT_FOUND", "message": "项目不存在"},
        )
    return _row_to_dict(row)


def create_project(
    *,
    user_id: int,
    name: str,
    platforms: Optional[list[str]] = None,
) -> dict[str, Any]:
    _ensure_schema()
    project_id = f"geo-mx-{uuid.uuid4().hex[:12]}"
    now = _now()
    plat = platforms if platforms else list(DEFAULT_PLATFORMS)
    if not plat:
        plat = list(DEFAULT_PLATFORMS)
    with transaction() as conn:
        conn.execute(
            """
            INSERT INTO geo_matrix_projects (
                id, user_id, name, platforms_json, model_skill_id,
                viral_skill_ids_json, enterprise_skill_id, enterprise_snapshot,
                matrix_json, provider, created_at, updated_at
            ) VALUES (?, ?, ?, ?, NULL, '[]', NULL, NULL, ?, 'deepseek', ?, ?)
            """,
            (
                project_id,
                user_id,
                name.strip() or "未命名项目",
                json.dumps(plat, ensure_ascii=False),
                json.dumps(EMPTY_MATRIX, ensure_ascii=False),
                now,
                now,
            ),
        )
    return get_project(project_id, user_id)


def update_project(
    project_id: str,
    user_id: int,
    *,
    name: Optional[str] = None,
    platforms: Optional[list[str]] = None,
    model_skill_id: Optional[str] = None,
    viral_skill_ids: Optional[list[str]] = None,
    enterprise_skill_id: Optional[str] = None,
    enterprise_snapshot: Optional[str] = None,
    matrix: Optional[dict[str, Any]] = None,
    clear_enterprise_snapshot: bool = False,
    provider: Optional[str] = None,
) -> dict[str, Any]:
    existing = get_project(project_id, user_id)
    now = _now()

    new_name = name.strip() if name is not None else existing["name"]
    new_platforms = platforms if platforms is not None else existing["platforms"]
    new_model = model_skill_id if model_skill_id is not None else existing["modelSkillId"]
    new_viral = viral_skill_ids if viral_skill_ids is not None else existing["viralSkillIds"]
    new_ent_id = (
        enterprise_skill_id if enterprise_skill_id is not None else existing["enterpriseSkillId"]
    )
    if clear_enterprise_snapshot:
        new_ent_snap = None
    elif enterprise_snapshot is not None:
        new_ent_snap = enterprise_snapshot
    else:
        new_ent_snap = existing["enterpriseSnapshot"]
    new_matrix = matrix if matrix is not None else existing["matrix"]
    new_provider = provider if provider is not None else existing.get("provider", "deepseek")

    with transaction() as conn:
        conn.execute(
            """
            UPDATE geo_matrix_projects SET
                name = ?,
                platforms_json = ?,
                model_skill_id = ?,
                viral_skill_ids_json = ?,
                enterprise_skill_id = ?,
                enterprise_snapshot = ?,
                matrix_json = ?,
                provider = ?,
                updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                new_name,
                json.dumps(new_platforms, ensure_ascii=False),
                new_model,
                json.dumps(new_viral or [], ensure_ascii=False),
                new_ent_id,
                new_ent_snap,
                json.dumps(new_matrix, ensure_ascii=False),
                new_provider,
                now,
                project_id,
                user_id,
            ),
        )
    return get_project(project_id, user_id)


def delete_project(project_id: str, user_id: int) -> None:
    _ensure_schema()
    with transaction() as conn:
        cur = conn.execute(
            "DELETE FROM geo_matrix_projects WHERE id = ? AND user_id = ?",
            (project_id, user_id),
        )
        if cur.rowcount == 0:
            raise HTTPException(
                status_code=404,
                detail={"code": "NOT_FOUND", "message": "项目不存在"},
            )


def replace_matrix(
    project_id: str,
    user_id: int,
    matrix: dict[str, Any],
    *,
    enterprise_snapshot: Optional[str] = None,
    model_skill_id: Optional[str] = None,
    viral_skill_ids: Optional[list[str]] = None,
    enterprise_skill_id: Optional[str] = None,
    platforms: Optional[list[str]] = None,
) -> dict[str, Any]:
    """事务内替换 matrix_json（生成成功时调用）。"""
    with transaction() as conn:
        row = conn.execute(
            "SELECT * FROM geo_matrix_projects WHERE id = ? AND user_id = ?",
            (project_id, user_id),
        ).fetchone()
        if row is None:
            raise HTTPException(
                status_code=404,
                detail={"code": "NOT_FOUND", "message": "项目不存在"},
            )
        now = _now()
        conn.execute(
            """
            UPDATE geo_matrix_projects SET
                matrix_json = ?,
                enterprise_snapshot = COALESCE(?, enterprise_snapshot),
                model_skill_id = COALESCE(?, model_skill_id),
                viral_skill_ids_json = COALESCE(?, viral_skill_ids_json),
                enterprise_skill_id = COALESCE(?, enterprise_skill_id),
                platforms_json = COALESCE(?, platforms_json),
                updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                json.dumps(matrix, ensure_ascii=False),
                enterprise_snapshot,
                model_skill_id,
                json.dumps(viral_skill_ids, ensure_ascii=False) if viral_skill_ids is not None else None,
                enterprise_skill_id,
                json.dumps(platforms, ensure_ascii=False) if platforms is not None else None,
                now,
                project_id,
                user_id,
            ),
        )
    return get_project(project_id, user_id)

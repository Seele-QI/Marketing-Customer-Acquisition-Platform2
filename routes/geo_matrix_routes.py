"""GEO 内容矩阵项目 API 路由。"""
from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from lib.api_auth import require_user
from lib.geo_matrix_store import (
    create_project,
    delete_project,
    get_project,
    list_projects,
    update_project,
)

router = APIRouter()


class CreateMatrixProjectBody(BaseModel):
    name: str = Field(default="未命名项目", max_length=120)
    platforms: Optional[list[str]] = None


class PatchMatrixProjectBody(BaseModel):
    name: Optional[str] = Field(default=None, max_length=120)
    platforms: Optional[list[str]] = None
    modelSkillId: Optional[str] = None
    viralSkillIds: Optional[list[str]] = None
    enterpriseSkillId: Optional[str] = None
    enterpriseSnapshot: Optional[str] = None
    matrix: Optional[dict[str, Any]] = None
    clearEnterpriseSnapshot: bool = False
    provider: Optional[str] = None


@router.get("/api/geo/matrix-projects")
async def geo_matrix_list(request: Request):
    user = require_user(request)
    projects = list_projects(user.id)
    return {"projects": projects}


@router.post("/api/geo/matrix-projects")
async def geo_matrix_create(request: Request, body: CreateMatrixProjectBody):
    user = require_user(request)
    project = create_project(
        user_id=user.id,
        name=body.name,
        platforms=body.platforms,
    )
    return {"project": project}


@router.get("/api/geo/matrix-projects/{project_id}")
async def geo_matrix_get(project_id: str, request: Request):
    user = require_user(request)
    project = get_project(project_id, user.id)
    return {"project": project}


@router.patch("/api/geo/matrix-projects/{project_id}")
async def geo_matrix_patch(project_id: str, request: Request, body: PatchMatrixProjectBody):
    user = require_user(request)
    project = update_project(
        project_id,
        user.id,
        name=body.name,
        platforms=body.platforms,
        model_skill_id=body.modelSkillId,
        viral_skill_ids=body.viralSkillIds,
        enterprise_skill_id=body.enterpriseSkillId,
        enterprise_snapshot=body.enterpriseSnapshot,
        matrix=body.matrix,
        clear_enterprise_snapshot=body.clearEnterpriseSnapshot,
        provider=body.provider,
    )
    return {"project": project}


@router.delete("/api/geo/matrix-projects/{project_id}")
async def geo_matrix_delete(project_id: str, request: Request):
    user = require_user(request)
    delete_project(project_id, user.id)
    return {"ok": True}

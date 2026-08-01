"""Authenticated business-project and assistant-message APIs."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from lib.api_auth import require_user
from lib.business_assistant_store import (
    BusinessAssistantStore,
    get_business_assistant_store,
)


router = APIRouter()


def _store() -> BusinessAssistantStore:
    return get_business_assistant_store()


def _error(exc: Exception) -> HTTPException:
    if isinstance(
        exc,
        (BusinessAssistantStore.ProjectNotFound, BusinessAssistantStore.StepNotFound),
    ):
        return HTTPException(
            status_code=404,
            detail={"code": "BUSINESS_PROJECT_NOT_FOUND", "message": "业务项目不存在"},
        )
    if isinstance(exc, BusinessAssistantStore.RevisionConflict):
        return HTTPException(
            status_code=409,
            detail={
                "code": "BUSINESS_PROJECT_REVISION_CONFLICT",
                "message": "项目已在其他位置更新，请刷新后重试",
            },
        )
    if isinstance(exc, BusinessAssistantStore.InvalidTransition):
        return HTTPException(
            status_code=422,
            detail={
                "code": "BUSINESS_STEP_EVIDENCE_REQUIRED",
                "message": str(exc),
            },
        )
    if isinstance(exc, ValueError):
        return HTTPException(
            status_code=400,
            detail={"code": "BUSINESS_PROJECT_INVALID_INPUT", "message": str(exc)},
        )
    return HTTPException(
        status_code=500,
        detail={"code": "BUSINESS_PROJECT_STORE_FAILED", "message": "业务项目操作失败"},
    )


def _step_json(step: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": step["id"],
        "projectId": step["project_id"],
        "stage": step["stage"],
        "title": step["title"],
        "status": step["status"],
        "orderIndex": step["order_index"],
        "linkedView": step.get("linked_view"),
        "linkedTaskId": step.get("linked_task_id"),
        "linkedArtifact": step.get("linked_artifact") or {},
        "blockedReason": step.get("blocked_reason"),
        "revision": step["revision"],
        "createdAt": step["created_at"],
        "updatedAt": step["updated_at"],
    }


def _project_json(project: dict[str, Any], *, include_steps: bool = True) -> dict[str, Any]:
    value = {
        "id": project["id"],
        "kind": project["kind"],
        "title": project["title"],
        "goal": project["goal"],
        "status": project["status"],
        "currentStage": project["current_stage"],
        "assistantId": project["assistant_id"],
        "revision": project["revision"],
        "createdAt": project["created_at"],
        "updatedAt": project["updated_at"],
    }
    if include_steps:
        value["steps"] = [
            _step_json(step) for step in project.get("steps", [])
        ]
    return value


def _message_json(message: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": message["id"],
        "projectId": message["project_id"],
        "assistantId": message["assistant_id"],
        "role": message["role"],
        "content": message["content"],
        "metadata": message.get("metadata") or {},
        "createdAt": message["created_at"],
    }


class CreateProjectBody(BaseModel):
    kind: Literal["video", "geo"]
    title: str = Field(min_length=1, max_length=200)
    goal: str = Field(min_length=1, max_length=4000)
    assistantId: Literal["video-creation", "geo-growth"]


class UpdateProjectBody(BaseModel):
    revision: int = Field(ge=1)
    title: str | None = Field(default=None, max_length=200)
    goal: str | None = Field(default=None, max_length=4000)
    status: Literal["active", "paused", "completed", "archived"] | None = None
    currentStage: str | None = Field(default=None, max_length=200)


class StepBody(BaseModel):
    stage: str = Field(min_length=1, max_length=80)
    title: str = Field(min_length=1, max_length=300)
    status: Literal["pending", "active", "blocked", "completed"] = "pending"
    orderIndex: int = Field(ge=0, le=1000)
    linkedView: str | None = Field(default=None, max_length=200)
    linkedTaskId: str | None = Field(default=None, max_length=200)
    linkedArtifact: dict[str, Any] = Field(default_factory=dict)
    blockedReason: str | None = Field(default=None, max_length=1000)


class ReplaceStepsBody(BaseModel):
    revision: int = Field(ge=1)
    steps: list[StepBody] = Field(default_factory=list, max_length=30)


class UpdateStepBody(BaseModel):
    revision: int = Field(ge=1)
    status: Literal["pending", "active", "blocked", "completed"]
    evidence: dict[str, Any] | None = None
    blockedReason: str | None = Field(default=None, max_length=1000)
    linkedTaskId: str | None = Field(default=None, max_length=200)


class CreateMessageBody(BaseModel):
    assistantId: Literal["video-creation", "geo-growth"]
    role: Literal["user", "assistant", "system"]
    content: str = Field(min_length=1, max_length=40_000)
    metadata: dict[str, Any] = Field(default_factory=dict)


@router.get("/api/business-assistant/projects")
async def list_projects(
    request: Request,
    kind: Literal["video", "geo"] | None = None,
    status: Literal["active", "paused", "completed", "archived"] | None = None,
    limit: int = Query(default=30, ge=1, le=100),
):
    user = require_user(request)
    projects = _store().list_projects(
        user_id=user.id, kind=kind, status=status, limit=limit
    )
    return {"projects": [_project_json(project, include_steps=False) for project in projects]}


@router.post("/api/business-assistant/projects")
async def create_project(request: Request, body: CreateProjectBody):
    user = require_user(request)
    try:
        project = _store().create_project(
            user_id=user.id,
            kind=body.kind,
            title=body.title,
            goal=body.goal,
            assistant_id=body.assistantId,
        )
    except Exception as exc:
        raise _error(exc) from exc
    project["steps"] = []
    return {"project": _project_json(project)}


@router.get("/api/business-assistant/projects/{project_id}")
async def get_project(project_id: str, request: Request):
    user = require_user(request)
    project = _store().get_project_with_steps(
        user_id=user.id, project_id=project_id
    )
    if not project:
        raise _error(BusinessAssistantStore.ProjectNotFound())
    return {
        "project": _project_json(project),
        "messages": [
            _message_json(message)
            for message in _store().list_messages(
                user_id=user.id, project_id=project_id, limit=30
            )
        ],
    }


@router.patch("/api/business-assistant/projects/{project_id}")
async def update_project(
    project_id: str, request: Request, body: UpdateProjectBody
):
    user = require_user(request)
    try:
        project = _store().update_project(
            user_id=user.id,
            project_id=project_id,
            revision=body.revision,
            title=body.title,
            goal=body.goal,
            status=body.status,
            current_stage=body.currentStage,
        )
    except Exception as exc:
        raise _error(exc) from exc
    project["steps"] = _store().list_steps(
        user_id=user.id, project_id=project_id
    )
    return {"project": _project_json(project)}


@router.put("/api/business-assistant/projects/{project_id}/steps")
async def replace_steps(
    project_id: str, request: Request, body: ReplaceStepsBody
):
    user = require_user(request)
    raw_steps = [
        {
            "stage": step.stage,
            "title": step.title,
            "status": step.status,
            "order_index": step.orderIndex,
            "linked_view": step.linkedView,
            "linked_task_id": step.linkedTaskId,
            "linked_artifact": step.linkedArtifact,
            "blocked_reason": step.blockedReason,
        }
        for step in body.steps
    ]
    try:
        steps = _store().replace_steps(
            user_id=user.id,
            project_id=project_id,
            revision=body.revision,
            steps=raw_steps,
        )
    except Exception as exc:
        raise _error(exc) from exc
    project = _store().get_project_with_steps(
        user_id=user.id, project_id=project_id
    )
    return {
        "project": _project_json(project or {}),
        "steps": [_step_json(step) for step in steps],
    }


@router.patch("/api/business-assistant/steps/{step_id}")
async def update_step(step_id: str, request: Request, body: UpdateStepBody):
    user = require_user(request)
    try:
        step = _store().update_step(
            user_id=user.id,
            step_id=step_id,
            revision=body.revision,
            status=body.status,
            evidence=body.evidence,
            blocked_reason=body.blockedReason,
            linked_task_id=body.linkedTaskId,
        )
    except Exception as exc:
        raise _error(exc) from exc
    return {"step": _step_json(step)}


@router.get("/api/business-assistant/projects/{project_id}/messages")
async def list_messages(
    project_id: str,
    request: Request,
    limit: int = Query(default=30, ge=1, le=100),
):
    user = require_user(request)
    project = _store().get_project(user_id=user.id, project_id=project_id)
    if not project:
        raise _error(BusinessAssistantStore.ProjectNotFound())
    return {
        "messages": [
            _message_json(message)
            for message in _store().list_messages(
                user_id=user.id, project_id=project_id, limit=limit
            )
        ]
    }


@router.post("/api/business-assistant/projects/{project_id}/messages")
async def append_message(
    project_id: str, request: Request, body: CreateMessageBody
):
    user = require_user(request)
    try:
        message = _store().append_message(
            user_id=user.id,
            project_id=project_id,
            assistant_id=body.assistantId,
            role=body.role,
            content=body.content,
            metadata=body.metadata,
        )
    except Exception as exc:
        raise _error(exc) from exc
    return {"message": _message_json(message)}

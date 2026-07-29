"""Authenticated FastAPI endpoints for durable enterprise-agent state."""
from __future__ import annotations

import hmac
import os
import time
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from lib.api_auth import require_user
from lib.agent_team_store import AgentTeamStore, get_agent_team_store


router = APIRouter()


def _store() -> AgentTeamStore:
    return get_agent_team_store()


def _require_internal(request: Request) -> None:
    expected = (os.getenv("CREDIT_METERED_KEY") or "").strip()
    provided = (request.headers.get("X-Metered-Key") or "").strip()
    if not expected:
        raise HTTPException(status_code=503, detail={"code": "AGENT_INTERNAL_NOT_READY", "message": "内部智能体通道尚未配置"})
    if not provided or not hmac.compare_digest(provided, expected):
        raise HTTPException(status_code=403, detail={"code": "AGENT_INTERNAL_FORBIDDEN", "message": "无权调用内部智能体接口"})


def _store_error(exc: Exception) -> HTTPException:
    if isinstance(exc, AgentTeamStore.NotFound):
        return HTTPException(status_code=404, detail={"code": "AGENT_RESOURCE_NOT_FOUND", "message": "记录不存在"})
    if isinstance(exc, AgentTeamStore.RevisionConflict):
        return HTTPException(status_code=409, detail={"code": "AGENT_REVISION_CONFLICT", "message": "记录已更新，请刷新后重试"})
    if isinstance(exc, AgentTeamStore.ApprovalExpired):
        return HTTPException(status_code=409, detail={"code": "APPROVAL_EXPIRED", "message": "审批已过期"})
    if isinstance(exc, AgentTeamStore.ApprovalNotGranted):
        return HTTPException(status_code=409, detail={"code": "APPROVAL_NOT_GRANTED", "message": "操作尚未获批"})
    if isinstance(exc, AgentTeamStore.ParameterMismatch):
        return HTTPException(status_code=409, detail={"code": "APPROVAL_PARAMETER_MISMATCH", "message": "执行参数与审批参数不一致"})
    if isinstance(exc, AgentTeamStore.ImmutableEvidence):
        return HTTPException(status_code=409, detail={"code": "EXECUTION_EVIDENCE_IMMUTABLE", "message": "执行证据已经写入且不可覆盖"})
    if isinstance(exc, ValueError):
        return HTTPException(status_code=400, detail={"code": "AGENT_INVALID_INPUT", "message": str(exc)})
    return HTTPException(status_code=500, detail={"code": "AGENT_STORE_FAILED", "message": "智能体数据操作失败"})


def _public_payload(value: Any) -> Any:
    """Remove server-only provider routing data from browser-readable history."""
    if isinstance(value, list):
        return [_public_payload(item) for item in value]
    if not isinstance(value, dict):
        return value
    route_snapshots = value.get("routeSnapshots")
    public = {
        key: _public_payload(item)
        for key, item in value.items()
        if key not in {"providerName", "model", "route", "routeSnapshots"}
    }
    if isinstance(route_snapshots, list):
        public["modelRouting"] = {"source": "server", "successfulCalls": len(route_snapshots)}
    return public


def _public_run(run: dict[str, Any]) -> dict[str, Any]:
    public = {key: value for key, value in run.items() if key != "user_id"}
    public["result"] = _public_payload(run.get("result", {}))
    return public


def _public_event(event: dict[str, Any]) -> dict[str, Any]:
    return {
        key: (_public_payload(value) if key == "payload" else value)
        for key, value in event.items()
        if key not in {"user_id", "payload_json"}
    }


class CreateRunBody(BaseModel):
    agentId: str = Field(min_length=1, max_length=80)
    prompt: str = Field(min_length=1, max_length=40_000)


class UpdateRunBody(BaseModel):
    revision: int = Field(ge=1)
    status: Literal["queued", "preparing", "running", "needs_review", "partial", "completed", "failed", "cancelled"]
    result: dict[str, Any] = Field(default_factory=dict)


class EventBody(BaseModel):
    eventType: str = Field(min_length=1, max_length=80)
    payload: dict[str, Any] = Field(default_factory=dict)


class KnowledgeImportBody(BaseModel):
    scope: Literal["task", "department", "company"]
    departmentId: str | None = Field(default=None, max_length=80)
    taskId: str | None = Field(default=None, max_length=80)
    name: str = Field(min_length=1, max_length=300)
    text: str = Field(min_length=1, max_length=100_000)
    sourceType: str = Field(default="upload", max_length=40)


class KnowledgeSearchBody(BaseModel):
    query: str = Field(default="", max_length=500)
    scope: Literal["task", "department", "company"] | None = None
    departmentId: str | None = Field(default=None, max_length=80)
    taskId: str | None = Field(default=None, max_length=80)
    limit: int = Field(default=12, ge=1, le=50)


class ApprovalCreateBody(BaseModel):
    runId: str = Field(min_length=1, max_length=80)
    actionType: str = Field(min_length=1, max_length=80)
    parameters: dict[str, Any]
    ttlSeconds: int = Field(default=900, ge=30, le=86_400)


class ApprovalDecisionBody(BaseModel):
    revision: int = Field(ge=1)
    decision: Literal["approved", "rejected"]
    decidedBy: str = Field(min_length=1, max_length=120)
    note: str = Field(default="", max_length=1000)


class ExecutionEvidenceBody(BaseModel):
    parameters: dict[str, Any]
    status: Literal["completed", "failed", "uncertain"]
    evidence: dict[str, Any] = Field(default_factory=dict)


@router.post("/api/agent-team/runs")
async def create_run(request: Request, body: CreateRunBody):
    user = require_user(request)
    return {"run": _store().create_run(user_id=user.id, agent_id=body.agentId, prompt=body.prompt)}


@router.get("/api/agent-team/runs")
async def list_runs(request: Request, status: str | None = Query(default=None, max_length=40), limit: int = Query(default=50, ge=1, le=200)):
    user = require_user(request)
    return {"runs": [_public_run(run) for run in _store().list_runs(user_id=user.id, status=status, limit=limit)]}


@router.get("/api/agent-team/runs/{run_id}")
async def get_run(run_id: str, request: Request):
    user = require_user(request)
    run = _store().get_run(user_id=user.id, run_id=run_id)
    if not run:
        raise _store_error(AgentTeamStore.NotFound())
    return {
        "run": _public_run(run),
        "events": [_public_event(event) for event in _store().list_events(user_id=user.id, run_id=run_id)],
    }


@router.patch("/api/agent-team/runs/{run_id}")
async def update_run(run_id: str, request: Request, body: UpdateRunBody):
    user = require_user(request)
    _require_internal(request)
    try:
        run = _store().update_run(user_id=user.id, run_id=run_id, expected_revision=body.revision, status=body.status, result=body.result)
    except Exception as exc:
        raise _store_error(exc) from exc
    return {"run": run}


@router.post("/api/agent-team/runs/{run_id}/cancel")
async def cancel_run(run_id: str, request: Request, revision: int = Query(ge=1)):
    user = require_user(request)
    try:
        run = _store().update_run(user_id=user.id, run_id=run_id, expected_revision=revision, status="cancelled")
    except Exception as exc:
        raise _store_error(exc) from exc
    return {"run": run}


@router.post("/api/agent-team/runs/{run_id}/events")
async def append_event(run_id: str, request: Request, body: EventBody):
    user = require_user(request)
    _require_internal(request)
    try:
        event = _store().append_event(user_id=user.id, run_id=run_id, event_type=body.eventType, payload=body.payload)
    except Exception as exc:
        raise _store_error(exc) from exc
    return {"event": event}


@router.post("/api/agent-team/knowledge/import")
async def import_knowledge(request: Request, body: KnowledgeImportBody):
    user = require_user(request)
    try:
        document = _store().import_knowledge(user_id=user.id, scope=body.scope, department_id=body.departmentId, task_id=body.taskId, name=body.name, text=body.text, source_type=body.sourceType)
    except Exception as exc:
        raise _store_error(exc) from exc
    return {"document": document}


@router.post("/api/agent-team/knowledge/search")
async def search_knowledge(request: Request, body: KnowledgeSearchBody):
    user = require_user(request)
    _require_internal(request)
    return {"items": _store().search_knowledge(user_id=user.id, query=body.query, scope=body.scope, department_id=body.departmentId, task_id=body.taskId, limit=body.limit)}


@router.post("/api/agent-team/approvals")
async def create_approval(request: Request, body: ApprovalCreateBody):
    user = require_user(request)
    _require_internal(request)
    try:
        approval = _store().create_approval(user_id=user.id, run_id=body.runId, action_type=body.actionType, parameters=body.parameters, expires_at=int(time.time()) + body.ttlSeconds)
    except Exception as exc:
        raise _store_error(exc) from exc
    return {"approval": approval}


@router.get("/api/agent-team/approvals/{approval_id}")
async def get_approval(approval_id: str, request: Request):
    user = require_user(request)
    approval = _store().get_approval(user_id=user.id, approval_id=approval_id)
    if not approval:
        raise _store_error(AgentTeamStore.NotFound())
    return {
        "approval": approval,
        "executionEvidence": _store().get_execution_evidence(
            user_id=user.id,
            approval_id=approval_id,
        ),
    }


@router.post("/api/agent-team/approvals/{approval_id}/decision")
async def decide_approval(approval_id: str, request: Request, body: ApprovalDecisionBody):
    user = require_user(request)
    try:
        approval = _store().decide_approval(user_id=user.id, approval_id=approval_id, expected_revision=body.revision, decision=body.decision, decided_by=body.decidedBy, note=body.note)
    except Exception as exc:
        raise _store_error(exc) from exc
    return {"approval": approval}


@router.post("/api/agent-team/approvals/{approval_id}/execution-evidence")
async def execution_evidence(approval_id: str, request: Request, body: ExecutionEvidenceBody):
    user = require_user(request)
    _require_internal(request)
    try:
        evidence = _store().record_execution_evidence(user_id=user.id, approval_id=approval_id, parameters=body.parameters, status=body.status, evidence=body.evidence)
    except Exception as exc:
        raise _store_error(exc) from exc
    return {"evidence": evidence}

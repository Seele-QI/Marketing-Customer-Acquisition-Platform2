"""Authenticated API for account-level long-term user memory."""
from __future__ import annotations

import json
import os
from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from lib.api_auth import require_user
from lib.user_memory_service import (
    MemoryCandidate,
    UserMemoryService,
    sanitize_sensitive_text,
)
from lib.user_memory_store import MemoryEvent, MemoryItem, UserMemoryStore, get_user_memory_store


router = APIRouter()


class ObserveBody(BaseModel):
    scope: Literal["copywriting", "positioning", "video", "geo"] = "copywriting"
    sessionId: str = Field(min_length=1, max_length=160)
    messageId: str = Field(min_length=1, max_length=160)
    text: str = Field(min_length=1, max_length=12000)


class CandidateBody(BaseModel):
    operation: Literal["create", "reinforce", "supersede", "ignore"]
    scope: Literal["global", "copywriting", "positioning", "video", "geo"]
    category: Literal["identity", "business", "goal", "preference", "constraint", "fact"]
    memoryKey: str = Field(min_length=1, max_length=80)
    value: str | list[str]
    confidence: float = Field(ge=0, le=1)
    stable: bool
    evidence: str = Field(default="", max_length=1000)


class ConsolidateBody(BaseModel):
    observationIds: list[str] = Field(default_factory=list, max_length=50)
    candidates: list[CandidateBody] = Field(default_factory=list, max_length=50)
    retryableFailure: bool = False
    errorCode: str = Field(default="MEMORY_EXTRACTION_FAILED", max_length=80)


class RetrieveBody(BaseModel):
    scope: Literal["copywriting", "positioning", "video", "geo"]
    query: str = Field(default="", max_length=12000)
    agentName: str | None = Field(default=None, max_length=120)
    maxItems: int = Field(default=12, ge=0, le=50)
    maxChars: int = Field(default=3000, ge=0, le=12000)


class PatchItemBody(BaseModel):
    revision: int = Field(ge=1)
    value: str | list[str] | None = None
    pinned: bool | None = None


class RevisionBody(BaseModel):
    revision: int = Field(ge=1)


class PatchSettingsBody(BaseModel):
    enabled: bool | None = None
    scopeEnabled: dict[str, bool] | None = None


class LegacyMemoryBody(BaseModel):
    industry: str = Field(default="", max_length=500)
    role: str = Field(default="", max_length=500)
    goals: list[str] = Field(default_factory=list, max_length=20)
    preferences: list[str] = Field(default_factory=list, max_length=20)
    facts: list[str] = Field(default_factory=list, max_length=30)


class LegacyImportBody(BaseModel):
    memory: LegacyMemoryBody


def _store() -> UserMemoryStore:
    return get_user_memory_store()


def _service() -> UserMemoryService:
    return UserMemoryService(_store())


def _require_internal(request: Request) -> None:
    expected = (os.getenv("CREDIT_METERED_KEY") or "").strip()
    provided = (request.headers.get("X-Metered-Key") or "").strip()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail={"code": "MEMORY_INTERNAL_NOT_READY", "message": "服务端记忆通道尚未配置"},
        )
    if not provided or provided != expected:
        raise HTTPException(
            status_code=403,
            detail={"code": "MEMORY_INTERNAL_FORBIDDEN", "message": "无权调用内部记忆接口"},
        )


def _item_json(item: MemoryItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "scope": item.scope,
        "category": item.category,
        "memoryKey": item.memory_key,
        "value": item.value,
        "status": item.status,
        "source": item.source,
        "confidence": item.confidence,
        "strength": item.strength,
        "pinned": item.pinned,
        "revision": item.revision,
        "firstSeenAt": item.first_seen_at,
        "lastConfirmedAt": item.last_confirmed_at,
        "createdAt": item.created_at,
        "updatedAt": item.updated_at,
    }


def _event_json(event: MemoryEvent) -> dict[str, Any]:
    return {
        "id": event.id,
        "itemId": event.item_id,
        "eventType": event.event_type,
        "oldValue": json.loads(event.old_value_json) if event.old_value_json else None,
        "newValue": json.loads(event.new_value_json) if event.new_value_json else None,
        "metadata": json.loads(event.metadata_json),
        "createdAt": event.created_at,
    }


def _settings_json(settings) -> dict[str, Any]:
    return {
        "enabled": settings.enabled,
        "scopeEnabled": settings.scope_enabled,
        "legacyImportedAt": settings.legacy_imported_at,
        "updatedAt": settings.updated_at,
    }


def _translate_store_error(exc: Exception) -> HTTPException:
    if isinstance(exc, UserMemoryStore.RevisionConflict):
        return HTTPException(
            status_code=409,
            detail={"code": "MEMORY_REVISION_CONFLICT", "message": "记忆已在其他设备更新，请刷新后重试"},
        )
    if isinstance(exc, UserMemoryStore.ItemNotFound):
        return HTTPException(
            status_code=404,
            detail={"code": "MEMORY_NOT_FOUND", "message": "记忆不存在"},
        )
    if isinstance(exc, UserMemoryStore.ActiveMemoryExists):
        return HTTPException(
            status_code=409,
            detail={"code": "MEMORY_ACTIVE_CONFLICT", "message": "同类有效记忆已存在"},
        )
    return HTTPException(
        status_code=500,
        detail={"code": "MEMORY_OPERATION_FAILED", "message": "记忆操作失败"},
    )


@router.post("/api/memory/observe")
async def observe_memory(request: Request, body: ObserveBody):
    user = require_user(request)
    sanitized = sanitize_sensitive_text(body.text)
    receipt = _store().observe_user_message(
        user_id=user.id,
        scope=body.scope,
        session_id=body.sessionId,
        message_id=body.messageId,
        text=sanitized.redacted_text,
    )
    claimed = _store().claim_observation_batch(user_id=user.id, scope=body.scope, limit=10)
    return {
        "observationId": receipt.observation_id,
        "created": receipt.created,
        "claimed": [
            {"id": row.id, "scope": row.scope, "text": row.text, "messageId": row.message_id}
            for row in claimed
        ],
    }


@router.post("/api/memory/consolidate")
async def consolidate_memory(request: Request, body: ConsolidateBody):
    user = require_user(request)
    _require_internal(request)
    if body.retryableFailure:
        _store().fail_observations(
            user_id=user.id,
            observation_ids=body.observationIds,
            retryable=True,
            error_code=body.errorCode,
        )
        return {"failed": True, "retryable": True}
    candidates = [
        MemoryCandidate(
            operation=row.operation,
            scope=row.scope,
            category=row.category,
            memory_key=row.memoryKey,
            value=row.value,
            confidence=row.confidence,
            stable=row.stable,
            evidence=row.evidence,
        )
        for row in body.candidates
    ]
    result = _service().consolidate_candidates(
        user_id=user.id,
        observation_ids=body.observationIds,
        candidates=candidates,
    )
    return {
        "created": result.created,
        "reinforced": result.reinforced,
        "superseded": result.superseded,
        "ignored": result.ignored,
        "rejectedSensitive": result.rejected_sensitive,
    }


@router.post("/api/memory/retrieve")
async def retrieve_memory(request: Request, body: RetrieveBody):
    user = require_user(request)
    _require_internal(request)
    query = f"{body.agentName or ''}\n{body.query}".strip()
    result = _service().retrieve_relevant_memories(
        user_id=user.id,
        scope=body.scope,
        query=query,
        max_items=body.maxItems,
        max_chars=body.maxChars,
    )
    return {
        "count": len(result.items),
        "context": result.context,
        "items": [
            {
                "id": item.id,
                "scope": item.scope,
                "category": item.category,
                "memoryKey": item.memory_key,
                "value": item.value,
                "revision": item.revision,
            }
            for item in result.items
        ],
    }


@router.get("/api/memory/summary")
async def memory_summary(request: Request):
    user = require_user(request)
    return {"summary": _store().get_summary(user_id=user.id)}


@router.get("/api/memory/items")
async def memory_items(
    request: Request,
    scope: str | None = Query(default=None, max_length=40),
    status: Literal["active", "superseded", "disabled", "deleted"] = "active",
):
    user = require_user(request)
    return {
        "items": [
            _item_json(item)
            for item in _store().list_items(user_id=user.id, scope=scope, status=status)
        ]
    }


@router.patch("/api/memory/items/{item_id}")
async def patch_memory_item(item_id: str, request: Request, body: PatchItemBody):
    user = require_user(request)
    try:
        item = _store().update_item(
            user_id=user.id,
            item_id=item_id,
            expected_revision=body.revision,
            value=body.value,
            pinned=body.pinned,
        )
    except Exception as exc:
        raise _translate_store_error(exc) from exc
    return {"item": _item_json(item)}


async def _change_status(item_id: str, request: Request, body: RevisionBody, status: str):
    user = require_user(request)
    try:
        item = _store().set_item_status(
            user_id=user.id,
            item_id=item_id,
            expected_revision=body.revision,
            status=status,
        )
    except Exception as exc:
        raise _translate_store_error(exc) from exc
    return {"item": _item_json(item)}


@router.post("/api/memory/items/{item_id}/disable")
async def disable_memory_item(item_id: str, request: Request, body: RevisionBody):
    return await _change_status(item_id, request, body, "disabled")


@router.post("/api/memory/items/{item_id}/restore")
async def restore_memory_item(item_id: str, request: Request, body: RevisionBody):
    return await _change_status(item_id, request, body, "active")


@router.delete("/api/memory/items/{item_id}")
async def delete_memory_item(item_id: str, request: Request, revision: int = Query(ge=1)):
    return await _change_status(item_id, request, RevisionBody(revision=revision), "deleted")


@router.post("/api/memory/clear")
async def clear_memory(request: Request):
    user = require_user(request)
    return {"deleted": _store().clear_items(user_id=user.id)}


@router.get("/api/memory/events")
async def memory_events(
    request: Request,
    itemId: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=100, ge=1, le=500),
):
    user = require_user(request)
    events = _store().list_events(user_id=user.id, item_id=itemId, limit=limit)
    return {"events": [_event_json(event) for event in events]}


@router.get("/api/memory/settings")
async def memory_settings(request: Request):
    user = require_user(request)
    return {"settings": _settings_json(_store().get_settings(user_id=user.id))}


@router.patch("/api/memory/settings")
async def patch_memory_settings(request: Request, body: PatchSettingsBody):
    user = require_user(request)
    settings = _store().update_settings(
        user_id=user.id,
        enabled=body.enabled,
        scope_enabled=body.scopeEnabled,
    )
    return {"settings": _settings_json(settings)}


@router.post("/api/memory/import-legacy")
async def import_legacy_memory(request: Request, body: LegacyImportBody):
    user = require_user(request)
    store = _store()
    if store.get_settings(user_id=user.id).legacy_imported_at is not None:
        return {"imported": 0, "alreadyImported": True}

    rows: list[tuple[str, str, str, Any]] = []
    memory = body.memory
    if memory.industry.strip():
        rows.append(("global", "business", "industry", memory.industry.strip()))
    if memory.role.strip():
        rows.append(("global", "identity", "role", memory.role.strip()))
    rows.extend(("global", "goal", f"goal_{index}", value.strip()) for index, value in enumerate(memory.goals) if value.strip())
    rows.extend(("copywriting", "preference", f"preference_{index}", value.strip()) for index, value in enumerate(memory.preferences) if value.strip())
    rows.extend(("global", "fact", f"fact_{index}", value.strip()) for index, value in enumerate(memory.facts) if value.strip())

    imported = 0
    for scope, category, key, value in rows:
        if not sanitize_sensitive_text(value).safe:
            continue
        try:
            store.insert_item(
                user_id=user.id,
                scope=scope,
                category=category,
                memory_key=key,
                value=value,
                source="legacy",
                confidence=0.8,
            )
            imported += 1
        except UserMemoryStore.ActiveMemoryExists:
            continue
    store.mark_legacy_imported(user_id=user.id)
    return {"imported": imported, "alreadyImported": False}

"""Deterministic consolidation and retrieval rules for long-term memory."""
from __future__ import annotations

import json
import math
import re
import time
from dataclasses import dataclass
from typing import Any, Literal, Sequence

from lib.user_memory_store import MemoryItem, UserMemoryStore, get_user_memory_store


MemoryOperation = Literal["create", "reinforce", "supersede", "ignore"]
MemoryScope = Literal["global", "copywriting", "positioning", "video", "geo"]
MemoryCategory = Literal["identity", "business", "goal", "preference", "constraint", "fact"]

_SCOPES = {"global", "copywriting", "positioning", "video", "geo"}
_CATEGORIES = {"identity", "business", "goal", "preference", "constraint", "fact"}
_SENSITIVE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("phone", re.compile(r"(?<!\d)1[3-9]\d{9}(?!\d)")),
    ("identity", re.compile(r"(?<!\d)\d{17}[\dXx](?!\d)")),
    ("payment", re.compile(r"(?<!\d)\d{16,19}(?!\d)")),
    (
        "secret",
        re.compile(
            r"(?i)(?:api[_ -]?key|access[_ -]?token|secret|密码|口令)\s*[:=是]?\s*[^\s,，;；]{6,}"
        ),
    ),
    ("secret", re.compile(r"(?i)\bsk-[a-z0-9_-]{16,}\b")),
)


@dataclass(frozen=True)
class MemoryCandidate:
    operation: MemoryOperation
    scope: MemoryScope | str
    category: MemoryCategory | str
    memory_key: str
    value: object
    confidence: float
    stable: bool
    evidence: str


@dataclass(frozen=True)
class SanitizationResult:
    safe: bool
    redacted_text: str
    detected_types: tuple[str, ...]


@dataclass(frozen=True)
class ConsolidationResult:
    created: int = 0
    reinforced: int = 0
    superseded: int = 0
    ignored: int = 0
    rejected_sensitive: int = 0


@dataclass(frozen=True)
class RetrievedMemory:
    id: str
    scope: str
    category: str
    memory_key: str
    value: object
    source: str
    confidence: float
    pinned: bool
    revision: int
    score: float


@dataclass(frozen=True)
class MemoryRetrievalResult:
    items: tuple[RetrievedMemory, ...]
    context: str


def sanitize_sensitive_text(text: str) -> SanitizationResult:
    redacted = str(text)
    found: list[str] = []
    for kind, pattern in _SENSITIVE_PATTERNS:
        if pattern.search(redacted):
            found.append(kind)
            redacted = pattern.sub(f"[{kind.upper()}_REDACTED]", redacted)
    return SanitizationResult(not found, redacted, tuple(dict.fromkeys(found)))


def normalize_memory_value(category: str, key: str, value: object) -> str:
    del category, key
    if isinstance(value, str):
        return " ".join(value.casefold().strip().split())
    if isinstance(value, list):
        normalized = [" ".join(str(part).casefold().strip().split()) for part in value]
        return json.dumps(normalized, ensure_ascii=False, separators=(",", ":"))
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).casefold()


class UserMemoryService:
    def __init__(self, store: UserMemoryStore | None = None):
        self.store = store or get_user_memory_store()

    def consolidate_candidates(
        self,
        *,
        user_id: int,
        observation_ids: Sequence[str],
        candidates: Sequence[MemoryCandidate],
    ) -> ConsolidationResult:
        counts = {
            "created": 0,
            "reinforced": 0,
            "superseded": 0,
            "ignored": 0,
            "rejected_sensitive": 0,
        }
        try:
            for candidate in candidates:
                outcome = self._consolidate_one(user_id=user_id, candidate=candidate)
                counts[outcome] += 1
        except Exception:
            self.store.fail_observations(
                user_id=user_id,
                observation_ids=observation_ids,
                retryable=True,
                error_code="MEMORY_CONSOLIDATION_FAILED",
            )
            raise
        self.store.complete_observations(user_id=user_id, observation_ids=observation_ids)
        return ConsolidationResult(**counts)

    def _consolidate_one(self, *, user_id: int, candidate: MemoryCandidate) -> str:
        if candidate.operation == "ignore" or not candidate.stable:
            return "ignored"
        if candidate.scope not in _SCOPES or candidate.category not in _CATEGORIES:
            return "ignored"
        key = _normalize_key(candidate.memory_key)
        if not key or not (0 <= float(candidate.confidence) <= 1):
            return "ignored"

        serialized = (
            candidate.value
            if isinstance(candidate.value, str)
            else json.dumps(candidate.value, ensure_ascii=False, separators=(",", ":"))
        )
        evidence_check = sanitize_sensitive_text(candidate.evidence)
        value_check = sanitize_sensitive_text(serialized)
        if not evidence_check.safe or not value_check.safe:
            return "rejected_sensitive"

        normalized = normalize_memory_value(candidate.category, key, candidate.value)
        current = self.store.get_active_item(
            user_id=user_id,
            scope=str(candidate.scope),
            category=str(candidate.category),
            memory_key=key,
        )
        if current is None:
            self.store.insert_item(
                user_id=user_id,
                scope=str(candidate.scope),
                category=str(candidate.category),
                memory_key=key,
                value=candidate.value,
                source="extracted",
                confidence=float(candidate.confidence),
            )
            return "created"

        if current.normalized_value == normalized:
            self.store.reinforce_item(
                user_id=user_id,
                item_id=current.id,
                expected_revision=current.revision,
                confidence=float(candidate.confidence),
            )
            return "reinforced"

        if current.source == "manual" and float(candidate.confidence) < 0.9:
            return "ignored"
        if candidate.operation not in {"create", "supersede"} or float(candidate.confidence) < 0.75:
            return "ignored"

        self.store.supersede_item(
            user_id=user_id,
            old_item_id=current.id,
            expected_revision=current.revision,
            value=candidate.value,
            source="extracted",
            confidence=float(candidate.confidence),
        )
        return "superseded"

    def retrieve_relevant_memories(
        self,
        *,
        user_id: int,
        scope: str,
        query: str,
        max_items: int = 12,
        max_chars: int = 3000,
        now: int | None = None,
    ) -> MemoryRetrievalResult:
        settings = self.store.get_settings(user_id=user_id)
        if not settings.enabled or not settings.scope_enabled.get(scope, True):
            return MemoryRetrievalResult((), "")
        now = int(time.time()) if now is None else int(now)
        shared_scopes = {"global"}
        if scope in {"video", "geo"}:
            shared_scopes.add("positioning")
        candidates = [
            item
            for item in self.store.list_items(user_id=user_id)
            if item.scope in shared_scopes or item.scope == scope
        ]
        scored = [self._score_item(item=item, query=query, now=now) for item in candidates]
        scored.sort(key=lambda item: (-item.score, item.memory_key, item.id))

        picked: list[RetrievedMemory] = []
        lines: list[str] = []
        budget_items = max(0, min(int(max_items), 50))
        budget_chars = max(0, min(int(max_chars), 12000))
        for memory in scored:
            if len(picked) >= budget_items:
                break
            line = _context_line(memory)
            projected = "\n".join([*lines, line])
            if len(projected) > budget_chars:
                continue
            picked.append(memory)
            lines.append(line)
        return MemoryRetrievalResult(tuple(picked), "\n".join(lines))

    def _score_item(self, *, item: MemoryItem, query: str, now: int) -> RetrievedMemory:
        category_weight = {
            "constraint": 12.0,
            "identity": 7.0,
            "business": 7.0,
            "goal": 6.0,
            "fact": 5.0,
            "preference": 4.0,
        }.get(item.category, 1.0)
        source_weight = 3.0 if item.source == "manual" else 0.0
        pin_weight = 6.0 if item.pinned else 0.0
        lexical = _overlap_score(
            query,
            f"{item.category} {item.memory_key} {item.normalized_value}",
        )
        age_days = max(0.0, (now - item.last_confirmed_at) / 86400)
        decay = 1.0
        if item.category == "preference" and not item.pinned and item.source != "manual":
            decay = math.pow(0.5, age_days / 180.0)
        score = (
            category_weight
            + source_weight
            + pin_weight
            + lexical * 8.0
            + item.confidence * 2.0
            + item.strength
        ) * decay
        return RetrievedMemory(
            id=item.id,
            scope=item.scope,
            category=item.category,
            memory_key=item.memory_key,
            value=item.value,
            source=item.source,
            confidence=item.confidence,
            pinned=item.pinned,
            revision=item.revision,
            score=score,
        )


def _normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9_.-]+", "_", str(value).casefold().strip()).strip("_")[:80]


def _tokens(value: str) -> set[str]:
    lowered = str(value).casefold()
    words = set(re.findall(r"[a-z0-9_]+", lowered))
    chinese = set(re.findall(r"[\u4e00-\u9fff]", lowered))
    return words | chinese


def _overlap_score(left: str, right: str) -> float:
    left_tokens = _tokens(left)
    right_tokens = _tokens(right)
    if not left_tokens or not right_tokens:
        return 0.0
    return len(left_tokens & right_tokens) / max(1, len(left_tokens))


def _context_line(memory: RetrievedMemory) -> str:
    value = json.dumps(memory.value, ensure_ascii=False) if not isinstance(memory.value, str) else memory.value
    return f"- [{memory.scope}/{memory.category}/{memory.memory_key}] {value}"


def consolidate_candidates(
    *,
    user_id: int,
    observation_ids: Sequence[str],
    candidates: Sequence[MemoryCandidate],
) -> ConsolidationResult:
    return UserMemoryService().consolidate_candidates(
        user_id=user_id, observation_ids=observation_ids, candidates=candidates
    )


def retrieve_relevant_memories(
    *, user_id: int, scope: str, query: str, max_items: int = 12, max_chars: int = 3000
) -> MemoryRetrievalResult:
    return UserMemoryService().retrieve_relevant_memories(
        user_id=user_id,
        scope=scope,
        query=query,
        max_items=max_items,
        max_chars=max_chars,
    )


def build_memory_context(items: Sequence[RetrievedMemory]) -> str:
    return "\n".join(_context_line(item) for item in items)

# -*- coding: utf-8 -*-
"""读取云端同步的结构化模型渠道（MODEL_PROVIDERS_JSON_B64）。"""

from __future__ import annotations

import base64
import json
import os
from typing import Any


def load_synced_providers() -> list[dict[str, Any]]:
    raw = (os.getenv("MODEL_PROVIDERS_JSON_B64") or "").strip()
    if not raw:
        return []
    try:
        payload = json.loads(base64.b64decode(raw).decode("utf-8"))
    except Exception:
        return []
    items = payload.get("providers") if isinstance(payload, dict) else None
    if not isinstance(items, list):
        return []
    out: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        base_url = str(item.get("base_url") or "").strip()
        api_key = str(item.get("api_key") or "").strip()
        adapter = str(item.get("adapter") or "").strip()
        if not base_url or not api_key or not adapter:
            continue
        out.append(
            {
                "id": int(item.get("id") or 0),
                "kind": str(item.get("kind") or ""),
                "name": str(item.get("name") or adapter),
                "adapter": adapter,
                "base_url": base_url,
                "api_key": api_key,
                "model": str(item.get("model") or "").strip(),
                "extra": item.get("extra") if isinstance(item.get("extra"), dict) else {},
                "priority": int(item.get("priority") or 100),
            }
        )
    out.sort(key=lambda p: (p["priority"], p["id"]))
    return out


def list_synced_by_adapter(adapter: str) -> list[dict[str, Any]]:
    return [p for p in load_synced_providers() if p.get("adapter") == adapter]


def list_synced_video_providers() -> list[dict[str, Any]]:
    return [
        p
        for p in load_synced_providers()
        if p.get("adapter") in ("seedance_video", "xinghe_video")
    ]

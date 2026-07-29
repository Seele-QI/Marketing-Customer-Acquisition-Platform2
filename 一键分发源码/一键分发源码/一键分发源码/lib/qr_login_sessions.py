"""页内扫码登录会话（抖音等）。"""
from __future__ import annotations

import time
import uuid
from typing import Any, Dict, Optional

from lib.douyin_login import DouyinLoginManager


class QrLoginSessions:
    def __init__(self) -> None:
        self._sessions: Dict[str, dict] = {}

    async def start_douyin(self) -> Dict[str, Any]:
        manager = DouyinLoginManager()
        try:
            qr_base64 = await manager.init_login()
        except Exception as exc:
            await manager.close()
            return {"success": False, "error": str(exc)}
        session_id = f"qr_douyin_{uuid.uuid4().hex[:12]}"
        self._sessions[session_id] = {
            "platform": "douyin",
            "manager": manager,
            "created_at": time.time(),
        }
        return {
            "success": True,
            "session_id": session_id,
            "qr_base64": qr_base64,
            "message": "请使用抖音 App 扫描二维码",
        }

    async def poll(self, session_id: str) -> Dict[str, Any]:
        session = self._sessions.get(session_id)
        if not session:
            return {"status": "expired", "error": "会话不存在或已过期"}
        if time.time() - session["created_at"] > 300:
            await self.cancel(session_id)
            return {"status": "timeout", "error": "二维码已过期，请重新获取"}
        manager: DouyinLoginManager = session["manager"]
        done, cookie_json = await manager.poll_login_status()
        if done and cookie_json:
            platform = session["platform"]
            await self.cancel(session_id)
            return {
                "status": "success",
                "platform": platform,
                "cookie_json": cookie_json,
            }
        return {"status": "waiting", "message": "等待扫码…"}

    async def cancel(self, session_id: str) -> Dict[str, Any]:
        session = self._sessions.pop(session_id, None)
        if session:
            manager: DouyinLoginManager = session.get("manager")
            if manager:
                await manager.close()
        return {"success": True}


qr_login_sessions = QrLoginSessions()

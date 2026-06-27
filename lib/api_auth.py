"""统一鉴权 + 积分扣减 + 任务归属 + payload 大小校验。

所有视频/AI/账号路由都应经过此模块，避免每个 endpoint 自己写一遍：

    from lib.api_auth import (
        require_user,
        assert_task_owner,
        consume_with_idempotency,
        safe_refund,
        check_base64_size,
        SCENE_COST_TABLE,
    )

    @app.post("/api/video/generate")
    async def video_generate(req: VideoGenerateRequest, request: Request):
        user = require_user(request)
        check_base64_size(req.image_base64, max_mb=10, name="image")
        ...
        consume_with_idempotency(
            user_id=user.id, scene="video_creation", ref_id=local_task_id,
        )
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import HTTPException, Request

from lib.auth import CurrentUser, get_current_user
from lib.credit import (
    CHAT_COST,
    VIDEO_CREATION_COST,
    VIDEO_IMAGE_TO_VIDEO_COST,
    VIDEO_MASHUP_COST,
    consume,
    refund,
)
from lib.db import transaction

logger = logging.getLogger(__name__)

# 服务端固定定价表；客户端不允许覆盖。
SCENE_COST_TABLE: dict[str, int] = {
    "video_creation": VIDEO_CREATION_COST,
    "video_image_to_video": VIDEO_IMAGE_TO_VIDEO_COST,
    "video_mashup": VIDEO_MASHUP_COST,
    "video_clone_voice": 50,
    "ai_chat": CHAT_COST,
    "ai_rewrite": CHAT_COST,
    "ai_ip_positioning": 20,
    "ai_ark_image": 20,
}


def ensure_credit_idempotency_index() -> None:
    """为 credit_ledger 加唯一索引，防止同一 ref_id 重复扣费（重放攻击）。

    历史数据兼容：仅当 ref_id 非空时强制唯一；旧的空 ref_id 行不受影响。
    幂等：CREATE UNIQUE INDEX IF NOT EXISTS。
    """
    with transaction() as conn:
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_user_ref_type
                ON credit_ledger (user_id, ref_id, type)
                WHERE ref_id IS NOT NULL AND ref_id != ''
            """
        )


def require_user(request: Request) -> CurrentUser:
    """登录态校验。未登录抛 401。所有敏感 endpoint 必须先调本函数。"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"code": "NOT_LOGGED_IN", "message": "请先登录"},
        )
    return user


def assert_task_owner(task_dict: Optional[dict], user: CurrentUser, *, task_id: str) -> None:
    """校验 task 归属。owner 为空（旧数据）或不匹配 → 403。"""
    owner = (task_dict or {}).get("user_id")
    if owner is None or int(owner) != int(user.id):
        logger.warning(
            "ownership violation task=%s user=%s owner=%s",
            task_id, user.id, owner,
        )
        raise HTTPException(
            status_code=403,
            detail={"code": "TASK_NOT_OWNED", "message": "无权访问该任务"},
        )


def _query_existing_consume(user_id: int, ref_id: str) -> Optional[int]:
    """查询是否已对 (user_id, ref_id) 扣过 → 返回扣后余额。"""
    with transaction() as conn:
        row = conn.execute(
            "SELECT balance_after FROM credit_ledger "
            "WHERE user_id = ? AND ref_id = ? AND type = 'consume' "
            "ORDER BY id DESC LIMIT 1",
            (user_id, ref_id),
        ).fetchone()
        if row is not None:
            return int(row["balance_after"])
    return None


def consume_with_idempotency(
    *,
    user_id: int,
    scene: str,
    ref_id: str,
    note: str = "",
) -> int:
    """带幂等保护的扣费。同一 (user_id, ref_id) 只会扣一次。

    用于防止：
    1. 网络重试导致客户端重复 POST consume；
    2. 攻击者爆破 ref_id 试图刷扣或刷返。
    """
    if scene not in SCENE_COST_TABLE:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_SCENE", "message": f"不支持的消费场景: {scene}"},
        )
    if not ref_id:
        raise HTTPException(
            status_code=400,
            detail={"code": "MISSING_REF_ID", "message": "缺少幂等键 ref_id"},
        )

    cached = _query_existing_consume(user_id, ref_id)
    if cached is not None:
        logger.info("idempotent consume hit user=%s ref=%s", user_id, ref_id)
        return cached

    cost = SCENE_COST_TABLE[scene]
    return consume(user_id, cost, ref_id=ref_id, note=note or scene)


def safe_refund(*, user_id: int, scene: str, ref_id: str, reason: str = "") -> None:
    """任务失败 / 取消时退款。

    - 退款金额按 SCENE_COST_TABLE 取值（与扣费金额对齐，不依赖原始扣款记录）
    - 退款 ref_id 加 'refund:' 前缀，与原扣款互不冲突
    - 多次调用幂等：通过 ref_id 唯一索引 + 显式查询双保险
    """
    if scene not in SCENE_COST_TABLE:
        return
    if not ref_id:
        return
    refund_ref = f"refund:{ref_id}"

    with transaction() as conn:
        row = conn.execute(
            "SELECT 1 FROM credit_ledger "
            "WHERE user_id = ? AND ref_id = ? AND type = 'refund' LIMIT 1",
            (user_id, refund_ref),
        ).fetchone()
        if row is not None:
            return

    amount = SCENE_COST_TABLE[scene]
    try:
        refund(
            user_id,
            amount,
            ref_id=refund_ref,
            note=(reason or "任务失败退款")[:80],
        )
    except Exception:
        logger.exception("refund failed user=%s ref=%s", user_id, ref_id)


def check_base64_size(b64: str, *, max_mb: int, name: str) -> None:
    """对 base64 字符串做大小上限校验。

    base64 → 二进制约为 3/4 长度。不需要先解码即可粗略判断。
    """
    if not b64:
        return
    approx_bytes = (len(b64) * 3) // 4
    limit = max_mb * 1024 * 1024
    if approx_bytes > limit:
        raise HTTPException(
            status_code=413,
            detail={
                "code": "PAYLOAD_TOO_LARGE",
                "message": f"{name} 超过 {max_mb}MB 上限",
            },
        )


def safe_error_message(e: BaseException) -> str:
    """脱敏错误：仅返回错误类型，不暴露 stack/路径/原始 stderr。"""
    return f"{type(e).__name__}: 系统繁忙，请稍后重试"

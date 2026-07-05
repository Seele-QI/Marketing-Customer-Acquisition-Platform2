"""统一鉴权 + 积分扣减 + 任务归属 + payload 大小校验。"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import HTTPException, Request

from lib.auth import CurrentUser, get_current_user
from lib.credit import (
    AI_LLM_COST_PLACEHOLDER,
    CHAT_COST,
    COPYWRITING_LLM_COST_PLACEHOLDER,
    COPYWRITING_LLM_ECONOMY,
    COPYWRITING_LLM_PREMIUM,
    COPY_EXTRACT_COST,
    DH_V2_PLAN_SCRIPT_COST,
    DH_V2_VIDEO_RETRY_COST,
    DH_V2_VIDEO_SEGMENT_UNIT,
    GEO_ARTICLE_COST_PLACEHOLDER,
    GEO_ARTICLE_ECONOMY,
    GEO_ARTICLE_PREMIUM,
    GEO_AUTHORITY_LINK_COST,
    GEO_MATRIX_GEN_COST,
    GEO_RESEARCH_COST,
    GEO_SKILL_GEN_COST,
    MAX_LLM_COST,
    PROMO_STORYBOARD_COST,
    PROMO_VIDEO_SEGMENT_PLACEHOLDER,
    PROMO_VIDEO_SEGMENT_COST,
    VIDEO_CLONE_VOICE_COST,
    VIDEO_IMAGE_TO_VIDEO_COST,
    VIDEO_MASHUP_COST,
    VIDEO_SEGMENT_COST,
    consume,
    refund,
)
from lib.credit_pricing import resolve_billing_cost, segment_cost_for_provider
from lib.db import transaction

logger = logging.getLogger(__name__)

# 服务端固定定价表；可变价 scene 为占位，实际 cost 由 registry / helper 传入。
SCENE_COST_TABLE: dict[str, int] = {
    "video_creation": VIDEO_SEGMENT_COST,
    "video_image_to_video": VIDEO_IMAGE_TO_VIDEO_COST,
    "video_mashup": VIDEO_MASHUP_COST,
    "video_clone_voice": VIDEO_CLONE_VOICE_COST,
    "ai_chat": CHAT_COST,
    "ai_rewrite": CHAT_COST,
    "ai_ip_positioning": 20,
    "ai_ark_image": 20,
    "ai_llm": AI_LLM_COST_PLACEHOLDER,
    "copywriting_llm": COPYWRITING_LLM_COST_PLACEHOLDER,
    "geo_article": GEO_ARTICLE_COST_PLACEHOLDER,
    "geo_matrix_gen": GEO_MATRIX_GEN_COST,
    "geo_skill_gen": GEO_SKILL_GEN_COST,
    "geo_research": GEO_RESEARCH_COST,
    "geo_authority_link": GEO_AUTHORITY_LINK_COST,
    "dh_v2_plan_script": DH_V2_PLAN_SCRIPT_COST,
    "dh_v2_video_segment": DH_V2_VIDEO_SEGMENT_UNIT,
    "dh_v2_video_retry": DH_V2_VIDEO_RETRY_COST,
    "promo_video_segment": PROMO_VIDEO_SEGMENT_PLACEHOLDER,
    "promo_storyboard": PROMO_STORYBOARD_COST,
    "copy_extract": COPY_EXTRACT_COST,
}

_VARIABLE_SCENE_ALLOWED_COSTS: dict[str, frozenset[int]] = {
    "copywriting_llm": frozenset({COPYWRITING_LLM_ECONOMY, COPYWRITING_LLM_PREMIUM}),
    "geo_article": frozenset({GEO_ARTICLE_ECONOMY, GEO_ARTICLE_PREMIUM}),
}


def ensure_credit_idempotency_index() -> None:
    with transaction() as conn:
        conn.execute(
            """
            CREATE UNIQUE INDEX IF NOT EXISTS uq_ledger_user_ref_type
                ON credit_ledger (user_id, ref_id, type)
                WHERE ref_id IS NOT NULL AND ref_id != ''
            """
        )


def require_user(request: Request) -> CurrentUser:
    user = get_current_user(request)
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"code": "NOT_LOGGED_IN", "message": "请先登录"},
        )
    return user


def assert_task_owner(task_dict: Optional[dict], user: CurrentUser, *, task_id: str) -> None:
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


def _validate_variable_cost(scene: str, cost: int) -> None:
    if scene in _VARIABLE_SCENE_ALLOWED_COSTS:
        allowed = _VARIABLE_SCENE_ALLOWED_COSTS[scene]
        if cost not in allowed:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_COST", "message": f"场景 {scene} 扣费金额无效"},
            )
        return

    if scene == "video_clone_voice":
        if cost != VIDEO_CLONE_VOICE_COST:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_COST", "message": "音色克隆扣费金额无效"},
            )
        return

    if scene == "video_creation":
        if cost <= 0 or cost % VIDEO_SEGMENT_COST != 0:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_COST", "message": "视频段扣费金额无效"},
            )
        return

    if scene in ("dh_v2_video_segment", "promo_video_segment"):
        if cost <= 0 or cost % DH_V2_VIDEO_SEGMENT_UNIT != 0:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_COST", "message": f"场景 {scene} 扣费须为 {DH_V2_VIDEO_SEGMENT_UNIT} 的整数倍"},
            )
        return

    if scene == "dh_v2_video_retry":
        if cost <= 0:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_COST", "message": "dh-v2 重试扣费金额无效"},
            )
        return

    if scene == "ai_llm":
        if not isinstance(cost, int) or cost < 1 or cost > MAX_LLM_COST:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "INVALID_COST",
                    "message": f"ai_llm 扣费须为 1–{MAX_LLM_COST} 的整数",
                },
            )
        return

    expected = SCENE_COST_TABLE.get(scene)
    if expected is not None and cost != expected:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_COST", "message": f"场景 {scene} 扣费金额无效"},
        )


def consume_with_idempotency(
    *,
    user_id: int,
    scene: str,
    ref_id: str,
    note: str = "",
    cost: int | None = None,
) -> int:
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

    if cost is None:
        cost = SCENE_COST_TABLE[scene]
    else:
        _validate_variable_cost(scene, cost)

    return consume(user_id, cost, ref_id=ref_id, note=note or scene)


def consume_billing_event(
    *,
    user_id: int,
    billing_key: str,
    params: dict[str, Any] | None,
    ref_id: str,
) -> tuple[int, int, str]:
    """解析 billing_key 并扣费。返回 (balance_after, cost, scene)。"""
    result = resolve_billing_cost(billing_key, params)
    balance = consume_with_idempotency(
        user_id=user_id,
        scene=result.scene,
        ref_id=ref_id,
        note=result.note,
        cost=result.cost,
    )
    return balance, result.cost, result.scene


def consume_ai_llm(*, user_id: int, ref_id: str, cost: int, note: str = "") -> int:
    return consume_with_idempotency(
        user_id=user_id,
        scene="ai_llm",
        ref_id=ref_id,
        note=note or "AI 模型计量",
        cost=cost,
    )


def consume_voice_clone(*, user_id: int, ref_id: str, note: str = "") -> int:
    return consume_with_idempotency(
        user_id=user_id,
        scene="video_clone_voice",
        ref_id=ref_id,
        note=note or "音色克隆",
        cost=VIDEO_CLONE_VOICE_COST,
    )


def consume_video_creation_segments(
    *, user_id: int, ref_id: str, segment_count: int, note: str = ""
) -> int:
    if segment_count < 1:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_SEGMENT_COUNT", "message": "段数至少为 1"},
        )
    total = VIDEO_SEGMENT_COST * segment_count
    return consume_with_idempotency(
        user_id=user_id,
        scene="video_creation",
        ref_id=ref_id,
        note=note or f"口播视频生成 {segment_count} 段",
        cost=total,
    )


def consume_dh_v2_video_segments(
    *,
    user_id: int,
    ref_id: str,
    segment_count: int,
    provider: str = "seedance",
    note: str = "",
) -> int:
    if segment_count < 1:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_SEGMENT_COUNT", "message": "段数至少为 1"},
        )
    unit = segment_cost_for_provider(provider)
    total = unit * segment_count
    return consume_with_idempotency(
        user_id=user_id,
        scene="dh_v2_video_segment",
        ref_id=ref_id,
        note=note or f"dh-v2 视频生成 {segment_count} 段",
        cost=total,
    )


def consume_dh_v2_video_retry(
    *,
    user_id: int,
    ref_id: str,
    provider: str = "seedance",
    note: str = "",
) -> int:
    unit = segment_cost_for_provider(provider)
    return consume_with_idempotency(
        user_id=user_id,
        scene="dh_v2_video_retry",
        ref_id=ref_id,
        note=note or "dh-v2 重试单段",
        cost=unit,
    )


def safe_refund(*, user_id: int, scene: str, ref_id: str, reason: str = "") -> None:
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
    return f"{type(e).__name__}: 系统繁忙，请稍后重试"

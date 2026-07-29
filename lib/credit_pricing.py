"""积分定价注册表 — 与 lib/credit-pricing/registry.ts 数值严格一致。

业务路由只传 billing_key + params；cost 由此模块解析，客户端不可指定金额。
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException

# ── 文案创作 LLM ─────────────────────────────────────────────
COPYWRITING_LLM_ECONOMY = 2
COPYWRITING_LLM_PREMIUM = 15

# ── GEO ─────────────────────────────────────────────────────
GEO_SKILL_GEN_COST = 25
GEO_MATRIX_GEN_COST = 25
GEO_ARTICLE_ECONOMY = 10
GEO_ARTICLE_PREMIUM = 30
GEO_RESEARCH_COST = 5

# ── 视频 ─────────────────────────────────────────────────────
VIDEO_SEGMENT_COST = 250
VIDEO_CLONE_VOICE_COST = 10
VIDEO_IMAGE_TO_VIDEO_COST = 40
VIDEO_MASHUP_COST = 50
PROMO_VIDEO_SEGMENT_COST = 450
PROMO_STORYBOARD_COST = 50
COPY_EXTRACT_COST = 5
DH_V2_PLAN_SCRIPT_COST = 20
DH_V2_VIDEO_RETRY_COST = 450
VIDEO_ECONOMY_SEGMENT_COST = 250
VIDEO_ECONOMY_RETRY_COST = VIDEO_ECONOMY_SEGMENT_COST

VIDEO_SEGMENT_COST_BY_PROVIDER: dict[str, int] = {
    "seedance": 450,
    "default": 450,
}

PREMIUM_GEO_PROVIDERS = frozenset({"gpt", "claude"})
ECONOMY_GEO_PROVIDERS = frozenset({"deepseek", "doubao", "kimi", "gemini"})

# Sonetto / GPT / Claude model id 前缀或精确匹配
PREMIUM_MODEL_PREFIXES = ("gpt-", "[kiro]claude", "claude-")


@dataclass(frozen=True)
class BillingResult:
    scene: str
    cost: int
    note: str


def classify_geo_provider(provider: str) -> str:
    p = (provider or "deepseek").strip().lower()
    if p in PREMIUM_GEO_PROVIDERS or any(
        p.startswith(f"{premium}-") for premium in PREMIUM_GEO_PROVIDERS
    ):
        return "premium"
    return classify_model(p)


def classify_model(model_id: str) -> str:
    mid = (model_id or "").strip().lower()
    if not mid:
        return "economy"
    if is_sonetto_model_id(mid):
        return "premium"
    leaf = mid.rsplit("/", 1)[-1]
    if leaf.startswith("doubao") or leaf.startswith("deepseek") or "ark" in leaf:
        return "economy"
    for prefix in PREMIUM_MODEL_PREFIXES:
        if leaf.startswith(prefix.lower()) or leaf == prefix.lower():
            return "premium"
    return "economy"


def is_sonetto_model_id(model_id: str) -> bool:
    mid = (model_id or "").strip().lower()
    if not mid:
        return False
    if mid.startswith("gpt-"):
        return True
    if "claude" in mid:
        return True
    return False


def segment_cost_for_provider(provider: str) -> int:
    key = (provider or "default").strip().lower()
    return VIDEO_SEGMENT_COST_BY_PROVIDER.get(key, VIDEO_SEGMENT_COST_BY_PROVIDER["default"])


def resolve_billing_cost(billing_key: str, params: dict[str, Any] | None = None) -> BillingResult:
    """解析 billing_key → scene + cost。未知 key 抛 400。"""
    params = params or {}
    key = (billing_key or "").strip()

    if key == "copywriting.llm_call":
        model_id = str(params.get("model_id") or params.get("modelId") or "")
        tier = classify_model(model_id)
        cost = COPYWRITING_LLM_PREMIUM if tier == "premium" else COPYWRITING_LLM_ECONOMY
        return BillingResult(
            scene="copywriting_llm",
            cost=cost,
            note=f"文案创作 LLM ({tier})",
        )

    if key == "geo.article":
        provider = str(params.get("provider") or "deepseek")
        tier = classify_geo_provider(provider)
        cost = GEO_ARTICLE_PREMIUM if tier == "premium" else GEO_ARTICLE_ECONOMY
        return BillingResult(
            scene="geo_article",
            cost=cost,
            note=f"GEO 文章 ({provider}/{tier})",
        )

    if key == "video.dh_v2_segment":
        provider = str(params.get("provider") or "seedance")
        segment_count = int(params.get("segment_count") or params.get("segmentCount") or 1)
        if segment_count < 1:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_SEGMENT_COUNT", "message": "段数至少为 1"},
            )
        unit = segment_cost_for_provider(provider)
        return BillingResult(
            scene="dh_v2_video_segment",
            cost=unit * segment_count,
            note=f"dh-v2 视频 {segment_count} 段 ({provider})",
        )

    if key == "video.dh_v2_retry":
        provider = str(params.get("provider") or "seedance")
        unit = segment_cost_for_provider(provider)
        return BillingResult(
            scene="dh_v2_video_retry",
            cost=unit,
            note=f"dh-v2 重试单段 ({provider})",
        )

    if key == "video.dh_economy_segment":
        try:
            segment_count = int(params.get("segment_count") or params.get("segmentCount") or 1)
        except (TypeError, ValueError):
            segment_count = 0
        if segment_count < 1:
            raise HTTPException(
                status_code=400,
                detail={"code": "INVALID_SEGMENT_COUNT", "message": "段数至少为 1"},
            )
        return BillingResult(
            scene="dh_economy_video_segment",
            cost=VIDEO_ECONOMY_SEGMENT_COST * segment_count,
            note=f"经济版数字人视频 {segment_count}×20s",
        )

    if key == "video.dh_economy_retry":
        return BillingResult(
            scene="dh_economy_video_retry",
            cost=VIDEO_ECONOMY_RETRY_COST,
            note="经济版数字人视频重试单段",
        )

    if key == "video.promo_segment":
        duration = int(params.get("duration") or 15)
        provider = str(params.get("provider") or "default")
        segments = max(1, (duration + 14) // 15)
        unit = segment_cost_for_provider(provider)
        if provider not in VIDEO_SEGMENT_COST_BY_PROVIDER:
            unit = PROMO_VIDEO_SEGMENT_COST
        return BillingResult(
            scene="promo_video_segment",
            cost=segments * unit,
            note=f"宣传视频 {segments}×15s ({provider})",
        )

    raise HTTPException(
        status_code=400,
        detail={"code": "INVALID_BILLING_KEY", "message": f"不支持的 billing_key: {key}"},
    )


def calculate_promo_video_cost(duration: int, resolution: str = "720p") -> int:
    """宣传视频扣费：每 15s 一段 × 450 积分（resolution 保留参数兼容旧调用）。"""
    _ = resolution
    segments = max(1, (int(duration) + 14) // 15)
    return segments * PROMO_VIDEO_SEGMENT_COST

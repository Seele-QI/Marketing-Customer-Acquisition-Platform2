"""定价注册表单元测试 — 与 lib/credit-pricing/registry.ts 数值对齐。"""

from __future__ import annotations

import pytest
from fastapi import HTTPException

from lib.credit_pricing import (
    COPYWRITING_LLM_ECONOMY,
    COPYWRITING_LLM_PREMIUM,
    DH_V2_PLAN_SCRIPT_COST,
    GEO_ARTICLE_ECONOMY,
    GEO_ARTICLE_PREMIUM,
    GEO_MATRIX_GEN_COST,
    GEO_RESEARCH_COST,
    GEO_SKILL_GEN_COST,
    PROMO_STORYBOARD_COST,
    PROMO_VIDEO_SEGMENT_COST,
    VIDEO_IMAGE_TO_VIDEO_COST,
    VIDEO_MASHUP_COST,
    calculate_promo_video_cost,
    classify_geo_provider,
    classify_model,
    resolve_billing_cost,
    segment_cost_for_provider,
)


def test_classify_model_tiers():
    assert classify_model("deepseek-chat") == "economy"
    assert classify_model("doubao-seed-2-1-pro-260628") == "economy"
    assert classify_model("gpt-5.5") == "premium"
    assert classify_model("claude-opus-4-8") == "premium"


def test_classify_geo_provider():
    assert classify_geo_provider("deepseek") == "economy"
    assert classify_geo_provider("doubao") == "economy"
    assert classify_geo_provider("gpt") == "premium"
    assert classify_geo_provider("claude") == "premium"
    assert classify_geo_provider("gpt-5.5") == "premium"
    assert classify_geo_provider("claude-opus-4-8") == "premium"
    assert classify_geo_provider("openai/gpt-5.5") == "premium"
    assert classify_geo_provider("anthropic/claude-opus-4") == "premium"


def test_copywriting_llm_billing():
    eco = resolve_billing_cost("copywriting.llm_call", {"modelId": "deepseek-chat"})
    assert eco.scene == "copywriting_llm"
    assert eco.cost == COPYWRITING_LLM_ECONOMY == 2

    prem = resolve_billing_cost("copywriting.llm_call", {"modelId": "gpt-5.5"})
    assert prem.cost == COPYWRITING_LLM_PREMIUM == 15


def test_geo_article_billing():
    eco = resolve_billing_cost("geo.article", {"provider": "deepseek"})
    assert eco.scene == "geo_article"
    assert eco.cost == GEO_ARTICLE_ECONOMY == 10

    prem = resolve_billing_cost("geo.article", {"provider": "claude"})
    assert prem.cost == GEO_ARTICLE_PREMIUM == 30


def test_dh_v2_segment_billing():
    r = resolve_billing_cost(
        "video.dh_v2_segment",
        {"provider": "seedance", "segment_count": 3},
    )
    assert r.scene == "dh_v2_video_segment"
    assert r.cost == 450 * 3
    assert segment_cost_for_provider("seedance") == 450


def test_dh_v2_retry_billing():
    r = resolve_billing_cost("video.dh_v2_retry", {"provider": "seedance"})
    assert r.scene == "dh_v2_video_retry"
    assert r.cost == 450


def test_dh_economy_segment_and_retry_billing():
    two_segments = resolve_billing_cost(
        "video.dh_economy_segment",
        {"duration_seconds": 36.0, "segment_count": 2},
    )
    assert two_segments.scene == "dh_economy_video_segment"
    assert two_segments.cost == 500

    three_segments = resolve_billing_cost(
        "video.dh_economy_segment",
        {"duration_seconds": 60.0, "segment_count": 3},
    )
    assert three_segments.cost == 750

    four_segments = resolve_billing_cost(
        "video.dh_economy_segment",
        {"duration_seconds": 60.001, "segment_count": 4},
    )
    assert four_segments.cost == 1000

    retry = resolve_billing_cost("video.dh_economy_retry", {})
    assert retry.scene == "dh_economy_video_retry"
    assert retry.cost == 250


def test_promo_segment_billing():
    r = resolve_billing_cost("video.promo_segment", {"duration": 30})
    assert r.scene == "promo_video_segment"
    assert r.cost == 450 * 2


def test_calculate_promo_video_cost():
    assert calculate_promo_video_cost(15) == PROMO_VIDEO_SEGMENT_COST
    assert calculate_promo_video_cost(30) == PROMO_VIDEO_SEGMENT_COST * 2
    assert calculate_promo_video_cost(30, "1080p") == PROMO_VIDEO_SEGMENT_COST * 2


def test_fixed_cost_constants():
    assert GEO_SKILL_GEN_COST == 25
    assert GEO_MATRIX_GEN_COST == 25
    assert GEO_RESEARCH_COST == 5
    assert DH_V2_PLAN_SCRIPT_COST == 20
    assert VIDEO_IMAGE_TO_VIDEO_COST == 40
    assert VIDEO_MASHUP_COST == 50
    assert PROMO_STORYBOARD_COST == 50


def test_invalid_billing_key():
    with pytest.raises(HTTPException) as exc:
        resolve_billing_cost("unknown.key", {})
    assert exc.value.status_code == 400

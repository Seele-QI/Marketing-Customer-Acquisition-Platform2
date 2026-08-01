"""dh_video_v2_service — Seedance 请求体与工具函数单测"""

from __future__ import annotations

import asyncio
import base64

import pytest

from lib.dh_video_v2_service import (
    DEFAULT_PRIMARY_MODEL,
    SEEDANCE_AICOST_MODEL,
    build_seedance_submit_payload,
    list_seedance_endpoints,
    submit_aicost_seedance,
    task_timeout,
    _default_audio_mime_ext,
    _ensure_data_url,
    _is_fast_seedance_model,
    _normalize_images_base64,
)


def _fake_mp3_data_url(tag: str = "test-audio") -> str:
    """Minimal ID3 header bytes — passes _looks_like_mp3 without ffmpeg."""
    raw = b"ID3\x03\x00\x00\x00\x00\x00\x00" + tag.encode("utf-8") + b"\x00" * 64
    return f"data:audio/mpeg;base64,{base64.b64encode(raw).decode('ascii')}"


def test_default_dh_v2_model_is_seedance_fast():
    payload = build_seedance_submit_payload(
        model=SEEDANCE_AICOST_MODEL,
        prompt="测试",
        segment_sec=15,
    )
    assert SEEDANCE_AICOST_MODEL == "seedance2.0-fast"
    assert payload["model"] == "seedance2.0-fast"
    assert payload["duration"] == "auto"
    assert payload["seconds"] == "15"


def test_task_timeout_defaults_to_50_minutes(monkeypatch):
    monkeypatch.delenv("DH_V2_TASK_TIMEOUT", raising=False)
    monkeypatch.delenv("DH_V2_SEGMENT_POLL_TIMEOUT", raising=False)
    assert task_timeout() == 3000.0
    monkeypatch.setenv("DH_V2_TASK_TIMEOUT", "3600")
    assert task_timeout() == 3600.0


def test_seedance20_duration_is_numeric_not_auto():
    payload = build_seedance_submit_payload(
        model="seedance2.0",
        prompt="测试",
        segment_sec=15,
        images_base64=["abc123"],
    )
    assert payload["model"] == "seedance2.0"
    assert payload["duration"] == 15
    assert "auto" not in str(payload.get("duration"))
    assert payload.get("seconds") is None
    assert payload["resolution"] == "720p"


def test_seedance20_fast_allows_auto_duration():
    payload = build_seedance_submit_payload(
        model="seedance2.0-fast",
        prompt="测试",
        segment_sec=15,
    )
    assert payload["duration"] == "auto"
    assert payload["seconds"] == "15"


def test_seedance20_duration_clamped_to_4_15():
    payload = build_seedance_submit_payload(model="seedance2.0", prompt="x", segment_sec=99)
    assert payload["duration"] == 15
    payload2 = build_seedance_submit_payload(model="seedance2.0", prompt="x", segment_sec=2)
    assert payload2["duration"] == 4


def test_normalize_images_wraps_plain_base64():
    wrapped = _ensure_data_url("abc123", "image/jpeg")
    assert wrapped == "data:image/jpeg;base64,abc123"
    assert _ensure_data_url("data:image/png;base64,xyz", "image/jpeg") == "data:image/png;base64,xyz"


def test_normalize_images_base64_skips_empty():
    assert _normalize_images_base64(["", "  ", "raw"]) == ["data:image/jpeg;base64,raw"]


def test_sd2_primary_model_uses_auto_duration():
    assert _is_fast_seedance_model("sd2-福利") is True
    assert _is_fast_seedance_model("SD2.0-480p-fast") is True
    assert DEFAULT_PRIMARY_MODEL == "SD2.0-480p-fast"
    payload = build_seedance_submit_payload(
        model=DEFAULT_PRIMARY_MODEL,
        prompt="测试",
        segment_sec=15,
    )
    assert payload["model"] == "SD2.0-480p-fast"
    assert payload["duration"] == "auto"
    assert payload["seconds"] == "15"


def test_list_seedance_endpoints_primary_then_fallback(monkeypatch):
    monkeypatch.setenv("SEEDANCE_PRIMARY_BASE_URL", "https://api.7tai.cc")
    monkeypatch.setenv("SEEDANCE_PRIMARY_API_KEY", "sk-primary")
    monkeypatch.setenv("SEEDANCE_PRIMARY_MODEL", "SD2.0-480p-fast")
    monkeypatch.setenv("SEEDANCE_API_KEY", "sk-fallback")
    monkeypatch.setenv("SEEDANCE_BASE_URL", "https://www.aicost.xyz")
    eps = list_seedance_endpoints()
    assert len(eps) == 2
    assert eps[0].name == "primary"
    assert eps[0].base_url == "https://api.7tai.cc"
    assert eps[0].model == "SD2.0-480p-fast"
    assert eps[0].media_mode == "url"
    assert eps[1].name == "secondary"
    assert eps[1].model == SEEDANCE_AICOST_MODEL
    assert eps[1].media_mode == "base64"


def test_list_seedance_endpoints_three_tiers(monkeypatch):
    monkeypatch.setenv("SEEDANCE_PRIMARY_BASE_URL", "https://primary.example")
    monkeypatch.setenv("SEEDANCE_PRIMARY_API_KEY", "sk-p")
    monkeypatch.setenv("SEEDANCE_SECONDARY_BASE_URL", "https://secondary.example")
    monkeypatch.setenv("SEEDANCE_SECONDARY_API_KEY", "sk-s")
    monkeypatch.setenv("SEEDANCE_SECONDARY_MODEL", "seedance2.0-fast")
    monkeypatch.setenv("SEEDANCE_TERTIARY_BASE_URL", "https://tertiary.example")
    monkeypatch.setenv("SEEDANCE_TERTIARY_API_KEY", "sk-t")
    eps = list_seedance_endpoints()
    assert len(eps) == 3
    assert [e.name for e in eps] == ["primary", "secondary", "tertiary"]
    assert eps[2].base_url == "https://tertiary.example"


def test_list_seedance_endpoints_from_synced_providers(monkeypatch):
    import base64
    import json

    monkeypatch.delenv("SEEDANCE_PRIMARY_BASE_URL", raising=False)
    monkeypatch.delenv("SEEDANCE_PRIMARY_API_KEY", raising=False)
    monkeypatch.delenv("SEEDANCE_API_KEY", raising=False)
    payload = {
        "providers": [
            {
                "id": 1,
                "name": "v1",
                "adapter": "seedance_video",
                "base_url": "https://v1.example",
                "api_key": "sk-1",
                "model": "sd2-a",
                "priority": 10,
                "extra": {"media_mode": "url"},
            },
            {
                "id": 2,
                "name": "v2",
                "adapter": "seedance_video",
                "base_url": "https://v2.example",
                "api_key": "sk-2",
                "model": "sd2-b",
                "priority": 20,
                "extra": {"media_mode": "base64"},
            },
            {
                "id": 3,
                "name": "v3",
                "adapter": "xinghe_video",
                "base_url": "https://v3.example",
                "api_key": "sk-3",
                "model": "xh-1",
                "priority": 30,
            },
            {
                "id": 4,
                "name": "v4",
                "adapter": "seedance_video",
                "base_url": "https://v4.example",
                "api_key": "sk-4",
                "model": "sd2-d",
                "priority": 40,
            },
        ]
    }
    monkeypatch.setenv(
        "MODEL_PROVIDERS_JSON_B64",
        base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii"),
    )
    eps = list_seedance_endpoints()
    assert len(eps) == 4
    assert [e.name for e in eps] == ["v1", "v2", "v3", "v4"]
    assert eps[0].media_mode == "url"
    assert eps[3].base_url == "https://v4.example"


def test_submit_aicost_seedance_falls_back_on_primary_error(monkeypatch):
    monkeypatch.setenv("SEEDANCE_PRIMARY_BASE_URL", "https://api.7tai.cc")
    monkeypatch.setenv("SEEDANCE_PRIMARY_API_KEY", "sk-primary")
    monkeypatch.setenv("SEEDANCE_PRIMARY_MODEL", "SD2.0-480p-fast")
    monkeypatch.setenv("SEEDANCE_PRIMARY_MEDIA_MODE", "url")
    monkeypatch.setenv("SEEDANCE_API_KEY", "sk-fallback")
    monkeypatch.setenv("SEEDANCE_BASE_URL", "https://www.aicost.xyz")

    calls: list[str] = []

    async def fake_upload(ep, *, raw, kind, default_mime, default_ext):
        return f"https://cdn.example.com/{ep.name}-{kind}.jpg"

    async def fake_post(*, url, headers, payload, retries):
        calls.append(url)
        if "api.7tai.cc" in url:
            raise RuntimeError("HTTP 503: primary down")
        assert payload["model"] == SEEDANCE_AICOST_MODEL
        assert payload.get("images_base64")
        assert "reference_images" not in payload
        assert "固定首帧" in payload.get("prompt", "")
        return {"id": "task-fallback-1"}

    monkeypatch.setattr("lib.dh_video_v2_service.upload_seedance_asset_to_url", fake_upload)
    monkeypatch.setattr("lib.dh_video_v2_service._post_seedance_json", fake_post)

    async def run():
        return await submit_aicost_seedance(
            prompt="专业数字人口播",
            images_base64=["abc123"],
            audios_base64=[_fake_mp3_data_url("fallback-audio")],
        )

    data = asyncio.run(run())
    assert data["id"] == "task-fallback-1"
    assert data["_seedance_endpoint"] == "secondary"
    assert calls[0].startswith("https://api.7tai.cc/v1/videos")
    assert calls[1].startswith("https://www.aicost.xyz/v1/videos")


def test_build_payload_attaches_image_and_audio_alias_fields():
    audio_item = _fake_mp3_data_url("alias-audio")
    payload = build_seedance_submit_payload(
        model="SD2.0-480p-fast",
        prompt="口播测试",
        images_base64=["imgb64"],
        audios_base64=[audio_item],
        media_mode="base64",
    )
    assert payload["images_base64"] == ["data:image/jpeg;base64,imgb64"]
    assert "reference_images" not in payload
    assert "images" not in payload
    assert payload["audios_base64"] == [audio_item]
    assert "@图1" in payload["prompt"]
    assert "固定首帧" in payload["prompt"]
    assert "@音频1" in payload["prompt"]


def test_build_payload_url_mode_uses_public_urls_only():
    payload = build_seedance_submit_payload(
        model="SD2.0-480p-fast",
        prompt="口播测试",
        image_urls=["https://cdn.example.com/ref.jpg"],
        audio_urls=["https://cdn.example.com/voice.mp3"],
        media_mode="url",
    )
    assert payload["reference_image_urls"] == ["https://cdn.example.com/ref.jpg"]
    assert payload["image_urls"] == payload["reference_image_urls"]
    assert payload["image_url"] == "https://cdn.example.com/ref.jpg"
    assert payload["audio_urls"] == ["https://cdn.example.com/voice.mp3"]
    assert payload["reference_audios"] == payload["audio_urls"]
    assert payload["reference_audio"] == "https://cdn.example.com/voice.mp3"
    assert "images_base64" not in payload
    assert "audios_base64" not in payload
    assert "reference_images" not in payload
    assert "固定首帧" in payload["prompt"]
    assert "@音频1" in payload["prompt"]


def test_default_audio_mime_ext_for_m4a():
    mime, ext = _default_audio_mime_ext("data:audio/mp4;base64,AAAA")
    assert mime == "audio/mp4"
    assert ext == "m4a"

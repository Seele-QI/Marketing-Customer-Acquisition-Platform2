# 数字人视频创作（新）— API 路由

from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import re
import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter()
logger = logging.getLogger("dh_video_v2_routes")

_dh_video_v2_task_store: dict[str, dict[str, Any]] = {}
_TERMINAL_TASK_STATUSES = {
    "completed",
    "failed",
    "partial_failed",
    "timeout",
    "expired",
    "cancelled",
}


def _new_task_id() -> str:
    return f"dhv2_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"


class DhV2PlanScriptRequest(BaseModel):
    script: str = Field(..., min_length=1)
    creative_idea: str = ""
    image_count: int = Field(1, ge=1, le=9)
    has_audio_ref: bool = False
    dialogue_slices: list[str] | None = None
    plan_duration: int = Field(15, ge=15)
    segment_count: int = Field(1, ge=1)


class DhV2SegmentPayload(BaseModel):
    index: int = 0
    time_range: str = ""
    dialogue: str = ""
    shot_details: str = ""
    video_prompt: str = ""


class DhV2SubmitRequest(BaseModel):
    provider: str = "seedance"
    mode: str = "first_frame"
    images_base64: list[str] = Field(default_factory=list)
    audios_base64: list[str] | None = None
    aspect_ratio: str = "9:16"
    resolution: str = "720p"
    segments: list[DhV2SegmentPayload] = Field(..., min_length=1)
    client_task_id: str | None = None


class DhV2RetrySegmentRequest(BaseModel):
    taskId: str = Field(..., min_length=1)
    segmentIndex: int = Field(..., ge=0)


def _patch_task(task_id: str, **fields) -> None:
    stored = _dh_video_v2_task_store.get(task_id) or {}
    _dh_video_v2_task_store[task_id] = {**stored, **fields}


@router.get("/api/dh-video-v2/runtime-state")
async def dh_video_v2_runtime_state():
    active_count = sum(
        1
        for task in _dh_video_v2_task_store.values()
        if str(task.get("status") or "").lower() not in _TERMINAL_TASK_STATUSES
    )
    return {"active": active_count > 0, "active_count": active_count}


def _public_base_url(public_base: str) -> str:
    env_base = (
        os.getenv("NEXT_PUBLIC_FASTAPI_URL") or os.getenv("FASTAPI_URL") or ""
    ).strip().rstrip("/")
    if env_base:
        return env_base
    return (public_base or "").rstrip("/")


def _public_video_url(task_id: str, public_base: str, filename: str = "final.mp4") -> str:
    rel = f"/static/video-postprocess/dh-v2/{task_id}/{filename}"
    base = _public_base_url(public_base)
    if base:
        return f"{base}{rel}"
    return rel


def _strip_data_url(raw: str) -> str:
    s = (raw or "").strip()
    if s.startswith("data:"):
        m = re.match(r"^data:[^;]+;base64,(.+)$", s, re.I | re.S)
        if m:
            return m.group(1).strip()
    return s


def _persist_refs(output_dir: str, images_base64: list[str], audios_base64: list[str] | None) -> dict[str, Any]:
    refs_dir = os.path.join(output_dir, "refs")
    os.makedirs(refs_dir, exist_ok=True)
    image_paths: list[str] = []
    for i, img in enumerate(images_base64):
        path = os.path.join(refs_dir, f"image_{i}.b64")
        with open(path, "w", encoding="utf-8") as f:
            f.write(_strip_data_url(img))
        image_paths.append(path)
    audio_paths: list[str] = []
    for i, aud in enumerate(audios_base64 or []):
        path = os.path.join(refs_dir, f"audio_{i}.b64")
        with open(path, "w", encoding="utf-8") as f:
            f.write(_strip_data_url(aud))
        audio_paths.append(path)
    meta = {"image_paths": image_paths, "audio_paths": audio_paths}
    with open(os.path.join(refs_dir, "refs_meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f)
    return meta


def _load_refs(output_dir: str) -> tuple[list[str], list[str]]:
    meta_path = os.path.join(output_dir, "refs", "refs_meta.json")
    if not os.path.isfile(meta_path):
        return [], []
    with open(meta_path, encoding="utf-8") as f:
        meta = json.load(f)
    images: list[str] = []
    for p in meta.get("image_paths") or []:
        if os.path.isfile(p):
            with open(p, encoding="utf-8") as fh:
                images.append(fh.read().strip())
    audios: list[str] = []
    for p in meta.get("audio_paths") or []:
        if os.path.isfile(p):
            with open(p, encoding="utf-8") as fh:
                audios.append(fh.read().strip())
    return images, audios


def _init_segment_states(segs: list[dict]) -> list[dict[str, Any]]:
    states: list[dict[str, Any]] = []
    for s in segs:
        if not str(s.get("dialogue") or "").strip():
            continue
        idx = int(s.get("index", len(states)))
        states.append(
            {
                "index": idx,
                "status": "pending",
                "upstream_id": "",
                "video_url": "",
                "local_path": "",
                "error": "",
                "time_range": str(s.get("time_range") or f"{idx * 15}-{(idx + 1) * 15}s"),
                "dialogue": str(s.get("dialogue") or ""),
                "shot_details": str(s.get("shot_details") or ""),
                "video_prompt": str(s.get("video_prompt") or ""),
            }
        )
    return states


def _find_segment_state(task: dict, index: int) -> dict[str, Any] | None:
    for seg in task.get("segments") or []:
        if int(seg.get("index", -1)) == index:
            return seg
    return None


def _update_segment_state(task_id: str, index: int, **fields) -> None:
    task = _dh_video_v2_task_store.get(task_id) or {}
    segments = list(task.get("segments") or [])
    updated = False
    for i, seg in enumerate(segments):
        if int(seg.get("index", -1)) == index:
            segments[i] = {**seg, **fields}
            updated = True
            break
    if not updated:
        return
    completed = sum(1 for s in segments if s.get("status") == "completed")
    _patch_task(task_id, segments=segments, segments_completed=completed)


def _segments_all_completed(segments: list[dict]) -> bool:
    if not segments:
        return False
    return all(s.get("status") == "completed" for s in segments)


def _segments_any_failed(segments: list[dict]) -> bool:
    return any(s.get("status") in ("failed", "timeout") for s in segments)


async def _try_concat_task(task_id: str, public_base: str) -> bool:
    from lib.dh_video_v2_service import concat_segment_videos

    from main import POST_PROCESS_ROOT

    task = _dh_video_v2_task_store.get(task_id) or {}
    segments = list(task.get("segments") or [])
    if not _segments_all_completed(segments):
        return False

    output_dir = os.path.join(POST_PROCESS_ROOT, "dh-v2", task_id)
    paths = []
    for seg in sorted(segments, key=lambda s: int(s.get("index", 0))):
        lp = seg.get("local_path") or os.path.join(output_dir, f"segment_{seg['index']}.mp4")
        if not os.path.isfile(lp):
            return False
        paths.append(lp)

    _patch_task(task_id, status="concatenating", stage_label="正在拼接各段视频…", progress=92)
    try:
        final_path = concat_segment_videos(paths, output_dir)
        rel = f"/static/video-postprocess/dh-v2/{task_id}/final.mp4"
        _patch_task(
            task_id,
            status="completed",
            progress=100,
            stage_label="生成完成",
            video_url=_public_video_url(task_id, public_base),
            result_url=rel,
            local_path=final_path,
            error="",
        )
        return True
    except Exception as e:
        logger.exception("dh-v2 concat failed %s", task_id)
        _patch_task(
            task_id,
            status="partial_failed",
            error=str(e) or "拼接失败",
            stage_label="拼接失败",
        )
        return False


async def _run_dh_video_v2_pipeline(task_id: str, req: DhV2SubmitRequest, public_base: str) -> None:
    from lib.dh_video_v2_service import run_multi_segment_pipeline

    from main import POST_PROCESS_ROOT

    output_dir = os.path.join(POST_PROCESS_ROOT, "dh-v2", task_id)
    os.makedirs(output_dir, exist_ok=True)

    segs = [s.model_dump() for s in req.segments]
    segs = [s for s in segs if str(s.get("dialogue") or "").strip()]
    total = len(segs)
    if total < 1:
        _patch_task(task_id, status="failed", error="无有效台词段，请检查分镜脚本", stage_label="生成失败")
        return

    segment_states = _init_segment_states(segs)
    _persist_refs(output_dir, req.images_base64, req.audios_base64)
    client_id = req.client_task_id or task_id

    def on_segment_update(index: int, status: str, extra: dict) -> None:
        fields: dict[str, Any] = {"status": status}
        if extra.get("upstream_id"):
            fields["upstream_id"] = extra["upstream_id"]
        if extra.get("error"):
            fields["error"] = extra["error"]
        if extra.get("local_path"):
            lp = extra["local_path"]
            fields["local_path"] = lp
            fields["video_url"] = _public_video_url(task_id, public_base, f"segment_{index}.mp4")
        _update_segment_state(task_id, index, **fields)

    def on_progress(done: int, tot: int, seg_idx: int) -> None:
        pct = 10 + int((done / max(tot, 1)) * 75)
        _patch_task(
            task_id,
            status="processing",
            progress=pct,
            stage_label=f"段 {done}/{tot} 已完成（末段 #{seg_idx + 1}）",
        )

    try:
        _patch_task(
            task_id,
            status="processing",
            progress=5,
            stage_label="提交各段 Seedance 任务…",
            segment_count=total,
            segments_completed=0,
            segments=segment_states,
            error="",
            submit_meta={
                "aspect_ratio": req.aspect_ratio or "9:16",
                "client_task_id": client_id,
                "provider": req.provider,
                "mode": req.mode or "first_frame",
            },
        )
        if req.provider != "seedance":
            raise RuntimeError("当前仅实现 Seedance aicost 多段管线")
        if not req.images_base64:
            raise RuntimeError("请上传至少 1 张参考图")

        for i, s in enumerate(req.segments):
            if not str(s.dialogue or "").strip():
                continue
            if not (s.video_prompt or "").strip():
                raise RuntimeError(f"段 {i + 1} 缺少视频提示词")

        images, audios = _load_refs(output_dir)
        if not images:
            images = [_strip_data_url(x) for x in req.images_base64]
        if not audios and req.audios_base64:
            audios = [_strip_data_url(x) for x in req.audios_base64]

        seedance_mode = req.mode or "first_frame"
        final_path = await run_multi_segment_pipeline(
            segments=segs,
            images_base64=images,
            audios_base64=audios or None,
            aspect_ratio=req.aspect_ratio or "9:16",
            output_dir=output_dir,
            client_task_id=client_id,
            on_progress=on_progress,
            on_segment_update=on_segment_update,
            mode=seedance_mode,
        )

        task = _dh_video_v2_task_store.get(task_id) or {}
        segments = list(task.get("segments") or [])

        if final_path:
            rel = f"/static/video-postprocess/dh-v2/{task_id}/final.mp4"
            _patch_task(
                task_id,
                status="completed",
                progress=100,
                stage_label="生成完成",
                video_url=_public_video_url(task_id, public_base),
                result_url=rel,
                local_path=final_path,
                segments_completed=total,
                segments=segments,
                error="",
            )
        elif _segments_any_failed(segments):
            _patch_task(
                task_id,
                status="partial_failed",
                progress=85,
                stage_label="部分段生成失败，可重试失败段",
                segments=segments,
                segments_completed=sum(1 for s in segments if s.get("status") == "completed"),
                error="部分视频段生成失败",
            )
        else:
            _patch_task(
                task_id,
                status="failed",
                error="视频生成失败",
                stage_label="生成失败",
                segments=segments,
            )
    except Exception as e:
        logger.exception("dh-video-v2 pipeline failed %s", task_id)
        _patch_task(
            task_id,
            status="failed",
            error=str(e) or "视频生成失败",
            stage_label="生成失败",
        )


async def _run_retry_segment(task_id: str, segment_index: int, public_base: str) -> None:
    from lib.dh_video_v2_service import retry_single_segment

    from main import POST_PROCESS_ROOT

    task = _dh_video_v2_task_store.get(task_id) or {}
    seg_state = _find_segment_state(task, segment_index)
    if not seg_state:
        return

    output_dir = os.path.join(POST_PROCESS_ROOT, "dh-v2", task_id)
    meta = task.get("submit_meta") or {}
    client_id = str(meta.get("client_task_id") or task_id)
    aspect_ratio = str(meta.get("aspect_ratio") or "9:16")
    seedance_mode = str(meta.get("mode") or "first_frame")
    images, audios = _load_refs(output_dir)
    total = int(task.get("segment_count") or len(task.get("segments") or []))

    seg_payload = {
        "index": segment_index,
        "dialogue": seg_state.get("dialogue") or "",
        "video_prompt": seg_state.get("video_prompt") or "",
        "time_range": seg_state.get("time_range") or "",
    }

    def on_segment_update(index: int, status: str, extra: dict) -> None:
        fields: dict[str, Any] = {"status": status, "error": ""}
        if extra.get("upstream_id"):
            fields["upstream_id"] = extra["upstream_id"]
        if extra.get("error"):
            fields["error"] = extra["error"]
        if extra.get("local_path"):
            lp = extra["local_path"]
            fields["local_path"] = lp
            fields["video_url"] = _public_video_url(task_id, public_base, f"segment_{index}.mp4")
        _update_segment_state(task_id, index, **fields)

    _patch_task(task_id, status="processing", stage_label=f"重试段 #{segment_index + 1}…")
    _update_segment_state(task_id, segment_index, status="submitting", error="")

    local_path, err = await retry_single_segment(
        seg=seg_payload,
        seg_index=segment_index,
        total_segs=total,
        images_base64=images,
        audios_base64=audios or None,
        aspect_ratio=aspect_ratio,
        output_dir=output_dir,
        client_task_id=client_id,
        on_segment_update=on_segment_update,
        mode=seedance_mode,
    )

    task = _dh_video_v2_task_store.get(task_id) or {}
    segments = list(task.get("segments") or [])

    if err or not local_path:
        _patch_task(
            task_id,
            status="partial_failed",
            stage_label=f"段 #{segment_index + 1} 重试失败",
            error=err or "重试失败",
            segments=segments,
        )
        return

    if _segments_all_completed(segments):
        await _try_concat_task(task_id, public_base)
    else:
        _patch_task(
            task_id,
            status="partial_failed",
            stage_label="部分段仍待完成",
            segments=segments,
            segments_completed=sum(1 for s in segments if s.get("status") == "completed"),
        )


@router.post("/api/dh-video-v2/plan-script")
async def dh_video_v2_plan_script(req: Request):
    """已废弃：分镜创作须走 Next.js /api/dh-video-v2/plan-script（GPT/Claude/DeepSeek）。"""
    from main import get_current_user

    user = get_current_user(req)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN"})

    raise HTTPException(
        status_code=501,
        detail="分镜创作请使用 Next.js 接口，需配置 SONETTO_GPT_API_KEY / SONETTO_CLAUDE_API_KEY / DEEPSEEK_API_KEY",
    )


@router.post("/api/dh-video-v2/auto-prompt")
async def dh_video_v2_auto_prompt(req: Request):
    """保留兼容；新流程请用 plan-script。"""
    from main import DEEPSEEK_API_KEY, get_current_user
    from lib.dh_video_v2_prompt import generate_dh_v2_video_prompt

    user = get_current_user(req)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN"})
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=503, detail="DEEPSEEK_API_KEY 未配置")

    body = await req.json()
    try:
        prompt = await generate_dh_v2_video_prompt(DEEPSEEK_API_KEY, **body)
        return {"prompt": prompt}
    except Exception as e:
        raise HTTPException(status_code=502, detail={"code": "AI_ERROR", "message": str(e)}) from e


@router.post("/api/dh-video-v2/submit")
async def dh_video_v2_submit(req: Request):
    from lib.api_auth import consume_dh_v2_video_segments
    from lib.credit import CreditError
    from main import get_current_user

    user = get_current_user(req)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN"})

    body = await req.json()
    submit_req = DhV2SubmitRequest(**body)
    task_id = _new_task_id()
    business_task_id = (submit_req.client_task_id or task_id).strip()
    public_base = str(req.base_url).rstrip("/")

    active_segs = [s for s in submit_req.segments if str(s.dialogue or "").strip()]
    segment_states = _init_segment_states([s.model_dump() for s in active_segs])
    segment_count = len(active_segs)

    if segment_count < 1:
        raise HTTPException(status_code=400, detail="请至少提供一段有效口播")

    try:
        consume_dh_v2_video_segments(
            user_id=user.id,
            ref_id=f"{task_id}:video",
            segment_count=segment_count,
            provider=submit_req.provider,
            business_task_id=business_task_id,
            business_type="video_digital_human",
            billing_stage="video_generation",
        )
    except CreditError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e

    _dh_video_v2_task_store[task_id] = {
        "task_id": task_id,
        "user_id": user.id,
        "status": "queued",
        "progress": 0,
        "stage_label": "排队中",
        "video_url": "",
        "segment_count": len(active_segs),
        "segments_completed": 0,
        "segments": segment_states,
        "error": "",
        "provider": submit_req.provider,
        "business_task_id": business_task_id,
        "created_at": time.time(),
    }

    asyncio.create_task(_run_dh_video_v2_pipeline(task_id, submit_req, public_base))
    return {"task_id": task_id, "status": "queued", "provider": submit_req.provider}


@router.post("/api/dh-video-v2/retry-segment")
async def dh_video_v2_retry_segment(req: Request):
    from lib.api_auth import consume_dh_v2_video_retry
    from lib.credit import CreditError
    from main import get_current_user

    user = get_current_user(req)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN"})

    body = await req.json()
    retry_req = DhV2RetrySegmentRequest(**body)
    task_id = retry_req.taskId.strip()
    task = _dh_video_v2_task_store.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if task.get("user_id") != user.id:
        raise HTTPException(status_code=403, detail="无权操作此任务")

    seg = _find_segment_state(task, retry_req.segmentIndex)
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    if seg.get("status") not in ("failed", "timeout"):
        raise HTTPException(status_code=400, detail="该段无需重试")

    ref_id = f"{task_id}:retry:{retry_req.segmentIndex}"
    provider = str(task.get("provider") or "seedance")
    business_task_id = str(task.get("business_task_id") or task_id)
    try:
        consume_dh_v2_video_retry(
            user_id=user.id,
            ref_id=ref_id,
            provider=provider,
            business_task_id=business_task_id,
            business_type="video_digital_human",
            billing_stage="video_retry",
            note=f"dh-v2 重试段 #{retry_req.segmentIndex + 1}",
        )
    except CreditError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e

    public_base = str(req.base_url).rstrip("/")
    asyncio.create_task(_run_retry_segment(task_id, retry_req.segmentIndex, public_base))
    return {"ok": True, "task_id": task_id, "segment_index": retry_req.segmentIndex}


def _apply_task_timeout_if_needed(task_id: str, task: dict[str, Any]) -> dict[str, Any]:
    from lib.dh_video_v2_service import task_timeout

    status = str(task.get("status") or "").lower()
    if status in ("completed", "failed", "partial_failed", "timeout", "expired"):
        return task
    created = float(task.get("created_at") or 0)
    if created <= 0:
        return task
    if time.time() - created <= task_timeout():
        return task
    timed_out = {
        **task,
        "status": "timeout",
        "error": "任务超时（已超过 50 分钟）",
        "stage_label": "超时",
    }
    _dh_video_v2_task_store[task_id] = timed_out
    return timed_out


@router.get("/api/dh-video-v2/status")
async def dh_video_v2_status(taskId: str):
    tid = (taskId or "").strip()
    if not tid:
        raise HTTPException(status_code=400, detail="Missing taskId")
    raw = _dh_video_v2_task_store.get(tid)
    if not raw:
        raise HTTPException(status_code=404, detail="Task not found")
    task = _apply_task_timeout_if_needed(tid, raw)
    return {
        "task_id": tid,
        "status": task.get("status", "unknown"),
        "progress": task.get("progress", 0),
        "stage_label": task.get("stage_label", ""),
        "video_url": task.get("video_url", ""),
        "result_url": task.get("result_url", ""),
        "error": task.get("error", ""),
        "provider": task.get("provider", "seedance"),
        "segment_count": int(task.get("segment_count") or 0),
        "segments_completed": int(task.get("segments_completed") or 0),
        "segments": task.get("segments") or [],
    }

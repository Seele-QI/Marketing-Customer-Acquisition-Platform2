# 数字人视频创作（新）— API 路由

from __future__ import annotations

import asyncio
import logging
import os
import time
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

router = APIRouter()
logger = logging.getLogger("dh_video_v2_routes")

_dh_video_v2_task_store: dict[str, dict[str, Any]] = {}


def _new_task_id() -> str:
    return f"dhv2_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"


class DhV2PlanScriptRequest(BaseModel):
    script: str = Field(..., min_length=1)
    creative_idea: str = ""
    image_count: int = Field(1, ge=1, le=9)
    has_audio_ref: bool = False
    dialogue_slices: list[str] = Field(..., min_length=1)
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
    mode: str = "multimodal"
    images_base64: list[str] = Field(default_factory=list)
    audios_base64: list[str] | None = None
    aspect_ratio: str = "9:16"
    resolution: str = "720p"
    segments: list[DhV2SegmentPayload] = Field(..., min_length=1)
    client_task_id: str | None = None


def _patch_task(task_id: str, **fields) -> None:
    stored = _dh_video_v2_task_store.get(task_id) or {}
    _dh_video_v2_task_store[task_id] = {**stored, **fields}


def _public_video_url(task_id: str, public_base: str) -> str:
    rel = f"/static/video-postprocess/dh-v2/{task_id}/final.mp4"
    env_base = (
        os.getenv("NEXT_PUBLIC_FASTAPI_URL") or os.getenv("FASTAPI_URL") or ""
    ).strip().rstrip("/")
    if env_base:
        return f"{env_base}{rel}"
    base = (public_base or "").rstrip("/")
    if base:
        return f"{base}{rel}"
    return rel


async def _run_dh_video_v2_pipeline(task_id: str, req: DhV2SubmitRequest, public_base: str) -> None:
    from lib.dh_video_v2_service import run_multi_segment_pipeline

    from main import POST_PROCESS_ROOT

    output_dir = os.path.join(POST_PROCESS_ROOT, "dh-v2", task_id)
    os.makedirs(output_dir, exist_ok=True)

    segs = [s.model_dump() for s in req.segments]
    total = len(segs)

    def on_progress(done: int, tot: int, seg_idx: int) -> None:
        pct = 10 + int((done / max(tot, 1)) * 80)
        _patch_task(
            task_id,
            status="processing",
            progress=pct,
            stage_label=f"段 {done}/{tot} 已完成（末段 #{seg_idx + 1}）",
            segments_completed=done,
            segment_count=tot,
        )

    try:
        _patch_task(
            task_id,
            status="processing",
            progress=5,
            stage_label="提交各段 Seedance 任务…",
            segment_count=total,
            segments_completed=0,
            error="",
        )
        if req.provider != "seedance":
            raise RuntimeError("当前仅实现 Seedance aicost 多段管线")

        if not req.images_base64:
            raise RuntimeError("请上传至少 1 张参考图")

        for i, s in enumerate(req.segments):
            if not (s.video_prompt or "").strip():
                raise RuntimeError(f"段 {i + 1} 缺少视频提示词")

        client_id = req.client_task_id or task_id
        final_path = await run_multi_segment_pipeline(
            segments=segs,
            images_base64=req.images_base64,
            audios_base64=req.audios_base64,
            aspect_ratio=req.aspect_ratio or "9:16",
            output_dir=output_dir,
            client_task_id=client_id,
            on_progress=on_progress,
        )

        rel = f"/static/video-postprocess/dh-v2/{task_id}/final.mp4"
        _patch_task(
            task_id,
            status="completed",
            progress=100,
            stage_label="生成完成",
            video_url=_public_video_url(task_id, public_base) if public_base else rel,
            result_url=rel,
            local_path=final_path,
            segments_completed=total,
        )
    except Exception as e:
        logger.exception("dh-video-v2 pipeline failed %s", task_id)
        _patch_task(
            task_id,
            status="failed",
            error=str(e) or "视频生成失败",
            stage_label="生成失败",
        )


@router.post("/api/dh-video-v2/plan-script")
async def dh_video_v2_plan_script(req: Request):
    from main import DEEPSEEK_API_KEY, get_current_user
    from lib.dh_video_v2_local_plan import build_local_segment_prompt
    from lib.dh_video_v2_script_plan import generate_dh_v2_script_plan_segments

    user = get_current_user(req)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN"})

    body = await req.json()
    plan_req = DhV2PlanScriptRequest(**body)
    chars = len(plan_req.script.replace(" ", "").replace("\n", "").replace("\t", ""))

    def _build_plan_from_segments(segments: list[dict], *, source: str) -> dict:
        return {
            "char_count": chars,
            "duration_min": round(chars / 3.3, 1),
            "duration_max": round(chars / 2.8, 1),
            "plan_duration": plan_req.plan_duration,
            "segment_count": plan_req.segment_count,
            "segments": segments,
            "plan_source": source,
        }

    try:
        if DEEPSEEK_API_KEY:
            ai_segments = await generate_dh_v2_script_plan_segments(
                DEEPSEEK_API_KEY,
                script=plan_req.script,
                creative_idea=plan_req.creative_idea,
                dialogue_slices=plan_req.dialogue_slices,
                image_count=plan_req.image_count,
                has_audio_ref=plan_req.has_audio_ref,
                plan_duration=plan_req.plan_duration,
            )
            segments = []
            for i, seg in enumerate(ai_segments):
                segments.append(
                    {
                        "index": i,
                        "time_range": f"{i * 15}-{(i + 1) * 15}s",
                        "dialogue": plan_req.dialogue_slices[i]
                        if i < len(plan_req.dialogue_slices)
                        else seg.get("dialogue", ""),
                        "shot_details": seg.get("shot_details", ""),
                        "video_prompt": seg.get("video_prompt", ""),
                    }
                )
            return {"plan": _build_plan_from_segments(segments, source="ai")}
    except Exception as e:
        logger.warning("dh-v2 AI plan failed, using local template: %s", e)

    # 本地模板兜底（无需 DeepSeek）
    segments = []
    total = len(plan_req.dialogue_slices)
    for i, dlg in enumerate(plan_req.dialogue_slices):
        shot, prompt = build_local_segment_prompt(
            dialogue=dlg,
            creative_idea=plan_req.creative_idea,
            seg_index=i,
            total_segs=total,
            has_audio_ref=plan_req.has_audio_ref,
        )
        segments.append(
            {
                "index": i,
                "time_range": f"{i * 15}-{(i + 1) * 15}s",
                "dialogue": dlg,
                "shot_details": shot,
                "video_prompt": prompt,
            }
        )
    return {"plan": _build_plan_from_segments(segments, source="local")}


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
    from main import get_current_user

    user = get_current_user(req)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN"})

    body = await req.json()
    submit_req = DhV2SubmitRequest(**body)
    task_id = _new_task_id()
    public_base = str(req.base_url).rstrip("/")

    _dh_video_v2_task_store[task_id] = {
        "task_id": task_id,
        "user_id": user.id,
        "status": "queued",
        "progress": 0,
        "stage_label": "排队中",
        "video_url": "",
        "segment_count": len(submit_req.segments),
        "segments_completed": 0,
        "error": "",
        "provider": submit_req.provider,
    }

    asyncio.create_task(_run_dh_video_v2_pipeline(task_id, submit_req, public_base))
    return {"task_id": task_id, "status": "queued", "provider": submit_req.provider}


@router.get("/api/dh-video-v2/status")
async def dh_video_v2_status(taskId: str):
    tid = (taskId or "").strip()
    if not tid:
        raise HTTPException(status_code=400, detail="Missing taskId")
    task = _dh_video_v2_task_store.get(tid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
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
    }

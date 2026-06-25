# Promo video routes module
# Imports are done at call-time to avoid circular imports
# This module is loaded by main.py

from fastapi import APIRouter, HTTPException, Request
import asyncio
import os
import time

router = APIRouter()


@router.post("/api/promo-video/submit")
async def promo_video_submit(req: Request):
    from main import (
        _promo_video_task_store, _new_promo_video_task_id,
        _run_promo_storyboard, get_current_user,
        PromoStoryboardRequest, PromoStoryboardStatusResponse,
    )
    import json
    body = await req.json()
    # Parse from raw body since the schema may differ
    story_req = PromoStoryboardRequest(**body)
    
    user = get_current_user(req)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN"})

    if not story_req.product_image:
        raise HTTPException(status_code=400, detail="Upload product image")
    if not story_req.product_name.strip():
        raise HTTPException(status_code=400, detail="Enter product name")
    if not story_req.selling_points:
        raise HTTPException(status_code=400, detail="Enter selling points")

    task_id = _new_promo_video_task_id()
    _promo_video_task_store[task_id] = {
        "task_id": task_id,
        "user_id": user.id,
        "status": "storyboard_queued",
        "progress": 0,
        "creative_prompt": "",
        "storyboard_grid_url": "",
        "frame_urls": [],
        "frame_paths": [],
        "duration": story_req.duration,
        "frame_count": story_req.frame_count,
        "ratio": story_req.ratio,
        "error": "",
    }

    asyncio.create_task(_run_promo_storyboard(task_id, story_req))
    return PromoStoryboardStatusResponse(task_id=task_id, status="storyboard_queued")


@router.get("/api/promo-video/storyboard-status")
async def promo_video_storyboard_status(task_id: str):
    from main import _promo_video_task_store, PromoStoryboardStatusResponse
    tid = (task_id or "").strip()
    if not tid:
        raise HTTPException(status_code=400, detail="Missing task_id")
    task = _promo_video_task_store.get(tid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return PromoStoryboardStatusResponse(
        task_id=tid,
        status=task.get("status", ""),
        frame_urls=task.get("frame_urls", []),
        storyboard_grid_url=task.get("storyboard_grid_url", ""),
        creative_prompt=task.get("creative_prompt", ""),
        progress=task.get("progress", 0),
        error=task.get("error", ""),
    )


@router.post("/api/promo-video/auto-prompt")
async def promo_video_auto_prompt(req: Request):
    from main import (
        _promo_video_task_store, DEEPSEEK_API_KEY,
        generate_video_prompt, get_current_user,
        PromoAutoPromptRequest,
    )
    import json
    body = await req.json()
    auto_req = PromoAutoPromptRequest(**body)
    
    user = get_current_user(req)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN"})

    story_task = _promo_video_task_store.get(auto_req.storyboard_task_id)
    if not story_task:
        raise HTTPException(status_code=404, detail="Storyboard task not found")

    try:
        prompt = await generate_video_prompt(
            DEEPSEEK_API_KEY,
            story_task.get("product_name", ""),
            story_task.get("selling_points", []),
            story_task.get("target_audience", ""),
            story_task.get("style", ""),
            auto_req.selected_count,
            story_task.get("duration", 15),
        )
        return {"prompt": prompt}
    except Exception as e:
        raise HTTPException(status_code=502, detail={"code": "AI_ERROR", "message": str(e)})


@router.post("/api/promo-video/generate-video")
async def promo_video_generate(req: Request):
    from main import (
        _promo_video_task_store, _new_promo_video_task_id,
        _run_promo_video, get_current_user, consume,
        calculate_promo_video_cost,
        PromoVideoGenerateRequest, PromoVideoStatusResponse,
    )
    import json
    body = await req.json()
    gen_req = PromoVideoGenerateRequest(**body)
    
    user = get_current_user(req)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN"})

    story_task = _promo_video_task_store.get(gen_req.storyboard_task_id)
    if not story_task:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    if not gen_req.selected_indices:
        raise HTTPException(status_code=400, detail="Select frames")
    if not gen_req.video_prompt.strip():
        raise HTTPException(status_code=400, detail="Enter prompt")

    duration = story_task.get("duration", 15)
    cost = calculate_promo_video_cost(duration)
    try:
        consume(user.id, cost, ref_id=gen_req.storyboard_task_id, note="Promo video " + str(duration) + "s")
    except Exception as e:
        raise HTTPException(status_code=402, detail={"code": "INSUFFICIENT_CREDIT", "message": "Need " + str(cost)})

    task_id = _new_promo_video_task_id()
    _promo_video_task_store[task_id] = {
        "task_id": task_id,
        "user_id": user.id,
        "status": "video_queued",
        "progress": 0,
        "video_url": "",
        "rh_task_ids": [],
        "error": "",
        "cost": cost,
    }

    asyncio.create_task(_run_promo_video(task_id, gen_req))
    return PromoVideoStatusResponse(task_id=task_id, status="video_queued")


@router.get("/api/promo-video/video-status")
async def promo_video_video_status(task_id: str):
    from main import _promo_video_task_store, PromoVideoStatusResponse
    tid = (task_id or "").strip()
    if not tid:
        raise HTTPException(status_code=400, detail="Missing task_id")
    task = _promo_video_task_store.get(tid)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return PromoVideoStatusResponse(
        task_id=tid,
        status=task.get("status", ""),
        video_url=task.get("video_url", ""),
        progress=task.get("progress", 0),
        error=task.get("error", ""),
    )

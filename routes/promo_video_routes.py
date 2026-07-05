# Promo video routes module

# Imports are done at call-time to avoid circular imports

# This module is loaded by main.py



from fastapi import APIRouter, HTTPException, Request

import asyncio

import logging

import os

import time



router = APIRouter()

logger = logging.getLogger("promo_video_routes")





async def _safe_run_promo_storyboard(task_id: str, story_req) -> None:

    from main import (

        _promo_video_task_store,

        _run_promo_storyboard,

        STAGE_PV_FAILED,

        PV_STAGE_LABELS,

    )

    try:

        await _run_promo_storyboard(task_id, story_req)

    except Exception as e:

        logger.exception("promo storyboard task %s crashed", task_id)

        task = _promo_video_task_store.get(task_id)

        if task and task.get("status") != "storyboard_ready":

            task["status"] = "storyboard_failed"

            task["stage"] = STAGE_PV_FAILED

            task["stage_label"] = PV_STAGE_LABELS.get(STAGE_PV_FAILED, STAGE_PV_FAILED)

            err = (task.get("error") or str(e) or "未知后台错误").strip()

            if not err:

                err = f"分镜失败（阶段: {task.get('stage_label', '未知')}）"

            task["error"] = err

            if not task.get("failed_stage"):

                task["failed_stage"] = task.get("stage") or STAGE_PV_FAILED





@router.post("/api/promo-video/submit")

async def promo_video_submit(req: Request):

    from main import (

        _promo_video_task_store, _new_promo_video_task_id,

        get_current_user,

        PromoStoryboardRequest, PromoStoryboardStatusResponse,

    )

    body = await req.json()

    story_req = PromoStoryboardRequest(**body)

    

    user = get_current_user(req)

    if not user:

        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN"})



    image_mode = (story_req.image_mode or "2").strip()

    if image_mode not in ("1", "2"):

        raise HTTPException(status_code=400, detail="Invalid image_mode (1=text, 2=image)")

    if image_mode == "2" and not (story_req.product_image or "").strip():

        raise HTTPException(status_code=400, detail="Upload product image for image-to-image mode")



    channel = (story_req.channel or "Third-party").strip()

    resolution = (story_req.resolution or "2k").strip()

    if resolution == "8k" and channel != "Official":

        raise HTTPException(status_code=400, detail="8k resolution requires Official channel")



    promo_script = (story_req.promo_script or "").strip()

    if not promo_script and story_req.selling_points:

        promo_script = "\n".join(story_req.selling_points)

    product_prompt = (story_req.product_prompt or "").strip()

    if not product_prompt:

        raise HTTPException(status_code=400, detail="Enter product prompt")

    if not promo_script:

        raise HTTPException(status_code=400, detail="Enter promo script")



    instance_type = (story_req.instance_type or "default").strip()



    task_id = _new_promo_video_task_id()

    public_base = str(req.base_url).rstrip("/")

    from lib.api_auth import consume_with_idempotency
    from lib.credit import CreditError

    try:
        consume_with_idempotency(
            user_id=user.id,
            scene="promo_storyboard",
            ref_id=f"{task_id}:storyboard",
            note="宣传分镜图生成",
        )
    except CreditError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e

    _promo_video_task_store[task_id] = {

        "task_id": task_id,

        "user_id": user.id,

        "status": "storyboard_queued",

        "progress": 0,

        "creative_prompt": product_prompt,

        "product_prompt": product_prompt,

        "promo_script": promo_script,

        "voice_rh_url": "",

        "audio_base64": (story_req.audio_base64 or "").strip(),

        "storyboard_grid_url": "",

        "frame_urls": [],

        "frame_paths": [],

        "duration": story_req.duration,

        "frame_count": story_req.frame_count,

        "ratio": story_req.ratio,

        "style": story_req.style or "科技感",

        "channel": channel,

        "resolution": resolution,

        "image_mode": image_mode,

        "instance_type": instance_type,

        "public_base_url": public_base,

        "error": "",

        "stage": "",

        "stage_label": "",

        "rh_task_id": "",

        "rh_crop_task_id": "",

        "failed_stage": "",

    }



    asyncio.create_task(_safe_run_promo_storyboard(task_id, story_req))

    return PromoStoryboardStatusResponse(task_id=task_id, status="storyboard_queued")





@router.get("/api/promo-video/storyboard-status")

async def promo_video_storyboard_status(taskId: str):

    from main import _promo_video_task_store, PromoStoryboardStatusResponse

    tid = (taskId or "").strip()

    if not tid:

        raise HTTPException(status_code=400, detail="Missing task_id")

    task = _promo_video_task_store.get(tid)

    if not task:

        raise HTTPException(status_code=404, detail="Task not found")

    status = task.get("status", "")
    frame_urls = task.get("frame_urls") or []
    error = task.get("error", "")
    if status == "storyboard_ready" and not frame_urls:
        status = "storyboard_failed"
        error = error or "分镜图已标记完成但帧 URL 未写入，请重试裁切"

    return PromoStoryboardStatusResponse(

        task_id=tid,

        status=status,

        frame_urls=frame_urls,

        storyboard_grid_url=task.get("storyboard_grid_url", ""),

        creative_prompt=task.get("creative_prompt", ""),

        progress=task.get("progress", 0),

        error=error,

        stage=task.get("stage", ""),

        stage_label=task.get("stage_label", ""),

        rh_task_id=task.get("rh_task_id", ""),

        rh_crop_task_id=task.get("rh_crop_task_id", ""),

        frame_count=int(task.get("frame_count") or 0),

        failed_stage=task.get("failed_stage", ""),

    )





@router.post("/api/promo-video/auto-prompt")

async def promo_video_auto_prompt(req: Request):

    from main import (

        _promo_video_task_store, DEEPSEEK_API_KEY,

        generate_video_prompt, get_current_user,

        PromoAutoPromptRequest,

    )

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

            story_task.get("promo_script") or story_task.get("creative_prompt") or "",

            story_task.get("style", "科技感"),

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

        _run_promo_video, get_current_user,

        calculate_promo_video_cost,

        PromoVideoGenerateRequest, PromoVideoStatusResponse,

    )
    from lib.api_auth import consume_with_idempotency
    from lib.credit import CreditError

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
    resolution = (gen_req.video_resolution or "").strip()
    cost = calculate_promo_video_cost(duration, resolution)

    try:
        consume_with_idempotency(
            user_id=user.id,
            scene="promo_video_segment",
            ref_id=gen_req.storyboard_task_id,
            note=f"宣传视频 {duration}s {resolution or 'default'}",
            cost=cost,
        )
    except CreditError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e



    task_id = _new_promo_video_task_id()

    public_base = str(req.base_url).rstrip("/")

    _promo_video_task_store[task_id] = {

        "task_id": task_id,

        "user_id": user.id,

        "status": "video_queued",

        "progress": 0,

        "video_url": "",

        "rh_task_ids": [],

        "rh_video_task_ids": [],

        "segment_count": max(1, duration // 15) if duration % 15 == 0 else max(1, (duration + 14) // 15),

        "segments_completed": 0,

        "storyboard_task_id": gen_req.storyboard_task_id,

        "public_base_url": public_base,

        "error": "",

        "cost": cost,

        "video_resolution": gen_req.video_resolution,

        "real_person_mode": gen_req.real_person_mode,

        "instance_type": gen_req.instance_type,

        "ratio": gen_req.ratio or story_task.get("ratio", "adaptive"),

    }



    asyncio.create_task(_run_promo_video(task_id, gen_req))

    return PromoVideoStatusResponse(task_id=task_id, status="video_queued")





@router.get("/api/promo-video/video-status")

async def promo_video_video_status(taskId: str):

    from main import _promo_video_task_store, PromoVideoStatusResponse

    tid = (taskId or "").strip()

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

        rh_video_task_ids=task.get("rh_video_task_ids") or task.get("rh_task_ids") or [],

        segment_count=int(task.get("segment_count") or 0),

        segments_completed=int(task.get("segments_completed") or 0),

    )





async def _safe_run_promo_retry_crop(task_id: str) -> None:

    from main import (

        _promo_video_task_store,

        _run_promo_retry_crop,

        STAGE_PV_FAILED,

        PV_STAGE_LABELS,

    )

    try:

        await _run_promo_retry_crop(task_id)

    except Exception as e:

        logger.exception("promo retry-crop task %s crashed", task_id)

        task = _promo_video_task_store.get(task_id)

        if task and task.get("status") != "storyboard_ready":

            task["status"] = "storyboard_failed"

            task["stage"] = STAGE_PV_FAILED

            task["stage_label"] = PV_STAGE_LABELS.get(STAGE_PV_FAILED, STAGE_PV_FAILED)

            err = (task.get("error") or str(e) or "裁切重试失败").strip()

            task["error"] = err

            if not task.get("failed_stage"):

                task["failed_stage"] = task.get("stage") or STAGE_PV_FAILED





@router.post("/api/promo-video/retry-crop")

async def promo_video_retry_crop(req: Request):

    from main import _promo_video_task_store, get_current_user, PromoStoryboardStatusResponse, POST_PROCESS_ROOT

    body = await req.json()

    tid = (body.get("taskId") or body.get("task_id") or "").strip()

    if not tid:

        raise HTTPException(status_code=400, detail="Missing task_id")

    user = get_current_user(req)

    if not user:

        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN"})

    task = _promo_video_task_store.get(tid)

    if not task:

        raise HTTPException(status_code=404, detail="Task not found")

    grid_url = (task.get("storyboard_grid_url") or "").strip()

    output_dir = os.path.join(POST_PROCESS_ROOT, tid)

    has_local_grid = False

    if os.path.isdir(output_dir):

        has_local_grid = any(

            name.startswith("storyboard_grid.")

            for name in os.listdir(output_dir)

            if os.path.isfile(os.path.join(output_dir, name))

        )

    if not grid_url and not has_local_grid:

        raise HTTPException(status_code=400, detail="No storyboard grid available to retry crop")

    task["status"] = "storyboard_queued"

    task["error"] = ""

    task["failed_stage"] = ""

    asyncio.create_task(_safe_run_promo_retry_crop(tid))

    return PromoStoryboardStatusResponse(task_id=tid, status="storyboard_queued")


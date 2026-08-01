"""Independent RunningHub economy digital-human workflow routes."""
from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import os
import re
import time
import uuid
from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from lib.dh_video_economy_service import (
    finalize_video_to_audio_duration,
    run_all_segments,
    select_runninghub_result_url,
)

router = APIRouter()
logger = logging.getLogger("dh_video_economy_routes")

_tasks: dict[str, dict[str, Any]] = {}
_pipeline_tasks: dict[str, asyncio.Task] = {}
_TASK_STATE_FILE = "task_state.json"
_INTERRUPTED_ERROR = "本地生成服务曾重启，任务记录已从磁盘恢复。未完成分段可单独重试。"


class EconomySubmitRequest(BaseModel):
    image_base64: str = Field(..., min_length=1)
    audio_base64: str = Field(..., min_length=1)
    script: str = Field(..., min_length=1, max_length=5000)
    motion_prompt: str = Field(..., min_length=1, max_length=500)


class EconomyRetryRequest(BaseModel):
    taskId: str = Field(..., min_length=1)
    segmentIndex: int = Field(..., ge=0)


class EconomyCancelRequest(BaseModel):
    taskId: str = Field(..., min_length=1)


def _new_task_id() -> str:
    return f"dhe_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"


def _persist_task(task_id: str) -> None:
    task = _tasks.get(task_id)
    if not task:
        return
    final_dir = Path(str(task.get("final_dir") or ""))
    if str(final_dir) == ".":
        return
    try:
        final_dir.mkdir(parents=True, exist_ok=True)
        state_path = final_dir / _TASK_STATE_FILE
        tmp_path = final_dir / f".{_TASK_STATE_FILE}.{os.getpid()}.tmp"
        tmp_path.write_text(json.dumps(task, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp_path, state_path)
    except Exception:
        logger.exception("failed to persist economy task state: %s", task_id)


def _recover_task(task_id: str, user_id: int, root: Path | None = None) -> dict[str, Any] | None:
    tid = (task_id or "").strip()
    if not re.fullmatch(r"dhe_[A-Za-z0-9_-]+", tid):
        return None
    if root is None:
        from main import GENERATED_VIDEO_CACHE_ROOT

        root = Path(GENERATED_VIDEO_CACHE_ROOT)
    final_dir = root / tid
    state_path = final_dir / _TASK_STATE_FILE
    task: dict[str, Any] | None = None
    if state_path.is_file():
        try:
            loaded = json.loads(state_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict) and loaded.get("task_id") == tid:
                task = loaded
        except Exception:
            logger.exception("failed to load economy task state: %s", tid)

    # Compatibility recovery for jobs created before state persistence existed.
    if task is None:
        work_dir = final_dir / "work"
        segment_dir = work_dir / "segments"
        segment_paths = sorted(segment_dir.glob("segment_[0-9][0-9][0-9].wav"))
        if not work_dir.is_dir() or not segment_paths:
            return None
        task = {
            "task_id": tid,
            "user_id": int(user_id),
            "status": "partial_failed",
            "stage": "segments",
            "stage_label": "服务重启，未完成分段可重试",
            "progress": 30,
            "audio_duration": 0,
            "segment_count": len(segment_paths),
            "segments_completed": 0,
            "segments": [
                {
                    "index": index,
                    "status": "timeout",
                    "upstream_id": "",
                    "video_url": "",
                    "local_path": "",
                    "error": _INTERRUPTED_ERROR,
                    "retry_count": 0,
                }
                for index, _ in enumerate(segment_paths)
            ],
            "video_url": "",
            "result_url": "",
            "error": _INTERRUPTED_ERROR,
            "cancel_requested": False,
            "created_at": final_dir.stat().st_ctime,
            "script": "",
            "motion_prompt": "",
            "image_path": str(next(iter(work_dir.glob("avatar.*")), work_dir / "avatar.png")),
            "audio_path": str(next(iter(work_dir.glob("reference.*")), work_dir / "reference.mp3")),
            "clone_audio_path": str(next(iter(work_dir.glob("clone_audio.*")), work_dir / "clone_audio.mp3")),
            "work_dir": str(work_dir),
            "final_dir": str(final_dir),
        }
    elif int(task.get("user_id", -1)) != int(user_id):
        return task
    elif str(task.get("status") or "") not in {
        "completed", "failed", "cancelled", "partial_failed", "insufficient_credit"
    }:
        segments = task.get("segments") or []
        for segment in segments:
            if segment.get("status") in {"pending", "uploading", "submitting", "running"}:
                segment.update(status="timeout", error=_INTERRUPTED_ERROR)
        task.update(
            status="partial_failed" if segments else "failed",
            stage="segments" if segments else "failed",
            stage_label="服务重启，未完成分段可重试" if segments else "任务因服务重启中断",
            error=_INTERRUPTED_ERROR,
        )
    _tasks[tid] = task
    _persist_task(tid)
    return task


def _patch(task_id: str, **fields: Any) -> None:
    current = _tasks.get(task_id)
    if current is not None:
        current.update(fields)
        _persist_task(task_id)


def _cancelled(task_id: str) -> bool:
    return bool((_tasks.get(task_id) or {}).get("cancel_requested"))


def _require_not_cancelled(task_id: str) -> None:
    if _cancelled(task_id):
        raise asyncio.CancelledError


def _data_url_parts(value: str, fallback_suffix: str) -> tuple[str, str]:
    raw = (value or "").strip()
    suffix = fallback_suffix
    match = re.match(r"^data:([^;,]+);base64,(.*)$", raw, re.I | re.S)
    if match:
        mime = match.group(1).lower()
        raw = match.group(2)
        suffix = {
            "image/jpeg": ".jpg",
            "image/png": ".png",
            "image/webp": ".webp",
            "audio/mpeg": ".mp3",
            "audio/mp3": ".mp3",
            "audio/wav": ".wav",
            "audio/x-wav": ".wav",
            "audio/mp4": ".m4a",
            "audio/aac": ".aac",
        }.get(mime, fallback_suffix)
    return "".join(raw.split()), suffix


def _persist_base64(value: str, destination_without_suffix: Path, fallback_suffix: str) -> Path:
    encoded, suffix = _data_url_parts(value, fallback_suffix)
    try:
        payload = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail={"code": "INVALID_BASE64", "message": "素材 Base64 无效"}) from exc
    if not payload:
        raise HTTPException(status_code=400, detail={"code": "EMPTY_MEDIA", "message": "素材内容为空"})
    path = destination_without_suffix.with_suffix(suffix)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    return path


def _segment(task_id: str, index: int) -> dict[str, Any] | None:
    for item in (_tasks.get(task_id) or {}).get("segments") or []:
        if int(item.get("index", -1)) == index:
            return item
    return None


def _update_segment(task_id: str, index: int, **fields: Any) -> None:
    task = _tasks.get(task_id)
    if not task:
        return
    item = _segment(task_id, index)
    if item is not None:
        item.update(fields)
    task["segments_completed"] = sum(1 for seg in task.get("segments") or [] if seg.get("status") == "completed")
    total = int(task.get("segment_count") or len(task.get("segments") or []))
    if task.get("stage") == "segments" and total > 0:
        task["progress"] = 30 + int(60 * task["segments_completed"] / total)
        task["stage_label"] = f"并发生成中：{task['segments_completed']}/{total} 段完成"


    _persist_task(task_id)


async def _generate_segment(task_id: str, index: int, audio_path: str, rh: Any) -> bool:
    from lib.safe_http import download_to_path
    from main import MAX_REMOTE_VIDEO_BYTES

    try:
        task = _tasks[task_id]
        _require_not_cancelled(task_id)
        _update_segment(task_id, index, status="uploading", error="")
        audio_url = await rh.upload_file(audio_path)
        _require_not_cancelled(task_id)
        _update_segment(task_id, index, status="submitting")
        upstream_id = await rh.submit_economy_video(task["image_remote_url"], audio_url, task["motion_prompt"])
        _update_segment(task_id, index, status="running", upstream_id=upstream_id)
        result = await rh.wait_for_completion(upstream_id, max_wait=50 * 60, poll_interval=5)
        video_url = select_runninghub_result_url(result, kind="video")
        local_path = Path(task["work_dir"]) / f"segment_{index:03d}.mp4"
        await download_to_path(video_url, str(local_path), max_bytes=MAX_REMOTE_VIDEO_BYTES, timeout=300.0)
        _require_not_cancelled(task_id)
        _update_segment(
            task_id,
            index,
            status="completed",
            video_url=video_url,
            local_path=str(local_path),
            error="",
        )
        return True
    except asyncio.CancelledError:
        raise
    except Exception as exc:
        message = str(exc) or "分段视频生成失败"
        status = "timeout" if "超时" in message or "timeout" in message.lower() else "failed"
        _update_segment(task_id, index, status=status, error=message)
        return False


async def _finalize(task_id: str) -> bool:
    from lib.video_concat import concatenate_videos_ffmpeg
    from main import _FFMPEG_EXE, _generated_video_public_url

    task = _tasks[task_id]
    segments = sorted(task.get("segments") or [], key=lambda item: int(item["index"]))
    if not segments or not all(item.get("status") == "completed" for item in segments):
        return False
    _require_not_cancelled(task_id)
    _patch(task_id, status="concatenating", stage="concat", stage_label="正在按序拼接分段视频", progress=92)
    concat_path = Path(task["work_dir"]) / "concatenated.mp4"
    await asyncio.to_thread(
        concatenate_videos_ffmpeg,
        [str(item["local_path"]) for item in segments],
        str(concat_path),
        _FFMPEG_EXE,
    )
    _require_not_cancelled(task_id)
    _patch(task_id, status="trimming", stage="trim", stage_label="正在按完整音频时长精确裁剪", progress=97)
    final_path = Path(task["final_dir"]) / "final.mp4"
    await finalize_video_to_audio_duration(
        ffmpeg_path=_FFMPEG_EXE,
        concat_video_path=concat_path,
        clone_audio_path=Path(task["clone_audio_path"]),
        output_path=final_path,
        duration_sec=float(task["audio_duration"]),
    )
    video_url = _generated_video_public_url(str(final_path))
    _patch(
        task_id,
        status="completed",
        stage="completed",
        stage_label="生成完成",
        progress=100,
        video_url=video_url,
        result_url=video_url,
        local_path=str(final_path),
        error="",
    )
    return True


async def _pipeline(task_id: str) -> None:
    from lib.api_auth import consume_billing_event, consume_voice_clone
    from lib.credit import CreditError
    from lib.safe_http import download_to_path
    from lib.video_audio_split import split_audio_segments
    from lib.video_postprocess import probe_audio_duration
    from main import MAX_REMOTE_AUDIO_BYTES, _FFMPEG_EXE, _get_rh_client

    task = _tasks[task_id]
    rh = None
    try:
        _patch(task_id, status="validating", stage="validation", stage_label="正在校验参考音频", progress=3)
        ref_duration = await asyncio.to_thread(probe_audio_duration, task["audio_path"])
        if ref_duration <= 0 or ref_duration > 30.0:
            raise ValueError(f"参考音频实际时长必须在 30 秒以内，当前约 {ref_duration:.2f} 秒")
        _require_not_cancelled(task_id)

        try:
            consume_voice_clone(
                user_id=task["user_id"],
                ref_id=f"{task_id}:clone",
                note="经济版数字人音色克隆",
                business_task_id=task_id,
                business_type="video_digital_human",
                billing_stage="voice_clone",
            )
        except CreditError as exc:
            insufficient = exc.status_code == 402 or (
                isinstance(exc.detail, dict)
                and exc.detail.get("code") == "INSUFFICIENT_CREDIT"
            )
            _patch(
                task_id,
                status="insufficient_credit" if insufficient else "failed",
                stage="billing",
                stage_label=(
                    "积分不足，未提交音色克隆任务"
                    if insufficient
                    else "音色克隆计费失败，未提交任务"
                ),
                progress=5,
                error=str(exc.detail.get("message") if isinstance(exc.detail, dict) else exc.detail),
            )
            return
        _patch(task_id, status="cloning", stage="clone", stage_label="正在克隆完整口播音频", progress=8)
        rh = _get_rh_client()
        reference_url, image_url = await asyncio.gather(rh.upload_file(task["audio_path"]), rh.upload_file(task["image_path"]))
        task["image_remote_url"] = image_url
        clone_upstream_id = await rh.submit_economy_audio_clone(reference_url, task["script"])
        task["clone_upstream_id"] = clone_upstream_id
        _persist_task(task_id)
        clone_result = await rh.wait_for_completion(clone_upstream_id, max_wait=10 * 60, poll_interval=5)
        clone_url = select_runninghub_result_url(clone_result, kind="audio")
        clone_path = Path(task["work_dir"]) / "clone_audio.mp3"
        await download_to_path(clone_url, str(clone_path), max_bytes=MAX_REMOTE_AUDIO_BYTES, timeout=180.0)
        clone_duration = await asyncio.to_thread(probe_audio_duration, str(clone_path))
        if clone_duration <= 0:
            raise RuntimeError("克隆音频时长无效")
        task["clone_audio_path"] = str(clone_path)
        task["audio_duration"] = round(float(clone_duration), 3)
        _persist_task(task_id)
        _require_not_cancelled(task_id)

        _patch(task_id, status="splitting", stage="split", stage_label="正在按 20 秒切分音频", progress=20)
        split_dir = Path(task["work_dir"]) / "segments"
        split_segments = await asyncio.to_thread(
            split_audio_segments,
            str(clone_path),
            str(split_dir),
            20,
            ffmpeg_exe=_FFMPEG_EXE,
        )
        segment_count = len(split_segments)
        task["segments"] = [
            {
                "index": index,
                "status": "pending",
                "upstream_id": "",
                "video_url": "",
                "local_path": "",
                "error": "",
                "retry_count": 0,
            }
            for index, _ in split_segments
        ]
        task["segment_count"] = segment_count
        _persist_task(task_id)
        try:
            consume_billing_event(
                user_id=task["user_id"],
                billing_key="video.dh_economy_segment",
                params={"segment_count": segment_count},
                ref_id=f"{task_id}:segments",
                business_task_id=task_id,
                business_type="video_digital_human",
                billing_stage="video_generation",
            )
        except CreditError as exc:
            insufficient = exc.status_code == 402 or (
                isinstance(exc.detail, dict)
                and exc.detail.get("code") == "INSUFFICIENT_CREDIT"
            )
            _patch(
                task_id,
                status="insufficient_credit" if insufficient else "failed",
                stage="billing",
                stage_label=(
                    "积分不足，未提交任何视频分段"
                    if insufficient
                    else "视频计费失败，未提交任何视频分段"
                ),
                progress=25,
                error=str(exc.detail.get("message") if isinstance(exc.detail, dict) else exc.detail),
            )
            return
        _require_not_cancelled(task_id)
        _patch(task_id, status="processing", stage="segments", stage_label=f"正在并发生成 {segment_count} 个视频分段", progress=30)
        await run_all_segments(split_segments, lambda index, path: _generate_segment(task_id, index, path, rh))
        completed = int(task.get("segments_completed") or 0)
        if completed != segment_count:
            _patch(
                task_id,
                status="partial_failed",
                stage="segments",
                stage_label=f"{completed}/{segment_count} 段完成，可重试失败分段",
                progress=30 + int(60 * completed / max(segment_count, 1)),
                error="部分视频分段生成失败",
            )
            return
        await _finalize(task_id)
    except asyncio.CancelledError:
        _patch(task_id, status="cancelled", stage="cancelled", stage_label="任务已取消", error="任务已取消；已提交的 RunningHub 任务可能继续运行")
    except Exception as exc:
        logger.exception("economy digital-human pipeline failed: %s", task_id)
        if not _cancelled(task_id):
            _patch(task_id, status="failed", stage="failed", stage_label="生成失败", error=str(exc) or "生成失败")
    finally:
        if rh is not None:
            await rh.close()
        _pipeline_tasks.pop(task_id, None)


async def _retry_segment(task_id: str, index: int) -> None:
    from main import _get_rh_client

    rh = _get_rh_client()
    try:
        task = _tasks[task_id]
        item = _segment(task_id, index)
        if item is None:
            return
        _patch(task_id, status="processing", stage="segments", stage_label=f"正在重试第 {index + 1} 段", error="")
        audio_path = str(Path(task["work_dir"]) / "segments" / f"segment_{index:03d}.wav")
        succeeded = await _generate_segment(task_id, index, audio_path, rh)
        if succeeded and all(seg.get("status") == "completed" for seg in task.get("segments") or []):
            await _finalize(task_id)
        elif not _cancelled(task_id):
            _patch(task_id, status="partial_failed", stage_label="仍有失败分段，可继续重试", error="部分视频分段生成失败")
    except asyncio.CancelledError:
        _patch(task_id, status="cancelled", stage="cancelled", stage_label="任务已取消")
    except Exception as exc:
        logger.exception("economy segment retry failed: %s/%s", task_id, index)
        _update_segment(task_id, index, status="failed", error=str(exc) or "重试失败")
        _patch(task_id, status="partial_failed", stage_label=f"第 {index + 1} 段重试失败", error=str(exc))
    finally:
        await rh.close()
        _pipeline_tasks.pop(f"{task_id}:retry:{index}", None)


def _owned_task(task_id: str, user_id: int) -> dict[str, Any]:
    task = _tasks.get(task_id) or _recover_task(task_id, user_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    if int(task.get("user_id", -1)) != int(user_id):
        raise HTTPException(status_code=403, detail={"code": "TASK_NOT_OWNED", "message": "无权访问该任务"})
    return task


@router.post("/api/dh-video-economy/submit")
async def submit(request: Request):
    from lib.api_auth import check_base64_size, require_user
    from main import GENERATED_VIDEO_CACHE_ROOT

    user = require_user(request)
    payload = EconomySubmitRequest(**(await request.json()))
    if not payload.script.strip():
        raise HTTPException(status_code=400, detail={"code": "EMPTY_SCRIPT", "message": "口播文案不能为空"})
    if not payload.motion_prompt.strip():
        raise HTTPException(status_code=400, detail={"code": "EMPTY_MOTION_PROMPT", "message": "动作提示词不能为空"})
    check_base64_size(payload.image_base64, max_mb=30, name="数字人形象图")
    check_base64_size(payload.audio_base64, max_mb=80, name="参考音频")
    task_id = _new_task_id()
    final_dir = Path(GENERATED_VIDEO_CACHE_ROOT) / task_id
    work_dir = final_dir / "work"
    image_path = _persist_base64(payload.image_base64, work_dir / "avatar", ".png")
    audio_path = _persist_base64(payload.audio_base64, work_dir / "reference", ".mp3")
    _tasks[task_id] = {
        "task_id": task_id,
        "user_id": user.id,
        "status": "queued",
        "stage": "queued",
        "stage_label": "已进入后台队列",
        "progress": 0,
        "audio_duration": 0,
        "segment_count": 0,
        "segments_completed": 0,
        "segments": [],
        "video_url": "",
        "result_url": "",
        "error": "",
        "cancel_requested": False,
        "created_at": time.time(),
        "script": payload.script.strip(),
        "motion_prompt": payload.motion_prompt.strip(),
        "image_path": str(image_path),
        "audio_path": str(audio_path),
        "work_dir": str(work_dir),
        "final_dir": str(final_dir),
    }
    _persist_task(task_id)
    pipeline = asyncio.create_task(_pipeline(task_id))
    _pipeline_tasks[task_id] = pipeline
    return {"task_id": task_id, "status": "queued"}


@router.get("/api/dh-video-economy/status")
async def status(request: Request, taskId: str):
    from lib.api_auth import require_user

    user = require_user(request)
    task = _owned_task(taskId.strip(), user.id)
    return {
        key: task.get(key)
        for key in (
            "task_id", "status", "stage", "stage_label", "progress", "audio_duration",
            "segment_count", "segments_completed", "segments", "video_url", "result_url", "error",
        )
    }


@router.post("/api/dh-video-economy/retry-segment")
async def retry_segment(request: Request):
    from lib.api_auth import consume_billing_event, require_user

    user = require_user(request)
    payload = EconomyRetryRequest(**(await request.json()))
    task_id = payload.taskId.strip()
    task = _owned_task(task_id, user.id)
    item = _segment(task_id, payload.segmentIndex)
    if item is None:
        raise HTTPException(status_code=404, detail="Segment not found")
    if item.get("status") not in ("failed", "timeout"):
        raise HTTPException(status_code=400, detail="仅 failed/timeout 分段允许重试")
    attempt = int(item.get("retry_count") or 0) + 1
    consume_billing_event(
        user_id=user.id,
        billing_key="video.dh_economy_retry",
        params={},
        ref_id=f"{task_id}:retry:{payload.segmentIndex}:{attempt}",
        business_task_id=task_id,
        business_type="video_digital_human",
        billing_stage="video_retry",
    )
    item["retry_count"] = attempt
    _persist_task(task_id)
    key = f"{payload.taskId}:retry:{payload.segmentIndex}"
    handle = asyncio.create_task(_retry_segment(payload.taskId, payload.segmentIndex))
    _pipeline_tasks[key] = handle
    return {"ok": True, "task_id": payload.taskId, "segment_index": payload.segmentIndex}


@router.post("/api/dh-video-economy/cancel")
async def cancel(request: Request):
    from lib.api_auth import require_user

    user = require_user(request)
    payload = EconomyCancelRequest(**(await request.json()))
    task = _owned_task(payload.taskId.strip(), user.id)
    if task.get("status") in ("completed", "failed", "cancelled"):
        return {"ok": True, "task_id": payload.taskId, "status": task.get("status")}
    task["cancel_requested"] = True
    _patch(payload.taskId, status="cancelled", stage="cancelled", stage_label="任务已取消", error="任务已取消；已提交的 RunningHub 任务可能继续运行")
    for key, handle in list(_pipeline_tasks.items()):
        if key == payload.taskId or key.startswith(f"{payload.taskId}:retry:"):
            handle.cancel()
    return {"ok": True, "task_id": payload.taskId, "status": "cancelled"}

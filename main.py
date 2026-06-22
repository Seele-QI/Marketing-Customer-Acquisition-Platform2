from __future__ import annotations

import os
import re
import base64
import tempfile
import logging
import asyncio
import time
import secrets

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from lib.runninghub_client import RunningHubClient, RunningHubError, build_motion_prompt, build_cover_prompt
from lib.video_postprocess import run_ffmpeg_post_process, run_ffmpeg_post_process_from_base64

from lib.auth import (
    SESSION_COOKIE, consume_email_code, create_session, destroy_session,
    get_current_user, get_or_create_user_by_hash, hash_email, mask_email,
    save_email_code, generate_code,
)
from lib.credit import get_account, list_ledger, consume, refund, cost_for, CreditError, REFUND_WINDOW_S
from lib.rate_limit import check_ip, check_email, check_consume
from lib.email import send_login_code

load_dotenv()

# 说明：前端「爆改 / 智能体」已改为 Next 直连 DeepSeek；本服务可选（pnpm dev:all 或单独部署时保留）。
app = FastAPI()
POST_PROCESS_ROOT = os.path.join(tempfile.gettempdir(), "video-postprocess-public")
os.makedirs(POST_PROCESS_ROOT, exist_ok=True)
app.mount("/static/video-postprocess", StaticFiles(directory=POST_PROCESS_ROOT), name="video-postprocess")

# 允许跨域（前端本地调试必须的配置）
cors_allow_origins_raw = (os.getenv("CORS_ALLOW_ORIGINS") or "").strip()
if cors_allow_origins_raw:
    cors_allow_origins = [o.strip() for o in cors_allow_origins_raw.split(",") if o.strip()]
    if cors_allow_origins:
        if "*" in cors_allow_origins:
            cors_allow_origins = ["*"]
            cors_allow_credentials = False
        else:
            cors_allow_credentials = True
    else:
        cors_allow_origins = ["*"]
        cors_allow_credentials = False
else:
    cors_allow_origins = ["*"]
    cors_allow_credentials = False

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials=cors_allow_credentials,
    allow_methods=["*"],
    allow_headers=["*"],
)

TIANAPI_KEY = (os.getenv("TIANAPI_KEY") or "").strip()
DEEPSEEK_API_KEY = (os.getenv("DEEPSEEK_API_KEY") or "").strip()
RUNNINGHUB_API_KEY = (os.getenv("RUNNINGHUB_API_KEY") or "").strip()

logging.basicConfig(level=logging.INFO)

# ── Pydantic models for video endpoints ──


class VideoGenerateRequest(BaseModel):
    image_base64: str
    audio_base64: str
    script: str
    gender: str = "female"  # "male" | "female" — 用于生成节点 254 的动作描述提示词
    resolution: str = "720p"
    bg_color: str = ""


class VoiceCloneRequest(BaseModel):
    audio_base64: str
    script: str


class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: int = 0
    video_url: str = ""
    audio_url: str = ""
    cover_url: str = ""
    post_video_url: str = ""
    post_stage: str = ""
    post_progress: int = 0
    post_error: str = ""
    error: str = ""
    estimated_minutes: int = 30


class CoverGenerateRequest(BaseModel):
    task_id: str
    image_url: str = ""
    gender: str = "female"


class CancelVideoTaskRequest(BaseModel):
    task_id: str


class ManualEditRequest(BaseModel):
    video_base64: str
    script: str
    business_card_text: str = ""
    bgm_dir: str = ""


class EditVideoRequest(BaseModel):
    task_id: str = ""
    video_url: str = ""
    video_base64: str = ""
    preset: str = "smooth"
    subtitle_text: str = ""
    business_card_text: str = ""
    bgm_dir: str = ""
    source: str = "generated"


class EditTaskStatusResponse(BaseModel):
    edit_job_id: str
    task_id: str = ""
    status: str
    progress: int = 0
    preset: str = "smooth"
    source: str = "generated"
    output_video_url: str = ""
    error: str = ""


def _require_deepseek_key() -> None:
    if not DEEPSEEK_API_KEY:
        raise HTTPException(
            status_code=503,
            detail=(
                "未配置 DEEPSEEK_API_KEY：请在项目根目录 .env 中写入 DEEPSEEK_API_KEY=你的密钥，"
                "保存后重启终端中的 uvicorn（使用 pnpm dev 时会一并启动 API）。"
            ),
        )

# --- 接口 1：全网热搜获取 ---
@app.get("/api/trends/fetch")
async def fetch_trends():
    if not TIANAPI_KEY:
        raise HTTPException(
            status_code=503,
            detail="未配置 TIANAPI_KEY：请在项目根目录 .env 中设置 TIANAPI_KEY 后重启 uvicorn。",
        )
    url = f"https://apis.tianapi.com/weibohot/index?key={TIANAPI_KEY}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            data = resp.json()
            if str(data.get("code")) != "200":
                raise HTTPException(status_code=500, detail="第三方数据源返回异常")
            
            result = []
            for i, item in enumerate(data.get("result", {}).get("list", [])[:6]):
                hot_val = item.get("hotwordnum", 0)
                try:
                    formatted_hot = f"{int(hot_val)/10000:.1f}w"
                except:
                    formatted_hot = "--"
                result.append({
                    "rank": i + 1,
                    "title": item.get("hotword", "未知标题"),
                    "platform": "微博",
                    "hot_value": formatted_hot
                })
            return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- 请求体定义 ---
class RewriteRequest(BaseModel):
    original_text: str

class AgentRequest(BaseModel):
    prompt: str

# --- 接口 2：弹窗 AI 爆改 ---
@app.post("/api/ai/rewrite")
async def rewrite_text(req: RewriteRequest):
    _require_deepseek_key()
    url = "https://api.deepseek.com/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {
                "role": "system", 
                "content": "你是一位资深的互联网热点营销专家。请针对用户发来的热搜话题进行深度商业拆解。要求：一针见血地指出热点背后的社会心理；从传播学角度分析为何能上热搜；给创作者提供1-2个落地蹭热点的切入角度。不要废话，多用空行排版。"
            },
            {"role": "user", "content": req.original_text}
        ]
    }
    try:
        # 设置了 60秒 的超长超时，保证大模型有充足时间写小作文
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return {"status": "success", "rewritten_text": data["choices"][0]["message"]["content"]}
    except httpx.HTTPStatusError as e:
        # 捕捉大模型接口返回的真实报错（如余额不足、Key无效等）
        if e.response is None:
            raise HTTPException(status_code=502, detail="DeepSeek 无响应体") from e
        error_detail = (e.response.text or "")[:8000]
        print(f"❌ DeepSeek 官方报错: {error_detail}")
        code = e.response.status_code
        if not (100 <= code <= 599):
            code = 502
        raise HTTPException(
            status_code=code,
            detail=f"DeepSeek 报错: {error_detail}",
        ) from e
    except Exception as e:
        print(f"❌ 本地系统未知报错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"系统错误: {str(e)}") from e

# --- 接口 3：小红书智能体专属 ---
@app.post("/api/agent/chat")
async def agent_chat(req: AgentRequest):
    _require_deepseek_key()
    url = "https://api.deepseek.com/chat/completions"
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }
    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "你现在是一个千万粉丝的小红书爆款制造机。精通小红书网感、爆款标题、Emoji排版和情绪营销。请根据用户的需求，直接输出高质量内容。"},
            {"role": "user", "content": req.prompt}
        ]
    }
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
            return {"status": "success", "reply": data["choices"][0]["message"]["content"]}
    except httpx.HTTPStatusError as e:
        # 捕捉大模型接口返回的真实报错（如余额不足、Key无效等）
        if e.response is None:
            raise HTTPException(status_code=502, detail="DeepSeek 无响应体") from e
        error_detail = (e.response.text or "")[:8000]
        print(f"❌ DeepSeek 官方报错: {error_detail}")
        code = e.response.status_code
        if not (100 <= code <= 599):
            code = 502
        raise HTTPException(
            status_code=code,
            detail=f"DeepSeek 报错: {error_detail}",
        ) from e
    except Exception as e:
        print(f"❌ 本地系统未知报错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"系统错误: {str(e)}") from e

# ════════════════════════════════════════════════════════════════════════
#  视频创作 API（RunningHub 集成）
# ════════════════════════════════════════════════════════════════════════

# 内存存储任务状态（生产环境应替换为数据库）
_task_store: dict[int, dict[str, dict]] = {}        # user_id → task_id → task
_poll_tasks: dict[int, dict[str, object]] = {}       # user_id → task_id → asyncio.Task
_edit_task_store: dict[int, dict[str, dict]] = {}    # user_id → job_id → job
_edit_tasks: dict[int, dict[str, object]] = {}       # user_id → job_id → asyncio.Task


def _get_rh_client() -> "RunningHubClient":
    """获取 RunningHub 客户端（验证 API Key）"""
    if not RUNNINGHUB_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="未配置 RUNNINGHUB_API_KEY。请在项目根目录 .env 中设置后重启服务。",
        )
    return RunningHubClient(RUNNINGHUB_API_KEY)


async def _base64_to_temp_file(b64: str, suffix: str) -> str:
    """Base64 字符串解码为临时文件，返回文件路径"""
    try:
        raw = base64.b64decode(b64)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Base64 解码失败: {e}")
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
    tmp.write(raw)
    tmp.close()
    return tmp.name


def _cleanup_temp(*paths: str):
    """清理临时文件（静默失败）"""
    for p in paths:
        try:
            os.unlink(p)
        except OSError:
            pass


def _new_edit_job_id() -> str:
    return f"edit_{int(time.time() * 1000)}_{os.urandom(3).hex()}"


def _preset_to_bgm_dir(req_bgm_dir: str, preset: str) -> str | None:
    if req_bgm_dir.strip():
        return req_bgm_dir.strip()
    if preset in {"dynamic", "cinematic", "broll"}:
        env_dir = (os.getenv("VIDEO_BGM_DIR") or "").strip()
        return env_dir or None
    return None


# ── POST /api/video/generate ──────────────────────────────────


@app.post("/api/video/generate", response_model=TaskStatusResponse)
async def video_generate(req: VideoGenerateRequest, request: Request):
    """
    提交视频创作任务

    流程: 解码 Base64 → 上传文件到 RunningHub → 音频克隆 → 视频生成 → 轮询返回结果
    """
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})

    if not req.image_base64 or not req.audio_base64 or not req.script.strip():
        raise HTTPException(status_code=400, detail="缺少必填参数: image_base64, audio_base64, script")

    rh = _get_rh_client()
    image_path = audio_path = None

    try:
        # 1. Base64 解码为临时文件
        image_path = await _base64_to_temp_file(req.image_base64, ".png")
        audio_path = await _base64_to_temp_file(req.audio_base64, ".mp3")

        # 2. 上传文件到 RunningHub
        print(f"[video/generate] Uploading image: {image_path}")
        image_url = await rh.upload_file(image_path)

        print(f"[video/generate] Uploading audio: {audio_path}")
        audio_url = await rh.upload_file(audio_path)

        # 3. 提交音频克隆任务
        print(f"[video/generate] Submitting audio clone: {audio_url}")
        audio_clone_task_id = await rh.submit_audio_clone(audio_url, audio_url, req.script)

        # 4. 等待音频克隆完成
        print(f"[video/generate] Waiting for audio clone: {audio_clone_task_id}")
        audio_result = await rh.wait_for_completion(audio_clone_task_id, max_wait=600)
        audio_clone_url = audio_result.get("results", [{}])[0].get("url", "")
        if not audio_clone_url:
            raise HTTPException(status_code=502, detail="音频克隆完成但未返回结果 URL")

        # 5. 提交视频生成任务
        print(f"[video/generate] Submitting video generation (gender={req.gender})")
        motion_prompt = build_motion_prompt(req.gender)
        video_task_id = await rh.submit_video(image_url, audio_clone_url, motion_prompt)

        # 6. 存储任务状态供后续轮询
        _task_store.setdefault(user.id, {})[video_task_id] = {
            "task_id": video_task_id,
            "status": "queued",
            "progress": 0,
            "video_url": "",
            "post_video_url": "",
            "post_stage": "",
            "post_progress": 0,
            "post_error": "",
            "audio_url": audio_clone_url,
            "script": req.script,
            "image_url": image_url,       # 用于封面图生成
            "gender": req.gender,          # 用于封面图 prompt
            "cover_url": "",               # 封面图 URL（异步填充）
            "error": "",
            "estimated_minutes": 30,
        }

        # 7. 启动后台轮询
        import asyncio as _asyncio
        poll_task = _asyncio.create_task(_poll_video_task(user.id, video_task_id))
        _poll_tasks.setdefault(user.id, {})[video_task_id] = poll_task

        return TaskStatusResponse(
            task_id=video_task_id,
            status="queued",
            progress=0,
            audio_url=audio_clone_url,
            estimated_minutes=30,
        )

    except RunningHubError as e:
        raise HTTPException(status_code=e.status_code or 502, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"视频生成流程异常: {e}")
    finally:
        _cleanup_temp(*[p for p in [image_path, audio_path] if p])


async def _run_post_process(user_id: int, task_id: str, video_url: str):
    stored = _task_store.get(user_id, {}).get(task_id, {})
    base_dir = os.path.join(tempfile.gettempdir(), "video-postprocess", task_id)
    os.makedirs(base_dir, exist_ok=True)
    input_path = os.path.join(base_dir, "input.mp4")
    post_video_url = ""
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.get(video_url)
            resp.raise_for_status()
            with open(input_path, "wb") as f:
                f.write(resp.content)
        _task_store[user_id][task_id] = {
            **stored,
            "task_id": task_id,
            "status": "post_processing",
            "progress": 100,
            "video_url": video_url,
            "post_stage": "running",
            "post_progress": 10,
            "post_error": "",
            "error": "",
            "estimated_minutes": 0,
        }
        result = await asyncio.to_thread(
            run_ffmpeg_post_process,
            task_id,
            input_path,
            base_dir,
            stored.get("script", ""),
            True,
        )
        if result.ok and result.output_path:
            post_video_url = result.output_path
            _task_store[user_id][task_id] = {
                **stored,
                "task_id": task_id,
                "status": "published",
                "progress": 100,
                "video_url": video_url,
                "post_video_url": post_video_url,
                "post_stage": "published",
                "post_progress": 100,
                "post_error": "",
                "error": "",
                "estimated_minutes": 0,
            }
        else:
            _task_store[user_id][task_id] = {
                **stored,
                "task_id": task_id,
                "status": "post_failed",
                "progress": 100,
                "video_url": video_url,
                "post_video_url": "",
                "post_stage": "failed",
                "post_progress": 0,
                "post_error": result.error,
                "error": "",
                "estimated_minutes": 0,
            }
    except Exception as e:
        _task_store[user_id][task_id] = {
            **stored,
            "task_id": task_id,
            "status": "post_failed",
            "progress": 100,
            "video_url": video_url,
            "post_video_url": "",
            "post_stage": "failed",
            "post_progress": 0,
            "post_error": str(e),
            "error": "",
            "estimated_minutes": 0,
        }
    finally:
        if post_video_url:
            _task_store[user_id][task_id]["post_video_url"] = post_video_url


async def _poll_video_task(user_id: int, task_id: str):
    """后台轮询视频生成任务，完成后自动触发后处理与封面图生成"""
    import asyncio
    rh = _get_rh_client()
    stored = _task_store.get(user_id, {}).get(task_id, {})
    try:
        result = await rh.wait_for_completion(task_id, max_wait=3000)
        video_url = ""
        results = result.get("results", [])
        if results:
            video_url = results[0].get("url", "")
        _task_store[user_id][task_id] = {
            **stored,
            "task_id": task_id,
            "status": "success",
            "progress": 100,
            "video_url": video_url,
            "error": "",
            "estimated_minutes": 0,
        }
        if video_url:
            _task_store[user_id][task_id] = {
                **_task_store.get(user_id, {}).get(task_id, {}),
                "status": "post_processing",
                "post_stage": "running",
                "post_progress": 5,
                "post_error": "",
            }
            asyncio.create_task(_run_post_process(user_id, task_id, video_url))

        image_url = stored.get("image_url", "")
        gender = stored.get("gender", "female")
        if image_url and video_url:
            try:
                print(f"[cover] Auto-generating cover for task {task_id}")
                cover_prompt = build_cover_prompt(gender)
                cover_task_id = await rh.submit_cover_image(
                    prompt=cover_prompt,
                    image_urls=[image_url],
                )
                cover_result = await rh.wait_for_completion(cover_task_id, max_wait=300)
                cover_url = ""
                for r in cover_result.get("results", []):
                    if r.get("url"):
                        cover_url = r["url"]
                        break
                if cover_url:
                    _task_store[user_id][task_id]["cover_url"] = cover_url
                    print(f"[cover] Cover generated: {cover_url[:80]}")
            except Exception as e:
                print(f"[cover] Cover generation failed (non-blocking): {e}")
    except asyncio.CancelledError:
        _task_store[user_id][task_id] = {
            **stored,
            "task_id": task_id,
            "status": "failed",
            "progress": 0,
            "video_url": "",
            "error": "用户已停止生成（中断任务不会返还积分）",
            "estimated_minutes": 0,
        }
        return
    except RunningHubError as e:
        _task_store[user_id][task_id] = {
            **stored,
            "task_id": task_id,
            "status": "failed",
            "progress": 0,
            "video_url": "",
            "error": str(e),
            "estimated_minutes": 0,
        }
    except Exception as e:
        _task_store[user_id][task_id] = {
            **stored,
            "task_id": task_id,
            "status": "failed",
            "progress": 0,
            "video_url": "",
            "error": f"轮询异常: {e}",
            "estimated_minutes": 0,
        }
    finally:
        _poll_tasks.get(user_id, {}).pop(task_id, None)

@app.post("/api/video/cancel")
async def video_cancel(req: CancelVideoTaskRequest, request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    task_id = (req.task_id or "").strip()
    if not task_id:
        raise HTTPException(status_code=400, detail="缺少 task_id 参数")

    task = _poll_tasks.get(user.id, {}).pop(task_id, None)
    if task is not None:
        try:
            task.cancel()
        except Exception:
            pass

    stored = _task_store.get(user.id, {}).get(task_id, {})
    _task_store.setdefault(user.id, {})[task_id] = {
        **stored,
        "task_id": task_id,
        "status": "failed",
        "progress": 0,
        "video_url": "",
        "error": "用户已停止生成（中断任务不会返还积分）",
        "estimated_minutes": 0,
    }
    return {"ok": True, "task_id": task_id}


# ── GET /api/video/status ─────────────────────────────────────


@app.get("/api/video/status", response_model=TaskStatusResponse)
async def video_status(taskId: str, request: Request):
    """查询视频任务状态"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    if not taskId:
        raise HTTPException(status_code=400, detail="缺少 taskId 参数")

    stored = _task_store.get(user.id, {}).get(taskId)
    if stored:
        return TaskStatusResponse(**stored)

    # 未在内存，从 RunningHub 实时查询
    rh = _get_rh_client()
    try:
        result = await rh.query_task(taskId)
        status = result.get("status", "unknown")
        video_url = ""
        if status == "SUCCESS":
            results = result.get("results", [])
            video_url = results[0].get("url", "") if results else ""
        task_status = status.lower()
        post_status = stored.get("post_stage", "") if stored else ""
        return TaskStatusResponse(
            task_id=taskId,
            status=task_status,
            progress=50 if status == "RUNNING" else 0,
            video_url=video_url,
            post_video_url=stored.get("post_video_url", "") if stored else "",
            post_stage=post_status,
            post_progress=stored.get("post_progress", 0) if stored else 0,
            post_error=stored.get("post_error", "") if stored else "",
            error=result.get("errorMessage", ""),
        )
    except RunningHubError as e:
        raise HTTPException(status_code=e.status_code or 502, detail=str(e))


# ── POST /api/video/cover ────────────────────────────────────


async def _run_edit_job(user_id: int, edit_job_id: str, req: EditVideoRequest):
    stored = _edit_task_store.get(user_id, {}).get(edit_job_id, {})
    task_id = req.task_id or edit_job_id
    output_dir = os.path.join(POST_PROCESS_ROOT, task_id, edit_job_id)
    os.makedirs(output_dir, exist_ok=True)
    try:
        _edit_task_store.setdefault(user_id, {})[edit_job_id] = {
            **stored,
            "edit_job_id": edit_job_id,
            "task_id": task_id,
            "status": "running",
            "progress": 15,
            "preset": req.preset,
            "source": req.source,
            "output_video_url": "",
            "error": "",
        }
        bgm_dir = _preset_to_bgm_dir(req.bgm_dir, req.preset)
        business_card_text = req.business_card_text if req.preset in {"cinematic", "broll"} else ""
        if req.video_base64.strip():
            result = await asyncio.to_thread(
                run_ffmpeg_post_process_from_base64,
                task_id,
                req.video_base64,
                output_dir,
                req.subtitle_text,
                business_card_text,
                bgm_dir,
                req.preset,
            )
        else:
            input_path = os.path.join(output_dir, "input.mp4")
            async with httpx.AsyncClient(timeout=180.0) as client:
                resp = await client.get(req.video_url)
                resp.raise_for_status()
                with open(input_path, "wb") as f:
                    f.write(resp.content)
            _edit_task_store[user_id][edit_job_id]["progress"] = 35
            result = await asyncio.to_thread(
                run_ffmpeg_post_process,
                task_id,
                input_path,
                output_dir,
                req.subtitle_text,
                True,
                business_card_text,
                bgm_dir,
                req.preset,
            )
        if result.ok and result.output_path:
            rel_path = os.path.relpath(result.output_path, POST_PROCESS_ROOT).replace(os.sep, "/")
            public_url = f"/static/video-postprocess/{rel_path}"
            _edit_task_store[user_id][edit_job_id] = {
                **_edit_task_store.get(user_id, {}).get(edit_job_id, {}),
                "status": "success",
                "progress": 100,
                "output_video_url": public_url,
                "error": "",
            }
            return
        _edit_task_store[user_id][edit_job_id] = {
            **_edit_task_store.get(user_id, {}).get(edit_job_id, {}),
            "status": "failed",
            "progress": 0,
            "output_video_url": "",
            "error": result.error or "剪辑失败",
        }
    except Exception as e:
        _edit_task_store[user_id][edit_job_id] = {
            **_edit_task_store.get(user_id, {}).get(edit_job_id, {}),
            "status": "failed",
            "progress": 0,
            "output_video_url": "",
            "error": str(e),
        }


@app.post("/api/video/edit", response_model=EditTaskStatusResponse)
async def video_edit(req: EditVideoRequest, request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    if not req.subtitle_text.strip():
        raise HTTPException(status_code=400, detail="缺少必填参数: subtitle_text")
    if not req.video_url.strip() and not req.video_base64.strip():
        raise HTTPException(status_code=400, detail="缺少必填参数: video_url 或 video_base64")

    edit_job_id = _new_edit_job_id()
    task_id = req.task_id or edit_job_id
    _edit_task_store.setdefault(user.id, {})[edit_job_id] = {
        "edit_job_id": edit_job_id,
        "task_id": task_id,
        "status": "queued",
        "progress": 0,
        "preset": req.preset,
        "source": req.source,
        "output_video_url": "",
        "error": "",
    }
    edit_task = asyncio.create_task(_run_edit_job(user.id, edit_job_id, req))
    _edit_tasks.setdefault(user.id, {})[edit_job_id] = edit_task
    return EditTaskStatusResponse(**_edit_task_store[user.id][edit_job_id])


@app.get("/api/video/edit/status", response_model=EditTaskStatusResponse)
async def video_edit_status(editJobId: str, request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    if not editJobId:
        raise HTTPException(status_code=400, detail="缺少 editJobId 参数")
    stored = _edit_task_store.get(user.id, {}).get(editJobId)
    if not stored:
        raise HTTPException(status_code=404, detail="剪辑任务不存在")
    return EditTaskStatusResponse(**stored)


@app.post("/api/video/manual-edit")
async def video_manual_edit(req: ManualEditRequest, request: Request):
    return await video_edit(EditVideoRequest(
        task_id="",
        video_url="",
        video_base64=req.video_base64,
        preset="caption",
        subtitle_text=req.script,
        business_card_text=req.business_card_text,
        bgm_dir=req.bgm_dir,
        source="manual",
    ), request)


@app.post("/api/video/cover")
async def video_cover(req: CoverGenerateRequest, request: Request):
    """独立提交封面图生成任务"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    rh = _get_rh_client()
    try:
        image_urls = [req.image_url] if req.image_url else []
        if not image_urls:
            stored = _task_store.get(user.id, {}).get(req.task_id, {})
            img = stored.get("image_url", "")
            if img:
                image_urls = [img]
        if not image_urls:
            raise HTTPException(status_code=400, detail="缺少参考图片 URL")

        prompt = build_cover_prompt(req.gender)
        cover_task_id = await rh.submit_cover_image(prompt=prompt, image_urls=image_urls)
        result = await rh.wait_for_completion(cover_task_id, max_wait=300)

        cover_url = ""
        for r in result.get("results", []):
            if r.get("url"):
                cover_url = r["url"]
                break

        if req.task_id and user.id in _task_store and req.task_id in _task_store[user.id]:
            _task_store[user.id][req.task_id]["cover_url"] = cover_url

        return {"cover_url": cover_url, "task_id": cover_task_id, "status": "success"}
    except RunningHubError as e:
        raise HTTPException(status_code=e.status_code or 502, detail=str(e))


# ── POST /api/video/clone-voice ───────────────────────────────


@app.post("/api/video/clone-voice")
async def video_clone_voice(req: VoiceCloneRequest, request: Request):
    """仅音色克隆（不生成视频）"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    if not req.audio_base64 or not req.script.strip():
        raise HTTPException(status_code=400, detail="缺少必填参数: audio_base64, script")

    rh = _get_rh_client()
    audio_path = None

    try:
        audio_path = await _base64_to_temp_file(req.audio_base64, ".mp3")
        print(f"[clone-voice] Uploading audio: {audio_path}")
        audio_url = await rh.upload_file(audio_path)

        print(f"[clone-voice] Submitting audio clone")
        task_id = await rh.submit_audio_clone(audio_url, audio_url, req.script)

        print(f"[clone-voice] Waiting for audio clone: {task_id}")
        result = await rh.wait_for_completion(task_id, max_wait=600)
        clone_url = result.get("results", [{}])[0].get("url", "")

        return {
            "audio_url": clone_url,
            "task_id": task_id,
            "message": "音色克隆完成" if clone_url else "克隆完成但无返回 URL",
        }

    except RunningHubError as e:
        raise HTTPException(status_code=e.status_code or 502, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"音色克隆流程异常: {e}")
    finally:
        _cleanup_temp(*[p for p in [audio_path] if p])


# ════════════════════════════════════════════════════════════════════════
#  一键分享 API
# ════════════════════════════════════════════════════════════════════════

import json as _json, secrets, time as _time
import hmac
import html

_share_store: dict[int, dict[str, dict]] = {}  # user_id → token → data
_share_index: dict[str, int] = {}               # token → user_id (O(1) lookup for public GET)

SHARE_TTL = 24 * 3600  # 24 hours
SHARE_STORE_MAX = 500


SHARE_BASE_URL = (os.getenv("SHARE_BASE_URL") or "").strip().rstrip("/")


class ShareGenerateRequest(BaseModel):
    videoUrl: str
    title: str
    description: str = ""
    tags: list[str] = []


def _make_share_token() -> str:
    return secrets.token_hex(16)


def _cleanup_expired_share_tokens(now: float | None = None) -> int:
    t = now if now is not None else _time.time()
    expired = []
    for user_id, user_tokens in list(_share_store.items()):
        for token, data in list(user_tokens.items()):
            created_at = 0.0
            try:
                created_at = float((data or {}).get("created_at", 0) or 0)
            except Exception:
                created_at = 0.0
            if t - created_at > SHARE_TTL:
                expired.append((user_id, token))
    for user_id, token in expired:
        _share_store.get(user_id, {}).pop(token, None)
        _share_index.pop(token, None)
    return len(expired)


def _enforce_share_store_capacity(max_size: int = SHARE_STORE_MAX) -> int:
    removed = 0
    if max_size <= 0:
        _share_store.clear()
        _share_index.clear()
        return 0
    total = sum(len(tokens) for tokens in _share_store.values())
    while total > max_size:
        # Remove oldest token across all users
        oldest_token = None
        oldest_user = None
        oldest_time = float("inf")
        for uid, user_tokens in _share_store.items():
            for token, data in user_tokens.items():
                ct = float((data or {}).get("created_at", 0) or 0)
                if ct < oldest_time:
                    oldest_time = ct
                    oldest_token = token
                    oldest_user = uid
        if oldest_token is None:
            break
        _share_store[oldest_user].pop(oldest_token, None)
        _share_index.pop(oldest_token, None)
        total -= 1
        removed += 1
    return removed


def _clean_share_tags(tags: list[str] | None) -> list[str]:
    items = tags or []
    seen: set[str] = set()
    cleaned: list[str] = []
    for t in items:
        s = str(t).strip()
        if not s:
            continue
        if s in seen:
            continue
        seen.add(s)
        cleaned.append(s)
        if len(cleaned) >= 5:
            break
    return cleaned


@app.post("/api/share/generate")
async def share_generate(req: ShareGenerateRequest, request: Request):
    """生成分享令牌和链接"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    video_url = (req.videoUrl or "").strip()
    title = (req.title or "").strip()
    description = str(req.description or "")
    if not video_url:
        raise HTTPException(status_code=400, detail="videoUrl 不能为空")
    if not title:
        raise HTTPException(status_code=400, detail="title 不能为空")
    if len(video_url) > 2048:
        raise HTTPException(status_code=400, detail="videoUrl 超出长度上限")
    if len(title) > 80:
        raise HTTPException(status_code=400, detail="title 超出长度上限")
    if len(description) > 2000:
        raise HTTPException(status_code=400, detail="description 超出长度上限")
    for t in (req.tags or []):
        s = str(t).strip()
        if s and len(s) > 30:
            raise HTTPException(status_code=400, detail="tag 超出长度上限")

    env_name = (os.getenv("NODE_ENV") or os.getenv("ENV") or "").strip().lower()
    base_from_env = (os.getenv("SHARE_BASE_URL") or "").strip().rstrip("/")
    if env_name == "production":
        share_api_token = (os.getenv("SHARE_API_TOKEN") or "").strip()
        if not share_api_token:
            raise HTTPException(
                status_code=503,
                detail="未配置 SHARE_API_TOKEN：生产环境必须设置 SHARE_API_TOKEN 后重启服务。",
            )
        req_token = (request.headers.get("X-Share-Token") or "").strip()
        if not req_token or not hmac.compare_digest(req_token, share_api_token):
            raise HTTPException(status_code=403, detail="Forbidden")
    if env_name == "production" and not base_from_env:
        raise HTTPException(
            status_code=503,
            detail="未配置 SHARE_BASE_URL：生产环境必须设置 SHARE_BASE_URL（如 https://example.com）后重启服务。",
        )

    now = _time.time()
    _cleanup_expired_share_tokens(now)
    _enforce_share_store_capacity(SHARE_STORE_MAX)

    token = _make_share_token()
    while token in _share_index:
        token = _make_share_token()
    _share_store.setdefault(user.id, {})[token] = {
        "videoUrl": video_url,
        "title": title,
        "description": description,
        "tags": _clean_share_tags(req.tags),
        "created_at": now,
    }
    _share_index[token] = user.id
    _enforce_share_store_capacity(SHARE_STORE_MAX)
    base = base_from_env or SHARE_BASE_URL or str(request.base_url).rstrip("/")
    share_url = f"{base}/api/share/{token}"
    return {"share_token": token, "share_url": share_url}


@app.get("/api/share/{token}")
async def share_redirect(token: str):
    """分享落地页（公开访问，无需登录）"""
    if not re.fullmatch(r"[0-9a-f]{32}", token or ""):
        raise HTTPException(status_code=404, detail="Not Found")
    user_id = _share_index.get(token)
    if user_id is None:
        raise HTTPException(status_code=410, detail="分享链接已过期或不存在")
    data = _share_store.get(user_id, {}).get(token)
    if not data:
        raise HTTPException(status_code=410, detail="分享链接已过期或不存在")
    if _time.time() - data["created_at"] > SHARE_TTL:
        _share_store.get(user_id, {}).pop(token, None)
        _share_index.pop(token, None)
        raise HTTPException(status_code=410, detail="分享链接已过期")

    title = html.escape(str(data.get("title", "") or ""))
    description = html.escape(str(data.get("description", "") or ""))
    tags_raw = data.get("tags", []) or []
    tags = [html.escape(str(t)) for t in tags_raw if str(t).strip()]

    tags_html = "".join(
        f'<span style="display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;background:#f4f4f5;color:#18181b;font-size:12px;line-height:1;">#{t}</span>'
        for t in tags
    )

    copy_text = f"{data.get('title', '')}\n\n{data.get('description', '')}".strip()
    if tags_raw:
        copy_text = f"{copy_text}\n\n" + " ".join(f"#{t}" for t in tags_raw if str(t).strip())

    copy_text_js = _json.dumps(copy_text, ensure_ascii=False).replace("</", "<\\/")
    creator_url = "https://creator.douyin.com/creator-micro/content/upload"

    landing_html = f"""<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title or "一键分发"}</title>
  </head>
  <body style="margin:0;background:#fafafa;color:#111827;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;">
    <div style="max-width:920px;margin:0 auto;padding:28px 16px 40px;">
      <div style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:20px 18px;box-shadow:0 1px 2px rgba(16,24,40,0.06);">
        <div style="display:flex;flex-direction:column;gap:14px;">
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="font-size:18px;font-weight:700;line-height:1.35;color:#111827;word-break:break-word;">{title or "未命名标题"}</div>
            <div style="font-size:14px;line-height:1.65;color:#374151;white-space:pre-wrap;word-break:break-word;">{description or "（无描述）"}</div>
          </div>

          <div style="display:flex;flex-wrap:wrap;gap:10px;">{tags_html or '<span style="font-size:12px;color:#6b7280;">（无标签）</span>'}</div>

          <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:6px;">
            <button id="copyBtn" type="button" style="appearance:none;border:1px solid #e5e7eb;background:#111827;color:#ffffff;padding:10px 14px;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;">
              复制文案
            </button>
            <a href="{creator_url}" style="text-decoration:none;border:1px solid #e5e7eb;background:#ffffff;color:#111827;padding:10px 14px;border-radius:12px;font-size:14px;font-weight:600;display:inline-flex;align-items:center;justify-content:center;">
              打开抖音创作者中心
            </a>
            <span id="copyHint" style="align-self:center;font-size:12px;color:#6b7280;"></span>
          </div>
        </div>
      </div>
    </div>

    <script>
      const copyText = {copy_text_js};
      const btn = document.getElementById('copyBtn');
      const hint = document.getElementById('copyHint');
      function setHint(text) {{
        if (hint) hint.textContent = text || '';
      }}
      async function doCopy() {{
        try {{
          if (navigator.clipboard && navigator.clipboard.writeText) {{
            await navigator.clipboard.writeText(copyText);
          }} else {{
            const ta = document.createElement('textarea');
            ta.value = copyText;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
          }}
          setHint('已复制');
          setTimeout(() => setHint(''), 1200);
        }} catch (e) {{
          setHint('复制失败，请手动复制');
        }}
      }}
      if (btn) btn.addEventListener('click', doCopy);
    </script>
  </body>
</html>"""

    headers = {
        "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:; base-uri 'none'; frame-ancestors 'none'",
        "X-Frame-Options": "DENY",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
        "Cache-Control": "no-store",
    }
    return HTMLResponse(content=landing_html, status_code=200, media_type="text/html; charset=utf-8", headers=headers)


# ════════════════════════════════════════════════════════════════════════
#  积分系统：认证与积分 API（邮箱 Magic Link）
# ════════════════════════════════════════════════════════════════════════


import re as _re

_EMAIL_RE = _re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


def _ensure_core_schema():
    """确保核心表（users / sessions / email_tokens / credit）存在。
    幂等 — 与 scripts/init_credit_db.py 的 migrate() 逻辑一致。
    """
    import sqlite3 as _sqlite3
    from lib.db import DB_PATH as _DB_PATH
    os.makedirs(os.path.dirname(_DB_PATH), exist_ok=True)
    conn = _sqlite3.connect(_DB_PATH)
    try:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email_hash TEXT UNIQUE NOT NULL,
                email_masked TEXT NOT NULL,
                nickname TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at INTEGER NOT NULL,
                last_seen_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                last_active_at INTEGER NOT NULL,
                user_agent TEXT,
                ip_first TEXT
            );
            CREATE TABLE IF NOT EXISTS credit_accounts (
                user_id INTEGER PRIMARY KEY REFERENCES users(id),
                balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
                total_recharged INTEGER NOT NULL DEFAULT 0,
                total_bonus INTEGER NOT NULL DEFAULT 0,
                total_consumed INTEGER NOT NULL DEFAULT 0,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS credit_ledger (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                type TEXT NOT NULL,
                delta INTEGER NOT NULL,
                balance_after INTEGER NOT NULL,
                ref_id TEXT,
                note TEXT,
                created_at INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS email_tokens (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email_hash TEXT NOT NULL,
                email_masked TEXT NOT NULL DEFAULT '',
                token_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                expires_at INTEGER NOT NULL,
                used INTEGER NOT NULL DEFAULT 0,
                used_at INTEGER
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ledger_user_time ON credit_ledger(user_id, created_at)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_email_tokens_email ON email_tokens(email_hash, created_at)")
        conn.commit()
    finally:
        conn.close()


class SendCodeRequest(BaseModel):
    email: str


@app.post("/api/auth/send-code")
async def auth_send_code(req: SendCodeRequest, request: Request):
    """发送登录验证码。返回统一 JSON 格式，永不抛 500。"""
    email = (req.email or "").strip().lower()
    # 格式校验不通过 → 静默返回（不泄露用户枚举信息）
    if not email or not _EMAIL_RE.match(email) or len(email) > 254:
        return {"success": True, "message": "code sent"}
    try:
        _ensure_core_schema()
    except Exception:
        return {"success": False, "message": "服务暂时不可用，请稍后再试"}
    email_h = hash_email(email)
    ok, _ = check_email(email_h)
    if not ok:
        return {"success": True, "message": "code sent"}
    ip = request.client.host if request.client else ""
    ok, _ = check_ip(ip)
    if not ok:
        return {"success": True, "message": "code sent"}
    code = generate_code()
    try:
        save_email_code(email, code)
    except Exception:
        return {"success": False, "message": "服务暂时不可用，请稍后再试"}
    try:
        send_login_code(email, code)
    except Exception:
        return {"success": False, "message": "服务暂时不可用，请稍后再试"}
    return {"success": True, "message": "code sent"}


class VerifyCodeRequest(BaseModel):
    email: str
    code: str


@app.post("/api/auth/verify-code")
async def auth_verify_code(req: VerifyCodeRequest, request: Request, response: Response):
    """验证 6 位验证码并登录。"""
    email = (req.email or "").strip().lower()
    code = (req.code or "").strip()
    if (
        not email
        or not code
        or not _EMAIL_RE.match(email)
        or len(email) > 254
        or not re.fullmatch(r"\d{6}", code)
    ):
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_INPUT", "message": "邮箱或验证码格式不正确"},
        )
    email_h = hash_email(email)
    info = consume_email_code(code, email_h)
    if not info:
        raise HTTPException(
            status_code=401,
            detail={"code": "INVALID_CODE", "message": "验证码错误或已过期"},
        )
    user_id = get_or_create_user_by_hash(info["email_hash"], info["email_masked"])
    ua = request.headers.get("user-agent", "")
    ip = request.client.host if request.client else ""
    sid = create_session(user_id, ua, ip)
    response.set_cookie(
        key=SESSION_COOKIE,
        value=sid,
        max_age=30 * 86400,
        httponly=True,
        secure=False,
        samesite="lax",
        path="/",
    )
    acct = get_account(user_id)
    return {
        "user": {"id": user_id, "email_masked": info["email_masked"]},
        "balance": acct.balance,
    }


@app.post("/api/auth/logout")
async def auth_logout(request: Request, response: Response):
    sid = request.cookies.get(SESSION_COOKIE)
    if sid:
        destroy_session(sid)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return {"ok": True}


@app.get("/api/auth/me")
async def auth_me(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    acct = get_account(user.id)
    return {
        "user": {
            "id": user.id,
            "email_masked": user.email_masked,
            "nickname": user.nickname,
        },
        "balance": acct.balance,
    }


@app.get("/api/credit/balance")
async def credit_balance(request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    acct = get_account(user.id)
    return {
        "balance": acct.balance,
        "total_recharged": acct.total_recharged,
        "total_bonus": acct.total_bonus,
        "total_consumed": acct.total_consumed,
    }


@app.get("/api/credit/ledger")
async def credit_ledger(request: Request, limit: int = 20):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    limit = max(1, min(100, limit))
    items = list_ledger(user.id, limit)
    return {"items": items, "count": len(items)}


# ════════════════════════════════════════════════════════════════════════
#  积分扣费 / 退款 API
# ════════════════════════════════════════════════════════════════════════

class ConsumeRequest(BaseModel):
    feature: str
    quantity: int = 1


@app.post("/api/credit/consume")
async def credit_consume(req: ConsumeRequest, request: Request):
    """原子扣费。返回 ref_id 用于退款对账。"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    # 限频(防前端循环点击刷爆)
    ok, msg = check_consume(user.id)
    if not ok:
        raise HTTPException(status_code=429, detail={"code": "RATE_LIMITED", "message": msg})
    # 计算费用
    try:
        cost = cost_for(req.feature, req.quantity)
    except CreditError:
        raise
    # 扣分
    ref_id = secrets.token_urlsafe(16)
    try:
        new_balance = consume(user.id, cost, ref_id=ref_id, note=f"feature={req.feature}")
    except CreditError:
        raise
    return {
        "ref_id": ref_id,
        "cost": cost,
        "feature": req.feature,
        "quantity": req.quantity,
        "new_balance": new_balance,
    }


class RefundRequest(BaseModel):
    ref_id: str


def _find_refundable_consume(user_id: int, ref_id: str):
    """查 ledger 找匹配 ref_id 的可退 consume 记录。

    返回 (amount, original_id) 或 None:
    - amount: 该 consume 的 delta 绝对值
    - original_id: ledger row id
    """
    from lib.db import connect as _connect
    now_ms = int(time.time() * 1000)
    cutoff = now_ms - REFUND_WINDOW_S * 1000
    conn = _connect()
    try:
        row = conn.execute(
            """SELECT id, delta FROM credit_ledger
               WHERE user_id = ? AND ref_id = ? AND type = 'consume'
                 AND created_at >= ?
               ORDER BY created_at DESC, id DESC LIMIT 1""",
            (user_id, ref_id, cutoff),
        ).fetchone()
        if not row:
            return None
        # 检查是否已退过(同 ref_id 已存在 type='refund')
        already = conn.execute(
            """SELECT 1 FROM credit_ledger
               WHERE user_id = ? AND ref_id = ? AND type = 'refund' LIMIT 1""",
            (user_id, ref_id),
        ).fetchone()
        if already:
            return None
        return abs(int(row["delta"])), int(row["id"])
    finally:
        conn.close()


@app.post("/api/credit/refund")
async def credit_refund(req: RefundRequest, request: Request):
    """根据 ref_id 退款。仅退 5 分钟内、未退过的 consume 记录。"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    if not req.ref_id or len(req.ref_id) < 8:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": "ref_id 无效"})
    found = _find_refundable_consume(user.id, req.ref_id)
    if not found:
        raise HTTPException(
            status_code=404,
            detail={"code": "REFUND_NOT_FOUND", "message": "未找到可退款的扣分记录(可能已退过或超过 5 分钟)"},
        )
    amount, _orig_id = found
    new_balance = refund(user.id, amount, ref_id=req.ref_id, note="业务失败退款")
    return {"refunded": amount, "new_balance": new_balance}


# ════════════════════════════════════════════════════════════════════════
#  账号绑定 API
# ════════════════════════════════════════════════════════════════════════

import sqlite3, uuid as _uuid
from lib.crypto_utils import encrypt_cookie, decrypt_cookie

_ACCOUNTS_DB = os.path.join(os.path.dirname(__file__), "data", "accounts.db")


def _init_accounts_db():
    """初始化账号数据库（首次调用时自动创建）"""
    os.makedirs(os.path.dirname(_ACCOUNTS_DB), exist_ok=True)
    conn = sqlite3.connect(_ACCOUNTS_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id TEXT PRIMARY KEY,
            platform TEXT NOT NULL,
            nickname TEXT DEFAULT '',
            cookie_encrypted TEXT NOT NULL,
            cookie_iv TEXT NOT NULL,
            login_status TEXT DEFAULT 'unknown',
            created_at REAL NOT NULL,
            updated_at REAL NOT NULL,
            user_id INTEGER
        )
    """)
    # 迁移：已有 accounts 表但没有 user_id 列时自动添加
    try:
        cols = [r[1] for r in conn.execute("PRAGMA table_info(accounts)").fetchall()]
        if "user_id" not in cols:
            conn.execute("ALTER TABLE accounts ADD COLUMN user_id INTEGER")
    except Exception:
        pass
    conn.commit()
    conn.close()


class AccountBindRequest(BaseModel):
    platform: str
    cookieJson: str


@app.post("/api/accounts/bind")
async def account_bind(req: AccountBindRequest, request: Request):
    """绑定平台账号 Cookie"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    _init_accounts_db()
    platform = req.platform.strip()
    if platform not in ("douyin", "shipinhao", "xiaohongshu"):
        raise HTTPException(status_code=400, detail="不支持的平台")
    if not req.cookieJson.strip():
        raise HTTPException(status_code=400, detail="Cookie 不能为空")

    encrypted, iv = encrypt_cookie(req.cookieJson.strip())
    now = _time.time()
    account_id = str(_uuid.uuid4())[:8]

    conn = sqlite3.connect(_ACCOUNTS_DB)
    # Replace existing binding for this platform + user
    conn.execute("DELETE FROM accounts WHERE platform = ? AND user_id = ?", (platform, user.id))
    conn.execute(
        "INSERT INTO accounts (id, platform, nickname, cookie_encrypted, cookie_iv, login_status, created_at, updated_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        (account_id, platform, "", encrypted, iv, "valid", now, now, user.id),
    )
    conn.commit()
    conn.close()
    return {"id": account_id, "platform": platform, "message": "绑定成功"}


@app.get("/api/accounts/list")
async def accounts_list(request: Request):
    """列出已绑定的账号"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    _init_accounts_db()
    conn = sqlite3.connect(_ACCOUNTS_DB)
    rows = conn.execute(
        "SELECT id, platform, nickname, login_status, created_at FROM accounts WHERE user_id = ? ORDER BY created_at DESC",
        (user.id,),
    ).fetchall()
    conn.close()
    return [
        {"id": r[0], "platform": r[1], "nickname": r[2], "login_status": r[3], "created_at": r[4]}
        for r in rows
    ]


@app.delete("/api/accounts/bind")
async def account_unbind(request: Request, id: str = ""):
    """解绑平台账号"""
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    _init_accounts_db()
    conn = sqlite3.connect(_ACCOUNTS_DB)
    conn.execute("DELETE FROM accounts WHERE id = ? AND user_id = ?", (id, user.id))
    conn.commit()
    conn.close()
    return {"message": "已解绑"}


# ════════════════════════════════════════════════════════════════════════
#  抖音扫码登录 API
# ════════════════════════════════════════════════════════════════════════

import asyncio as _asyncio

_DOUYIN_ENABLED = True
try:
    from lib.douyin_login import DouyinLoginManager
except ImportError:
    _DOUYIN_ENABLED = False

from lib.crypto_utils import encrypt_cookie

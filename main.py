import os
import re
import json
import base64
import tempfile
import logging
import asyncio
import time
import shutil

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from lib.runninghub_client import RunningHubClient, RunningHubError, build_motion_prompt, build_cover_prompt
from lib.video_postprocess import render_video_with_template, probe_audio_duration, _FFMPEG_EXE
from lib.video_audio_split import (
    SEGMENT_DURATION_SEC,
    SegmentLimitExceeded,
    split_audio_segments,
)
from lib.video_concat import concatenate_videos_ffmpeg
from lib.image_video_postprocess import image_video_render
from lib.mashup_video_postprocess import mashup_video_render

load_dotenv(override=True)
from lib.auth import (
    SESSION_COOKIE, consume_email_token, create_password_user, create_session, destroy_session,
    get_current_user, get_or_create_user_by_hash, get_user_identity, hash_email, mask_email,
    normalize_login_name, save_email_token, generate_token, validate_login_name,
    validate_password, verify_password_login,
)
from lib.credit import (
    CHAT_COST,
    REDEEM_CODE_AMOUNTS,
    VIDEO_CLONE_VOICE_COST,
    VIDEO_SEGMENT_COST,
    consume,
    ensure_credit_schema,
    generate_redeem_codes,
    get_account,
    list_ledger,
    list_redeem_code_batches,
    list_redeem_codes_by_batch,
    redeem_code,
    admin_list_users,
    admin_adjust_balance,
)
from lib.rate_limit import (
    CENTRAL_ACTIVATE_IP_LIMITS,
    check_ip,
    check_email,
    check_scoped,
    record as rate_record,
)
from lib.central_signing import get_public_key_pem, sign_activate_response
from lib.api_auth import (
    require_user,
    assert_task_owner,
    check_base64_size,
    consume_with_idempotency,
    consume_ai_llm,
    consume_voice_clone,
    consume_video_creation_segments,
    SCENE_COST_TABLE,
)
from lib.safe_http import download_to_path, SafeHttpError
from lib.email import send_login_link
from lib.video_extract import (
    ExtractionTask,
    create_extract_task,
    extract_audio_from_local_video,
    get_extract_task,
    run_extraction,
    transcribe_audio_with_timestamps,
)
from lib.subtitle_generator import timed_sentences_to_subtitle
from lib.subtitle_align import try_build_aligned_subtitle, split_script_cues
from lib.subtitle_asr import build_asr_ass_from_audio

logger = logging.getLogger(__name__)

# 说明：前端「爆改 / 智能体」已改为 Next 直连 DeepSeek；本服务可选（pnpm dev:all 或单独部署时保留）。
app = FastAPI()
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
PROJECT_PUBLIC_ROOT = os.path.join(PROJECT_ROOT, "public")

# —— 持久化数据目录（生产机挂 Volume 到此路径）——
# 开发期：默认 <project>/public 子目录
# 生产期：DATA_DIR=/data（Zeabur Volume 挂载点）
_DATA_DIR = (os.getenv("DATA_DIR") or "").strip() or os.path.join(PROJECT_PUBLIC_ROOT, "video-cache")
POST_PROCESS_ROOT = os.path.join(_DATA_DIR, "video-postprocess")
GENERATED_VIDEO_CACHE_ROOT = os.path.join(_DATA_DIR, "video-cache", "generated")
MANUAL_UPLOAD_ROOT = os.path.join(_DATA_DIR, "video-cache", "manual-uploads")
os.makedirs(POST_PROCESS_ROOT, exist_ok=True)
os.makedirs(GENERATED_VIDEO_CACHE_ROOT, exist_ok=True)
os.makedirs(MANUAL_UPLOAD_ROOT, exist_ok=True)

# —— 远端下载大小上限（防 DoS / OOM）——
MAX_REMOTE_VIDEO_BYTES = int(os.getenv("MAX_REMOTE_VIDEO_BYTES") or 300 * 1024 * 1024)
MAX_REMOTE_AUDIO_BYTES = int(os.getenv("MAX_REMOTE_AUDIO_BYTES") or 80 * 1024 * 1024)
MAX_REMOTE_IMAGE_BYTES = int(os.getenv("MAX_REMOTE_IMAGE_BYTES") or 30 * 1024 * 1024)
class _HardenedStaticFiles(StaticFiles):
    """在标准 StaticFiles 之上加 nosniff + no-index 等安全头。

    standard StaticFiles 不会设置任何安全头：
    - 浏览器会按推断 Content-Type 渲染（XSS via uploaded .html / .svg）
    - 目录浏览本就 html=False，但 Range / 路径穿越还是 ASGI 层防护更强
    """

    def file_response(self, *args, **kwargs):  # type: ignore[override]
        response = super().file_response(*args, **kwargs)
        try:
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["Referrer-Policy"] = "no-referrer"
            # 让 CDN / 浏览器都不长期缓存渲染结果（避免他用户 URL 拼凑命中缓存）
            response.headers.setdefault("Cache-Control", "private, max-age=300")
        except Exception:
            pass
        return response


app.mount(
    "/static/video-postprocess",
    _HardenedStaticFiles(directory=POST_PROCESS_ROOT, html=False),
    name="video-postprocess",
)
app.mount(
    "/static/video-generated",
    _HardenedStaticFiles(directory=GENERATED_VIDEO_CACHE_ROOT, html=False),
    name="video-generated",
)


def _require_admin_key(request: Request) -> None:
    """校验积分管理后台访问密钥。

    优先从 `X-Admin-Key` 头读取（Next.js 路由层在转发时会把 cookie 转成头），
    也接受直接的 `credit_admin_key` cookie，便于 curl/Postman 调试。
    """
    expected = (os.getenv("CREDIT_ADMIN_ACCESS_KEY") or "").strip()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail={"code": "ADMIN_KEY_NOT_CONFIGURED", "message": "未配置 CREDIT_ADMIN_ACCESS_KEY"},
        )
    provided = (request.headers.get("x-admin-key") or "").strip()
    if not provided:
        raw_cookie = request.headers.get("cookie") or ""
        for chunk in raw_cookie.split(";"):
            name, _, value = chunk.strip().partition("=")
            if name == "credit_admin_key":
                provided = value.strip()
                break
    if not provided or provided != expected:
        raise HTTPException(
            status_code=403,
            detail={"code": "FORBIDDEN", "message": "未授权的后台访问"},
        )

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


@app.middleware("http")
async def bind_request_context_middleware(request: Request, call_next):
    from lib.request_context import reset_current_request, set_current_request

    token = set_current_request(request)
    try:
        return await call_next(request)
    finally:
        reset_current_request(token)


@app.get("/health")
async def health_check():
    """容器/PaaS 探活：检查 ffmpeg 是否可用。"""
    import shutil
    import subprocess

    from pathlib import Path

    _local_ffmpeg = Path(__file__).resolve().parent / "tools" / "ffmpeg" / "bin" / "ffmpeg.exe"
    _local_ffprobe = Path(__file__).resolve().parent / "tools" / "ffmpeg" / "bin" / "ffprobe.exe"
    ffmpeg_bin = (
        os.environ.get("FFMPEG_EXE")
        or (str(_local_ffmpeg) if _local_ffmpeg.exists() else None)
        or shutil.which("ffmpeg")
        or "ffmpeg"
    )
    ffprobe_bin = (
        os.environ.get("FFPROBE_EXE")
        or (str(_local_ffprobe) if _local_ffprobe.exists() else None)
        or shutil.which("ffprobe")
        or "ffprobe"
    )
    checks: dict[str, str] = {"api": "ok"}
    try:
        subprocess.run(
            [ffmpeg_bin, "-version"],
            capture_output=True,
            timeout=5,
            check=True,
        )
        checks["ffmpeg"] = "ok"
    except Exception as e:
        checks["ffmpeg"] = f"fail:{e}"
    try:
        subprocess.run(
            [ffprobe_bin, "-version"],
            capture_output=True,
            timeout=5,
            check=True,
        )
        checks["ffprobe"] = "ok"
    except Exception as e:
        checks["ffprobe"] = f"fail:{e}"
    data_dir = os.getenv("DATA_DIR") or POST_PROCESS_ROOT
    checks["data_dir_writable"] = "ok" if os.access(data_dir, os.W_OK) else "fail"
    ok = checks.get("ffmpeg") == "ok" and checks["data_dir_writable"] == "ok"
    return JSONResponse(
        status_code=200 if ok else 503,
        content={"status": "ok" if ok else "degraded", "checks": checks},
    )


TIANAPI_KEY = (os.getenv("TIANAPI_KEY") or "").strip()
DEEPSEEK_API_KEY = (os.getenv("DEEPSEEK_API_KEY") or "").strip()
RUNNINGHUB_API_KEY = (os.getenv("RUNNINGHUB_API_KEY") or "").strip()
ALIYUN_ACCESS_KEY_ID = (os.getenv("ALIYUN_ACCESS_KEY_ID") or "").strip()
ALIYUN_ACCESS_KEY_SECRET = (os.getenv("ALIYUN_ACCESS_KEY_SECRET") or "").strip()
ALIYUN_ASR_APP_KEY = (os.getenv("ALIYUN_ASR_APP_KEY") or "").strip()

logging.basicConfig(level=logging.INFO)
ensure_credit_schema()
from lib.api_auth import ensure_credit_idempotency_index  # noqa: E402
ensure_credit_idempotency_index()


def ensure_app_schema() -> None:
    """幂等迁移 SQLite schema（users/sessions/credit/geo_matrix_projects 等）。"""
    from lib.db import connect
    from scripts.init_credit_db import migrate

    conn = connect()
    try:
        migrate(conn)
    finally:
        conn.close()


ensure_app_schema()

# ── Pydantic models for video endpoints ──


class VideoGenerateRequest(BaseModel):
    image_base64: str
    audio_base64: str
    script: str
    gender: str = "female"  # "male" | "female" — 用于生成节点 254 的动作描述提示词
    video_prompt: str = ""
    video_prompt_mode: str = "natural"
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
    cover_status: str = "idle"
    cover_error: str = ""
    cover_task_id: str = ""
    post_video_url: str = ""
    post_stage: str = ""
    post_progress: int = 0
    post_error: str = ""
    error: str = ""
    estimated_minutes: int = 30
    stage: str = ""
    stage_label: str = ""
    stage_history: list[str] = []
    stage_updated_at: float = 0
    segment_count: int = 0
    segments_completed: int = 0


# —— 视频生成管线 stage 常量 ——
STAGE_UPLOADING_IMAGE = "uploading_image"
STAGE_UPLOADING_AUDIO = "uploading_audio"
STAGE_SUBMITTING_CLONE = "submitting_audio_clone"
STAGE_WAITING_CLONE = "waiting_audio_clone"
STAGE_SUBMITTING_VIDEO = "submitting_video"
STAGE_QUEUED = "queued"
STAGE_POLLING_VIDEO = "polling_video"
STAGE_CONCATENATING = "concatenating"
STAGE_POST_PROCESSING = "post_processing"
STAGE_COVER_GENERATING = "cover_generating"
STAGE_COMPLETED = "completed"
STAGE_FAILED = "failed"
STAGE_CANCELLED = "cancelled"

STAGE_LABELS = {
    STAGE_UPLOADING_IMAGE: "上传数字人形象图",
    STAGE_UPLOADING_AUDIO: "上传音色样本",
    STAGE_SUBMITTING_CLONE: "提交音频克隆任务",
    STAGE_WAITING_CLONE: "等待音频克隆完成",
    STAGE_SUBMITTING_VIDEO: "提交视频生成任务",
    STAGE_QUEUED: "任务已入队",
    STAGE_POLLING_VIDEO: "等待视频生成完成",
    STAGE_CONCATENATING: "拼接视频片段",
    STAGE_POST_PROCESSING: "后期剪辑处理中",
    STAGE_COVER_GENERATING: "生成封面图中",
    STAGE_COMPLETED: "全部完成",
    STAGE_FAILED: "失败",
    STAGE_CANCELLED: "已停止",
}

# —— 图文视频 stage 常量 ——
STAGE_IV_DECODING_IMAGES = "iv_decoding_images"
STAGE_IV_DECODING_AUDIO = "iv_decoding_audio"
STAGE_IV_UPLOADING_AUDIO = "iv_uploading_audio"
STAGE_IV_SUBMITTING_CLONE = "iv_submitting_clone"
STAGE_IV_WAITING_CLONE = "iv_waiting_clone"
STAGE_IV_DOWNLOADING_CLONE = "iv_downloading_clone"
STAGE_IV_ASR_SUBTITLE = "iv_asr_subtitle"
STAGE_IV_RENDERING = "iv_rendering"
STAGE_IV_COMPLETED = "iv_completed"
STAGE_IV_FAILED = "iv_failed"
STAGE_IV_CANCELLED = "iv_cancelled"

IV_STAGE_LABELS = {
    STAGE_IV_DECODING_IMAGES: "解码图片素材",
    STAGE_IV_DECODING_AUDIO: "解码音色样本",
    STAGE_IV_UPLOADING_AUDIO: "上传音色到云端",
    STAGE_IV_SUBMITTING_CLONE: "提交音频克隆",
    STAGE_IV_WAITING_CLONE: "等待配音生成",
    STAGE_IV_DOWNLOADING_CLONE: "下载克隆配音",
    STAGE_IV_ASR_SUBTITLE: "ASR 字幕识别中",
    STAGE_IV_RENDERING: "ffmpeg 视频合成中",
    STAGE_IV_COMPLETED: "生成完成",
    STAGE_IV_FAILED: "生成失败",
    STAGE_IV_CANCELLED: "已停止",
}

# —— 视频混剪 stage 常量 ——
STAGE_MV_DECODING_VIDEOS = "mv_decoding_videos"
STAGE_MV_DECODING_AUDIO = "mv_decoding_audio"
STAGE_MV_UPLOADING_AUDIO = "mv_uploading_audio"
STAGE_MV_SUBMITTING_CLONE = "mv_submitting_clone"
STAGE_MV_WAITING_CLONE = "mv_waiting_clone"
STAGE_MV_DOWNLOADING_CLONE = "mv_downloading_clone"
STAGE_MV_ASR_SUBTITLE = "mv_asr_subtitle"
STAGE_MV_RENDERING = "mv_rendering"
STAGE_MV_COMPLETED = "mv_completed"
STAGE_MV_FAILED = "mv_failed"
STAGE_MV_CANCELLED = "mv_cancelled"

MV_STAGE_LABELS = {
    STAGE_MV_DECODING_VIDEOS: "解码视频素材",
    STAGE_MV_DECODING_AUDIO: "解码音色样本",
    STAGE_MV_UPLOADING_AUDIO: "上传音色到云端",
    STAGE_MV_SUBMITTING_CLONE: "提交音频克隆",
    STAGE_MV_WAITING_CLONE: "等待配音生成",
    STAGE_MV_DOWNLOADING_CLONE: "下载克隆配音",
    STAGE_MV_ASR_SUBTITLE: "ASR 字幕识别中",
    STAGE_MV_RENDERING: "ffmpeg 混剪合成中",
    STAGE_MV_COMPLETED: "混剪完成",
    STAGE_MV_FAILED: "混剪失败",
    STAGE_MV_CANCELLED: "已停止",
}

# —— 宣传视频分镜 stage 常量 ——
STAGE_PV_DECODE = "pv_decode"
STAGE_PV_UPLOAD_PRODUCT = "pv_upload_product"
STAGE_PV_RH_SUBMIT = "pv_rh_submit"
STAGE_PV_RH_POLL = "pv_rh_poll"
STAGE_PV_DOWNLOAD = "pv_download"
STAGE_PV_RH_CROP_SUBMIT = "pv_rh_crop_submit"
STAGE_PV_RH_CROP_POLL = "pv_rh_crop_poll"
STAGE_PV_CROP_DOWNLOAD = "pv_crop_download"
STAGE_PV_COMPLETED = "pv_completed"
STAGE_PV_FAILED = "pv_failed"

PV_STAGE_LABELS = {
    STAGE_PV_DECODE: "解码本地素材",
    STAGE_PV_UPLOAD_PRODUCT: "上传产品图到 RunningHub",
    STAGE_PV_RH_SUBMIT: "提交分镜工作流",
    STAGE_PV_RH_POLL: "等待 RunningHub 生成",
    STAGE_PV_DOWNLOAD: "下载分镜图",
    STAGE_PV_RH_CROP_SUBMIT: "提交多宫格裁切",
    STAGE_PV_RH_CROP_POLL: "等待裁切完成",
    STAGE_PV_CROP_DOWNLOAD: "下载分镜帧",
    STAGE_PV_COMPLETED: "分镜完成",
    STAGE_PV_FAILED: "分镜失败",
}


def _set_stage(task_id: str, stage: str, **extras) -> None:
    """原子更新任务 sub-step。"""
    if not task_id:
        return
    stored = _task_store.get(task_id) or {}
    history = list(stored.get("stage_history") or [])
    if not history or history[-1] != stage:
        history.append(stage)
    _task_store[task_id] = {
        **stored,
        "stage": stage,
        "stage_label": STAGE_LABELS.get(stage, stage),
        "stage_history": history,
        "stage_updated_at": time.time(),
        **extras,
    }


def _set_generic_stage(
    store: dict[str, dict],
    labels: dict[str, str],
    task_id: str,
    stage: str,
    **extras,
) -> None:
    if not task_id:
        return
    stored = store.get(task_id) or {}
    history = list(stored.get("stage_history") or [])
    if not history or history[-1] != stage:
        history.append(stage)
    store[task_id] = {
        **stored,
        "stage": stage,
        "stage_label": labels.get(stage, stage),
        "stage_history": history,
        "stage_updated_at": time.time(),
        **extras,
    }


def _set_iv_stage(task_id: str, stage: str, **extras) -> None:
    _set_generic_stage(_image_task_store, IV_STAGE_LABELS, task_id, stage, **extras)


def _set_mv_stage(task_id: str, stage: str, **extras) -> None:
    _set_generic_stage(_mashup_task_store, MV_STAGE_LABELS, task_id, stage, **extras)


class CoverGenerateRequest(BaseModel):
    task_id: str
    image_url: str = ""
    gender: str = "female"


class CancelVideoTaskRequest(BaseModel):
    task_id: str


class ManualEditRequest(BaseModel):
    upload_id: str
    script: str
    business_card_text: str = ""
    bgm_dir: str = ""
    bgm_volume: float = 0.32
    slide_images_base64: list[str] = []


class EditVideoRequest(BaseModel):
    task_id: str = ""
    video_url: str = ""
    upload_id: str = ""
    video_base64: str = ""
    preset: str = "default"
    subtitle_text: str = ""
    subtitle_file_path: str = ""  # 预生成字幕文件路径（ASR 自动字幕），优先级高于 subtitle_text
    business_card_text: str = ""
    bgm_dir: str = ""
    bgm_volume: float = 0.32
    source: str = "generated"
    slide_images_base64: list[str] = []  # 图片素材 base64 列表，用于视频下方轮播
    enable_bgm: bool = True
    enable_subtitles: bool = True


class EditTaskStatusResponse(BaseModel):
    edit_job_id: str
    task_id: str = ""
    status: str
    progress: int = 0
    preset: str = "default"
    source: str = "generated"
    output_video_url: str = ""
    error: str = ""


class ManualUploadResponse(BaseModel):
    upload_id: str
    file_url: str = ""
    original_name: str = ""
    size: int = 0


class ImageToVideoRequest(BaseModel):
    images_base64: list[str]     # 图片 base64 列表（最少 7 张）
    audio_base64: str            # 用户音色样本 base64（10~30 秒录音）
    script: str                  # 文案全文
    bgm_volume: float = 0.32     # BGM 音量
    enable_bgm: bool = True
    enable_subtitles: bool = True


class ImageToVideoResponse(BaseModel):
    task_id: str
    status: str
    video_url: str = ""
    audio_url: str = ""
    error: str = ""


class MashupVideoRequest(BaseModel):
    videos_base64: list[str]     # 视频 base64 列表（最少 5 段）
    audio_base64: str            # 用户音色样本 base64（10~30 秒录音）
    script: str                  # 文案全文
    bgm_volume: float = 0.32     # BGM 音量
    enable_bgm: bool = True
    enable_subtitles: bool = True


class MashupVideoResponse(BaseModel):
    task_id: str
    status: str
    video_url: str = ""
    audio_url: str = ""
    error: str = ""


class ClipTaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: int = 0
    video_url: str = ""
    audio_url: str = ""
    error: str = ""
    stage: str = ""
    stage_label: str = ""
    stage_history: list[str] = []
    stage_updated_at: float = 0


class CancelClipTaskRequest(BaseModel):
    task_id: str


class CopyExtractRequest(BaseModel):
    url: str
    platform: str | None = None  # douyin / bilibili / kuaishou / xiaohongshu


class CopyExtractResponse(BaseModel):
    task_id: str
    status: str  # "queued"


class CopyExtractStatusResponse(BaseModel):
    task_id: str
    status: str        # "queued" | "downloading" | "transcribing" | "completed" | "failed"
    step: str          # 中文步骤：准备中 / 下载中 / 识别中 / 完成 / 失败
    progress: int      # 0-100
    text: str = ""
    title: str = ""
    duration: float = 0.0
    source: str = ""   # "subtitles" | "asr"
    error: str = ""


class AutoSubtitleRequest(BaseModel):
    """自动字幕生成请求"""
    source: str = "local"                    # "local" (本地视频) | "url" (在线链接)
    video_path: str = ""                     # 本地视频文件路径（source=local 时）
    video_url: str = ""                      # 在线视频链接（source=url 时）
    subtitle_format: str = "ass"             # "ass" | "srt"
    merge_gap_ms: int = 600                  # 词间句边界阈值
    script: str = ""                         # 用户原文案；有则走校对对齐


class AutoSubtitleResponse(BaseModel):
    """自动字幕生成响应"""
    task_id: str
    status: str                              # "queued" | "processing" | "completed" | "failed"
    subtitle_path: str = ""                  # 生成的字幕文件路径
    subtitle_text: str = ""                  # 字幕纯文本（供预览）
    sentence_count: int = 0                  # 句子数
    error: str = ""


def _require_deepseek_key() -> None:
    if not DEEPSEEK_API_KEY:
        raise HTTPException(
            status_code=503,
            detail=(
                "未配置 AI 服务密钥：请在项目根目录 .env 中写入 AI 服务密钥，"
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


class CreditConsumeRequest(BaseModel):
    scene: str
    cost: int | None = None
    ref_id: str = ""
    note: str = ""


class CreditBillingRequest(BaseModel):
    billing_key: str
    params: dict = Field(default_factory=dict)
    ref_id: str = ""


class RedeemCodeRequest(BaseModel):
    code: str


class RedeemGenerateRequest(BaseModel):
    amount: int
    count: int = 1
    batch_id: str = ""
    note: str = ""

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
            raise HTTPException(status_code=502, detail="AI 模型无响应") from e
        error_detail = (e.response.text or "")[:8000]
        print(f"❌ DeepSeek 官方报错: {error_detail}")
        code = e.response.status_code
        if not (100 <= code <= 599):
            code = 502
        raise HTTPException(
            status_code=code,
            detail=f"AI 模型报错: {error_detail}",
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
            raise HTTPException(status_code=502, detail="AI 模型无响应") from e
        error_detail = (e.response.text or "")[:8000]
        print(f"❌ DeepSeek 官方报错: {error_detail}")
        code = e.response.status_code
        if not (100 <= code <= 599):
            code = 502
        raise HTTPException(
            status_code=code,
            detail=f"AI 模型报错: {error_detail}",
        ) from e
    except Exception as e:
        print(f"❌ 本地系统未知报错: {str(e)}")
        raise HTTPException(status_code=500, detail=f"系统错误: {str(e)}") from e

# ════════════════════════════════════════════════════════════════════════
#  视频创作 API（RunningHub 集成）
# ════════════════════════════════════════════════════════════════════════

# 内存存储任务状态（生产环境应替换为数据库）
_task_store: dict[str, dict] = {}
_poll_tasks: dict[str, object] = {}
_dh_pipeline_tasks: dict[str, asyncio.Task] = {}
_edit_task_store: dict[str, dict] = {}
_edit_tasks: dict[str, object] = {}
_manual_upload_store: dict[str, dict] = {}
_image_task_store: dict[str, dict] = {}
_mashup_task_store: dict[str, dict] = {}
_image_pipeline_tasks: dict[str, asyncio.Task] = {}
_mashup_pipeline_tasks: dict[str, asyncio.Task] = {}
_VIDEO_PROMPT_MODES = {"natural", "mode2", "mode3"}


def _get_rh_client() -> "RunningHubClient":
    """获取 RunningHub 客户端（验证 API Key）"""
    if not RUNNINGHUB_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="未配置 AI 生成服务密钥。请在项目根目录 .env 中设置后重启服务。",
        )
    return RunningHubClient(RUNNINGHUB_API_KEY)


def _normalize_video_prompt_mode(mode: str) -> str:
    cleaned = (mode or "").strip()
    return cleaned if cleaned in _VIDEO_PROMPT_MODES else "natural"


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


def _resolve_bgm_dir(req_bgm_dir: str) -> str | None:
    """解析 BGM 目录：优先请求参数 → 环境变量 → None。

    与 preset 字段脱钩，单模板时代不再基于 preset 选 BGM 目录。
    相对路径自动基于 PROJECT_ROOT 解析为绝对路径，避免工作目录变化导致找不到。
    """
    cleaned = (req_bgm_dir or "").strip()
    if cleaned:
        bgm_dir = cleaned
    else:
        bgm_dir = (os.getenv("VIDEO_BGM_DIR") or "").strip()
    if not bgm_dir:
        return None
    # 相对路径 → 绝对路径，保证在任何工作目录下都能找到
    if not os.path.isabs(bgm_dir):
        bgm_dir = os.path.join(PROJECT_ROOT, bgm_dir)
    if not os.path.isdir(bgm_dir):
        logging.warning(f"BGM 目录不存在: {bgm_dir}")
        return None
    return bgm_dir


_MAX_REQUEST_BODY_MB = 500

def _check_request_size(request: Request) -> None:
    """校验请求体大小，防止 base64 大文件撑爆内存。"""
    cl = request.headers.get("content-length")
    if cl:
        try:
            size_mb = int(cl) / (1024 * 1024)
            if size_mb > _MAX_REQUEST_BODY_MB:
                raise HTTPException(
                    status_code=413,
                    detail=f"请求体过大（{size_mb:.0f}MB），上限 {_MAX_REQUEST_BODY_MB}MB",
                )
        except ValueError:
            pass  # 无法解析则跳过


def _new_manual_upload_id() -> str:
    return f"upload_{int(time.time() * 1000)}_{os.urandom(3).hex()}"


def _resolve_manual_upload_path(upload_id: str, expected_user_id: int | None = None) -> str:
    """解析手动上传文件路径，校验归属。

    expected_user_id 不为 None 时强制校验；为 None 时仅校验存在性
    （遗留调用兼容；新调用方应传入 user_id）。
    """
    stored = _manual_upload_store.get(upload_id)
    if not stored:
        raise HTTPException(status_code=404, detail="上传文件不存在或已失效")
    if expected_user_id is not None:
        owner = stored.get("user_id")
        if owner is None or int(owner) != int(expected_user_id):
            logger.warning(
                "upload ownership violation upload_id=%s user=%s owner=%s",
                upload_id, expected_user_id, owner,
            )
            raise HTTPException(
                status_code=403,
                detail={"code": "UPLOAD_NOT_OWNED", "message": "无权访问该上传文件"},
            )
    path = stored.get("path", "")
    if not path or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="上传文件不存在或已失效")
    return path


def _safe_cache_name(task_id: str, fallback: str) -> str:
    raw = (task_id or fallback or "video").strip()
    safe = re.sub(r"[^0-9A-Za-z._-]+", "_", raw).strip("._")
    return safe or fallback or "video"


def _is_http_url(url: str) -> bool:
    return url.startswith("http://") or url.startswith("https://")


# —— 受信任的本地媒体根目录（用于 video/字幕 路径白名单）——
_TRUSTED_MEDIA_ROOTS: tuple[str, ...] = tuple(
    os.path.realpath(p) for p in (POST_PROCESS_ROOT, MANUAL_UPLOAD_ROOT, GENERATED_VIDEO_CACHE_ROOT)
)


def _ensure_path_in_trusted_root(raw_path: str, *, field: str) -> str:
    """对客户端传入的本地路径做穿越检查 + 白名单匹配。

    任何来自用户的 `*_path` 字段（视频路径、字幕路径、图片路径）都必须
    经过本函数后才能交给 ffmpeg / 文件系统使用，否则攻击者可读写任意
    磁盘位置（例如 `C:/Windows/System32/drivers/etc/hosts` 这种）。
    """
    cleaned = (raw_path or "").strip()
    if not cleaned:
        raise HTTPException(
            status_code=400,
            detail={"code": "PATH_EMPTY", "message": f"{field} 不能为空"},
        )
    # 拒绝 NUL / 控制字符（防御 shell 注入 / ASS filter 注入）
    if any(ord(ch) < 32 for ch in cleaned) or "\x00" in cleaned:
        raise HTTPException(
            status_code=400,
            detail={"code": "PATH_INVALID_CHARS", "message": f"{field} 含非法字符"},
        )
    real = os.path.realpath(cleaned)
    for root in _TRUSTED_MEDIA_ROOTS:
        if real == root or real.startswith(root + os.sep):
            return real
    raise HTTPException(
        status_code=400,
        detail={
            "code": "PATH_OUTSIDE_ALLOWED",
            "message": f"{field} 必须位于受信任的媒体目录内",
        },
    )


_FFMPEG_ERROR_PATH_RE = re.compile(r"[A-Za-z]:[\\/][^\s'\":]+|/[^\s'\":\(\)]+/")


def _sanitize_ffmpeg_error(raw: str, *, max_len: int = 400) -> str:
    """把 ffmpeg stderr 末段脱敏成可对外展示的短消息。

    - 替换 Windows / POSIX 绝对路径为 `<path>`
    - 保留最后 max_len 字符的关键错误信息（如 codec / 时长不匹配）
    - 多空白合并
    """
    if not raw:
        return ""
    s = _FFMPEG_ERROR_PATH_RE.sub("<path>", raw)
    s = re.sub(r"\s+", " ", s).strip()
    if len(s) > max_len:
        s = "..." + s[-max_len:]
    return s


def _to_subtitle_public_url(real_path: str, *, base_url: str = "") -> str:
    """把字幕绝对路径转成对外 URL（仅在 POST_PROCESS_ROOT 子树内）。"""
    if not real_path:
        return ""
    real = os.path.realpath(real_path)
    root = os.path.realpath(POST_PROCESS_ROOT)
    if real == root or real.startswith(root + os.sep):
        rel = os.path.relpath(real, root).replace(os.sep, "/")
        base = (base_url or "").rstrip("/")
        return f"{base}/static/video-postprocess/{rel}"
    # 不在 POST_PROCESS_ROOT 内的字幕不对外暴露路径，避免泄露内部目录结构
    return ""


async def _download_video_to_project_cache(video_url: str, task_id: str, timeout: float = 180.0) -> str:
    os.makedirs(GENERATED_VIDEO_CACHE_ROOT, exist_ok=True)
    safe_name = _safe_cache_name(task_id, f"video_{int(time.time())}")
    input_path = os.path.join(GENERATED_VIDEO_CACHE_ROOT, f"{safe_name}_input.mp4")
    await download_to_path(
        video_url,
        input_path,
        max_bytes=MAX_REMOTE_VIDEO_BYTES,
        timeout=timeout,
    )
    return input_path


def _resolve_project_public_path(video_url: str) -> str:
    public_url = video_url.split("?", 1)[0].split("#", 1)[0]
    if not public_url.startswith("/"):
        raise FileNotFoundError(f"无法识别本地视频地址：{video_url}")
    rel = public_url.lstrip("/").replace("/", os.sep)
    candidate = os.path.abspath(os.path.join(PROJECT_PUBLIC_ROOT, rel))
    public_root = os.path.abspath(PROJECT_PUBLIC_ROOT)
    if not (candidate == public_root or candidate.startswith(public_root + os.sep)):
        raise FileNotFoundError("视频地址超出项目 public 目录")
    if not os.path.exists(candidate):
        raise FileNotFoundError(f"本地视频文件不存在：{candidate}")
    return candidate


async def _prepare_generated_video_input(video_url: str, task_id: str, output_dir: str) -> tuple[str, bool]:
    cleaned = (video_url or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="缺少视频地址，无法剪辑")
    if _is_http_url(cleaned):
        return await _download_video_to_project_cache(cleaned, task_id), True
    if cleaned.startswith("/static/video-generated/"):
        rel = cleaned[len("/static/video-generated/"):].replace("/", os.sep)
        candidate = os.path.abspath(os.path.join(GENERATED_VIDEO_CACHE_ROOT, rel))
        cache_root = os.path.abspath(GENERATED_VIDEO_CACHE_ROOT)
        if candidate.startswith(cache_root + os.sep) and os.path.exists(candidate):
            return candidate, False
    if cleaned.startswith("/static/video-postprocess/"):
        rel = cleaned[len("/static/video-postprocess/"):].replace("/", os.sep)
        candidate = os.path.abspath(os.path.join(POST_PROCESS_ROOT, rel))
        post_root = os.path.abspath(POST_PROCESS_ROOT)
        if candidate.startswith(post_root + os.sep) and os.path.exists(candidate):
            return candidate, False
    if cleaned.startswith("/"):
        return _resolve_project_public_path(cleaned), False
    raise HTTPException(
        status_code=400,
        detail={"code": "BAD_VIDEO_URL", "message": "video_url 必须是 http(s) 或 /static/ / 项目 public 路径"},
    )


def _cleanup_generated_video_cache(input_path: str, remove_cache: bool) -> None:
    if not remove_cache:
        return
    try:
        cache_root = os.path.abspath(GENERATED_VIDEO_CACHE_ROOT)
        target = os.path.abspath(input_path)
        if target.startswith(cache_root + os.sep) and os.path.exists(target):
            os.remove(target)
    except Exception:
        pass


def _pick_first_result_url(result: dict) -> str:
    for item in result.get("results", []):
        url = (item or {}).get("url", "")
        if url:
            return url
    return ""


def _generated_video_public_url(abs_path: str) -> str:
    """将 generated 缓存目录内的 concat 产物转为对外静态 URL。"""
    real = os.path.realpath(abs_path)
    cache_root = os.path.realpath(GENERATED_VIDEO_CACHE_ROOT)
    if real == cache_root or real.startswith(cache_root + os.sep):
        rel = os.path.relpath(real, cache_root).replace(os.sep, "/")
        return f"/static/video-generated/{rel}"
    raise ValueError(f"视频产物不在 generated 缓存目录内：{abs_path}")


async def _run_cover_generation(task_id: str, *, image_url: str, gender: str) -> str:
    stored = _task_store.get(task_id)
    if stored is None:
        raise HTTPException(status_code=404, detail="视频任务不存在")

    image_url = (image_url or "").strip()
    if not image_url:
        raise HTTPException(status_code=400, detail="缺少 image_url，无法生成封面")

    rh = _get_rh_client()
    cover_script = (stored.get("script") or "").strip()
    cover_prompt = build_cover_prompt(gender, cover_script)
    _set_stage(task_id, STAGE_COVER_GENERATING, cover_status="running", cover_error="")

    cover_task_id = await rh.submit_cover_image(
        prompt=cover_prompt,
        image_urls=[image_url],
        aspect_ratio="3:4",
        resolution="1k",
    )
    _set_stage(task_id, STAGE_COVER_GENERATING, cover_status="running", cover_error="", cover_task_id=cover_task_id)

    print(f"[cover/{task_id}] Polling cover task {cover_task_id} (max 10 min)...")
    cover_result = await rh.wait_for_completion(cover_task_id, max_wait=600)
    cover_url = _pick_first_result_url(cover_result)
    if not cover_url:
        raise RunningHubError("封面图生成完成但未返回结果 URL")

    print(f"[cover/{task_id}] Cover done: {cover_url[:80]}")
    _set_stage(
        task_id, STAGE_COMPLETED,
        cover_url=cover_url, cover_status="success", cover_error="", cover_task_id=cover_task_id,
    )
    return cover_url


# ── POST /api/video/generate ──────────────────────────────────


@app.post("/api/video/generate", response_model=TaskStatusResponse)
async def video_generate(req: VideoGenerateRequest, request: Request):
    """
    提交视频创作任务

    流程: 解码 Base64 → 上传文件到 RunningHub → 音频克隆 → 按 20s 切段
    → 并发提交 n 段视频生成 → 后台轮询拼接 → 返回半成品（用户手动进入自动剪辑）
    """
    user = require_user(request)
    logger.info("video_generate user_id=%s", user.id)
    if not req.image_base64 or not req.audio_base64 or not req.script.strip():
        raise HTTPException(status_code=400, detail="缺少必填参数: image_base64, audio_base64, script")
    if len(req.script) > 5000:
        raise HTTPException(status_code=400, detail={"code": "SCRIPT_TOO_LONG", "message": "脚本超过 5000 字"})
    check_base64_size(req.image_base64, max_mb=10, name="image_base64")
    check_base64_size(req.audio_base64, max_mb=50, name="audio_base64")

    local_task_id = f"vg_{int(time.time() * 1000)}_{os.urandom(3).hex()}"

    rh = _get_rh_client()
    image_path = audio_path = None
    clone_work_dir = ""

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

        # 5. 下载克隆音频并按 20s 切段
        clone_work_dir = tempfile.mkdtemp(prefix="dh_clone_")
        clone_audio_path = os.path.join(clone_work_dir, "clone.mp3")
        await download_to_path(
            audio_clone_url,
            clone_audio_path,
            max_bytes=MAX_REMOTE_AUDIO_BYTES,
            timeout=180.0,
        )
        _validate_cloned_audio(clone_audio_path)

        segment_dir = os.path.join(clone_work_dir, "segments")
        try:
            audio_segments = await asyncio.to_thread(
                split_audio_segments,
                clone_audio_path,
                segment_dir,
                SEGMENT_DURATION_SEC,
                ffmpeg_exe=_FFMPEG_EXE,
            )
        except SegmentLimitExceeded as e:
            raise HTTPException(
                status_code=400,
                detail={"code": "SEGMENT_LIMIT_EXCEEDED", "message": str(e)},
            ) from e

        segment_count = len(audio_segments)
        print(f"[video/generate] Split clone audio into {segment_count} segment(s)")

        credit_clone_cost = VIDEO_CLONE_VOICE_COST
        credit_video_cost = VIDEO_SEGMENT_COST * segment_count
        consume_voice_clone(
            user_id=user.id,
            ref_id=f"{local_task_id}:clone",
            note="口播音色克隆",
        )
        consume_video_creation_segments(
            user_id=user.id,
            ref_id=f"{local_task_id}:video",
            segment_count=segment_count,
            note=f"口播视频生成 {segment_count} 段",
        )

        # 6. 逐段上传音频并并发提交视频生成
        prompt_mode = _normalize_video_prompt_mode(req.video_prompt_mode)
        raw_video_prompt = req.video_prompt or ""
        motion_prompt = build_motion_prompt(req.gender, raw_video_prompt)
        final_prompt_mode = prompt_mode if raw_video_prompt.strip() else "natural"

        segment_audio_urls: list[str] = []
        for _idx, seg_path in audio_segments:
            segment_audio_urls.append(await rh.upload_file(seg_path))

        print(
            f"[video/generate] Submitting {segment_count} video segment(s) "
            f"(gender={req.gender})"
        )

        async def _submit_segment(seg_audio_url: str) -> str:
            return await rh.submit_video(image_url, seg_audio_url, motion_prompt)

        rh_video_task_ids = list(
            await asyncio.gather(*[_submit_segment(url) for url in segment_audio_urls])
        )

        # 7. 存储任务状态（以 local_task_id 为主键）
        _task_store[local_task_id] = {
            "task_id": local_task_id,
            "user_id": user.id,
            "status": "queued",
            "progress": 5,
            "video_url": "",
            "post_video_url": "",
            "post_stage": "",
            "post_progress": 0,
            "post_error": "",
            "audio_url": audio_clone_url,
            "script": req.script,
            "video_prompt": motion_prompt,
            "video_prompt_mode": final_prompt_mode,
            "image_url": image_url,
            "gender": req.gender,
            "cover_url": "",
            "cover_status": "idle",
            "cover_error": "",
            "cover_task_id": "",
            "preset": "default",
            "bgm_dir": "",
            "bgm_volume": 0.32,
            "business_card_text": "",
            "error": "",
            "estimated_minutes": 30,
            "segment_count": segment_count,
            "segments_completed": 0,
            "segment_duration_sec": SEGMENT_DURATION_SEC,
            "credit_clone_cost": credit_clone_cost,
            "credit_video_cost": credit_video_cost,
            "rh_video_task_ids": rh_video_task_ids,
            "segment_paths": [],
            "concat_stage": "idle",
        }
        _set_stage(local_task_id, STAGE_QUEUED, progress=5)

        # 8. 启动后台分段管线
        pipeline_task = asyncio.create_task(_run_dh_segment_pipeline(local_task_id))
        _dh_pipeline_tasks[local_task_id] = pipeline_task

        return TaskStatusResponse(
            task_id=local_task_id,
            status="queued",
            progress=5,
            segment_count=segment_count,
            segments_completed=0,
            audio_url=audio_clone_url,
            estimated_minutes=30,
        )

    except RunningHubError as e:
        raise HTTPException(status_code=e.status_code or 502, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"视频生成流程异常: {e}")
    finally:
        _cleanup_temp(*[p for p in [image_path, audio_path] if p])
        if clone_work_dir:
            shutil.rmtree(clone_work_dir, ignore_errors=True)


async def _run_post_process(task_id: str, video_url: str):
    stored = _task_store.get(task_id, {})
    base_dir = os.path.join(tempfile.gettempdir(), "video-postprocess", task_id)
    os.makedirs(base_dir, exist_ok=True)
    input_path = os.path.join(base_dir, "input.mp4")
    post_video_url = ""
    try:
        await download_to_path(
            video_url,
            input_path,
            max_bytes=MAX_REMOTE_VIDEO_BYTES,
            timeout=180.0,
        )
        _task_store[task_id] = {
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
            render_video_with_template,
            task_id=task_id,
            output_dir=base_dir,
            script=stored.get("script", ""),
            business_card_text=stored.get("business_card_text", ""),
            bgm_dir=_resolve_bgm_dir(stored.get("bgm_dir", "")),
            bgm_volume=float(stored.get("bgm_volume") or 0.32),
            input_video_path=input_path,
        )
        if result.ok and result.output_path:
            post_video_url = result.output_path
            _task_store[task_id] = {
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
            _task_store[task_id] = {
                **stored,
                "task_id": task_id,
                "status": "post_failed",
                "progress": 100,
                "video_url": video_url,
                "post_video_url": "",
                "post_stage": "failed",
                "post_progress": 0,
                "post_error": _sanitize_ffmpeg_error(result.error),
                "error": "",
                "estimated_minutes": 0,
            }
    except Exception as e:
        _task_store[task_id] = {
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
            _task_store[task_id]["post_video_url"] = post_video_url


async def _run_dh_segment_pipeline(local_task_id: str) -> None:
    """后台轮询 n 段 RH 视频任务，下载后 ffmpeg 拼接为半成品（不自动后处理）。"""
    rh = _get_rh_client()
    stored = _task_store.get(local_task_id, {})
    rh_ids = list(stored.get("rh_video_task_ids") or [])
    segment_count = int(stored.get("segment_count") or len(rh_ids) or 1)
    output_dir = os.path.join(GENERATED_VIDEO_CACHE_ROOT, local_task_id)
    os.makedirs(output_dir, exist_ok=True)
    completed_lock = asyncio.Lock()
    segments_completed = 0

    try:
        _set_stage(
            local_task_id,
            STAGE_POLLING_VIDEO,
            status="processing",
            progress=10,
            concat_stage="idle",
        )

        async def _poll_and_download(seg_idx: int, rh_task_id: str) -> tuple[int, str]:
            nonlocal segments_completed
            try:
                result = await rh.wait_for_completion(rh_task_id, max_wait=3000)
                video_url = _pick_first_result_url(result)
                if not video_url:
                    raise RunningHubError(f"第 {seg_idx + 1} 段无有效视频输出")
                seg_path = os.path.join(output_dir, f"segment_{seg_idx:03d}.mp4")
                await download_to_path(
                    video_url,
                    seg_path,
                    max_bytes=MAX_REMOTE_VIDEO_BYTES,
                    timeout=180.0,
                )
                async with completed_lock:
                    segments_completed += 1
                    progress = 10 + int((segments_completed / max(segment_count, 1)) * 75)
                    _task_store[local_task_id] = {
                        **_task_store.get(local_task_id, {}),
                        "segments_completed": segments_completed,
                        "progress": progress,
                    }
                return seg_idx, seg_path
            except Exception as e:
                raise RuntimeError(
                    f"第 {seg_idx + 1}/{segment_count} 段生成失败：{e}"
                ) from e

        segment_results = await asyncio.gather(
            *[_poll_and_download(i, rh_id) for i, rh_id in enumerate(rh_ids)]
        )
        segment_results.sort(key=lambda x: x[0])
        segment_paths = [r[1] for r in segment_results]

        _set_stage(
            local_task_id,
            STAGE_CONCATENATING,
            concat_stage="running",
            progress=88,
            segment_paths=segment_paths,
        )

        concat_path = os.path.join(output_dir, "concat.mp4")
        await asyncio.to_thread(
            concatenate_videos_ffmpeg,
            segment_paths,
            concat_path,
            _FFMPEG_EXE,
        )
        public_url = _generated_video_public_url(concat_path)

        _task_store[local_task_id] = {
            **_task_store.get(local_task_id, {}),
            "task_id": local_task_id,
            "status": "success",
            "progress": 100,
            "video_url": public_url,
            "segment_paths": segment_paths,
            "concat_stage": "done",
            "segments_completed": segment_count,
            "error": "",
            "estimated_minutes": 0,
        }
        _set_stage(local_task_id, STAGE_COMPLETED, progress=100, concat_stage="done")

        image_url = stored.get("image_url", "")
        gender = stored.get("gender", "female")
        if image_url and public_url:
            try:
                print(f"[cover] Auto-generating cover for task {local_task_id}")
                cover_url = await _run_cover_generation(
                    local_task_id, image_url=image_url, gender=gender
                )
                print(f"[cover] Cover generated: {cover_url[:80]}")
            except Exception as e:
                _task_store[local_task_id] = {
                    **_task_store.get(local_task_id, {}),
                    "cover_status": "failed",
                    "cover_error": str(e),
                }
                print(f"[cover] Cover generation failed (non-blocking): {e}")

    except asyncio.CancelledError:
        _task_store[local_task_id] = {
            **stored,
            "task_id": local_task_id,
            "status": "failed",
            "progress": 0,
            "video_url": "",
            "concat_stage": "failed",
            "error": "用户已停止生成（中断任务不会返还积分）",
            "estimated_minutes": 0,
        }
        return
    except Exception as e:
        _task_store[local_task_id] = {
            **stored,
            "task_id": local_task_id,
            "status": "failed",
            "progress": 0,
            "video_url": "",
            "concat_stage": "failed",
            "error": str(e) or "分段视频生成失败",
            "estimated_minutes": 0,
        }
        _set_stage(local_task_id, STAGE_FAILED, concat_stage="failed", error=str(e))
    finally:
        _dh_pipeline_tasks.pop(local_task_id, None)


async def _poll_video_task(task_id: str):
    """后台轮询视频生成任务，完成后自动触发后处理与封面图生成"""
    import asyncio
    rh = _get_rh_client()
    stored = _task_store.get(task_id, {})
    try:
        result = await rh.wait_for_completion(task_id, max_wait=3000)
        video_url = ""
        results = result.get("results", [])
        if results:
            video_url = results[0].get("url", "")
        _task_store[task_id] = {
            **stored,
            "task_id": task_id,
            "status": "success",
            "progress": 100,
            "video_url": video_url,
            "error": "",
            "estimated_minutes": 0,
        }
        if video_url:
            _task_store[task_id] = {
                **_task_store.get(task_id, {}),
                "status": "post_processing",
                "post_stage": "running",
                "post_progress": 5,
                "post_error": "",
            }
            asyncio.create_task(_run_post_process(task_id, video_url))

        image_url = stored.get("image_url", "")
        gender = stored.get("gender", "female")
        if image_url and video_url:
            try:
                print(f"[cover] Auto-generating cover for task {task_id}")
                cover_url = await _run_cover_generation(task_id, image_url=image_url, gender=gender)
                print(f"[cover] Cover generated: {cover_url[:80]}")
            except Exception as e:
                _task_store[task_id] = {
                    **_task_store.get(task_id, {}),
                    "cover_status": "failed",
                    "cover_error": str(e),
                }
                print(f"[cover] Cover generation failed (non-blocking): {e}")
    except asyncio.CancelledError:
        _task_store[task_id] = {
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
        _task_store[task_id] = {
            **stored,
            "task_id": task_id,
            "status": "failed",
            "progress": 0,
            "video_url": "",
            "error": str(e),
            "estimated_minutes": 0,
        }
    except Exception as e:
        _task_store[task_id] = {
            **stored,
            "task_id": task_id,
            "status": "failed",
            "progress": 0,
            "video_url": "",
            "error": f"轮询异常: {e}",
            "estimated_minutes": 0,
        }
    finally:
        _poll_tasks.pop(task_id, None)


@app.post("/api/video/cancel")
async def video_cancel(req: CancelVideoTaskRequest, request: Request):
    user = require_user(request)
    task_id = (req.task_id or "").strip()
    if not task_id:
        raise HTTPException(status_code=400, detail="缺少 task_id 参数")

    stored = _task_store.get(task_id, {})
    assert_task_owner(stored, user, task_id=task_id)

    task = _poll_tasks.pop(task_id, None)
    if task is not None:
        try:
            task.cancel()
        except Exception:
            pass

    dh_task = _dh_pipeline_tasks.pop(task_id, None)
    if dh_task is not None:
        try:
            dh_task.cancel()
        except Exception:
            pass

    _task_store[task_id] = {
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
    """查询视频任务状态。

    必须登录；只能查询本人任务（按 _task_store 中 user_id 校验）。
    响应剥离 script / image_url / audio_url 等可能泄露源素材的字段。
    """
    user = require_user(request)
    if not taskId:
        raise HTTPException(status_code=400, detail="缺少 taskId 参数")

    stored = _task_store.get(taskId)
    if not stored:
        raise HTTPException(
            status_code=404,
            detail={"code": "TASK_NOT_FOUND", "message": "任务不存在或已过期"},
        )
    assert_task_owner(stored, user, task_id=taskId)

    safe = {**stored}
    for sensitive in ("script", "image_url", "audio_url", "video_prompt", "user_id"):
        safe.pop(sensitive, None)
    return TaskStatusResponse(**safe)


# ── POST /api/video/cover ────────────────────────────────────


@app.post("/api/video/manual-upload", response_model=ManualUploadResponse)
async def video_manual_upload(request: Request, file: UploadFile = File(...)):
    user = require_user(request)
    filename = (file.filename or "upload.mp4").strip() or "upload.mp4"
    content_type = (file.content_type or "").lower()
    if not (content_type.startswith("video/") or filename.lower().endswith((".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"))):
        raise HTTPException(status_code=400, detail="仅支持视频文件上传")

    upload_id = _new_manual_upload_id()
    ext = os.path.splitext(filename)[1] or ".mp4"
    upload_dir = os.path.join(MANUAL_UPLOAD_ROOT, upload_id)
    os.makedirs(upload_dir, exist_ok=True)
    stored_path = os.path.join(upload_dir, f"source{ext}")
    size = 0
    try:
        with open(stored_path, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                size += len(chunk)
                if size > 2 * 1024 * 1024 * 1024:
                    raise HTTPException(status_code=413, detail="视频文件请控制在 2GB 以内")
                out.write(chunk)
    finally:
        await file.close()

    _manual_upload_store[upload_id] = {
        "upload_id": upload_id,
        "user_id": user.id,
        "path": stored_path,
        "original_name": filename,
        "size": size,
        "created_at": int(time.time()),
    }
    return ManualUploadResponse(upload_id=upload_id, file_url="", original_name=filename, size=size)


async def _run_edit_job(edit_job_id: str, req: EditVideoRequest, base_url: str = "", user_id: int | None = None):
    stored = _edit_task_store.get(edit_job_id, {})
    task_id = req.task_id or edit_job_id
    output_dir = os.path.join(POST_PROCESS_ROOT, task_id, edit_job_id)
    os.makedirs(output_dir, exist_ok=True)
    cache_input_path = ""
    should_cleanup_cache = False
    slide_temp_paths: list[str] = []
    try:
        _edit_task_store[edit_job_id] = {
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

        # ── 输入归一化：3 个分支只产生 input_path（本地文件路径） ──
        if req.upload_id.strip():
            input_path = _resolve_manual_upload_path(req.upload_id, expected_user_id=user_id)
            _edit_task_store[edit_job_id]["progress"] = 35
        elif req.video_base64.strip():
            input_path = os.path.join(output_dir, f"{task_id}_input.mp4")
            with open(input_path, "wb") as f:
                f.write(base64.b64decode(req.video_base64))
            _edit_task_store[edit_job_id]["progress"] = 35
        else:
            if not req.video_url.strip():
                raise HTTPException(status_code=400, detail="缺少视频地址，无法剪辑")
            input_path, should_cleanup_cache = await _prepare_generated_video_input(
                req.video_url, task_id, output_dir
            )
            if not os.path.exists(input_path):
                raise FileNotFoundError(f"剪辑源视频不存在：{input_path}")
            cache_input_path = input_path if should_cleanup_cache else ""
            _edit_task_store[edit_job_id]["progress"] = 25 if should_cleanup_cache else 35

        # ── 自动字幕：仅当 enable_subtitles 时执行 ASR / 校对 ──
        enable_subtitles = bool(req.enable_subtitles)
        enable_bgm = bool(req.enable_bgm) and float(req.bgm_volume) > 0
        asr_subtitle_path = ""
        if enable_subtitles:
            client_subtitle_path = (req.subtitle_file_path or "").strip()
            if client_subtitle_path:
                # 客户端给的字幕路径必须落在受信任目录里，否则 ffmpeg 的 subtitles=
                # 过滤器可加载任意系统文件作为字幕（信息泄露 / 任意文件读取）
                client_subtitle_path = _ensure_path_in_trusted_root(
                    client_subtitle_path, field="subtitle_file_path",
                )
            asr_subtitle_path = client_subtitle_path
            if not asr_subtitle_path and os.path.isfile(input_path):
                try:
                    _edit_task_store[edit_job_id]["progress"] = 40
                    _edit_task_store[edit_job_id]["status"] = "auto_subtitle"
                    logging.info(f"[edit:{edit_job_id}] 未提供字幕文件，自动执行 ASR 语音识别…")

                    from lib.video_extract import extract_audio_from_local_video, transcribe_audio_with_timestamps
                    from lib.subtitle_generator import timed_sentences_to_subtitle

                    # 1) 从视频中提取音频（16kHz mono WAV）
                    asr_audio_dir = os.path.join(output_dir, "asr_audio")
                    wav_path = extract_audio_from_local_video(input_path, asr_audio_dir)
                    _edit_task_store[edit_job_id]["progress"] = 55

                    # 2) 阿里云 NLS FlashRecognizer 极速版识别（同步返回句子级时间轴）
                    asr_result = await transcribe_audio_with_timestamps(
                        wav_path,
                        sentence_max_length=22,  # 每行最多 22 字
                    )
                    _edit_task_store[edit_job_id]["progress"] = 70
                    _edit_task_store[edit_job_id]["status"] = "subtitle_align"

                    # 3) 校对工序：原文案断句 + ASR 时间戳；失败回退纯 ASR
                    script_text = (req.subtitle_text or "").strip()
                    asr_subtitle_path = try_build_aligned_subtitle(
                        script_text,
                        asr_result.sentences,
                        output_dir,
                        filename_prefix=f"aligned_{edit_job_id}",
                        format="ass",
                    )
                    if asr_subtitle_path:
                        cue_count = len(split_script_cues(script_text))
                        logging.info(
                            f"[edit:{edit_job_id}] 字幕校对对齐完成: "
                            f"{cue_count} cue, ASR {len(asr_result.sentences)} 句, "
                            f"耗时 {asr_result.latency_ms}ms"
                        )
                    else:
                        asr_subtitle_path = timed_sentences_to_subtitle(
                            sentences=asr_result.sentences,
                            output_dir=output_dir,
                            filename_prefix=f"asr_{edit_job_id}",
                            format="ass",
                        )
                        logging.info(
                            f"[edit:{edit_job_id}] ASR 字幕生成完成（未校对）: "
                            f"{len(asr_result.sentences)} 句, "
                            f"文本 {len(asr_result.text)} 字, "
                            f"耗时 {asr_result.latency_ms}ms"
                        )
                    _edit_task_store[edit_job_id]["progress"] = 85
                except Exception as asr_err:
                    # ASR 失败不阻塞剪辑，回退到按字数均分时间轴的传统方案
                    logging.warning(
                        f"[edit:{edit_job_id}] ASR 自动字幕失败，回退到字符比例模式: {asr_err}"
                    )
                    asr_subtitle_path = ""
        else:
            logging.info(f"[edit:{edit_job_id}] 用户关闭字幕，跳过 ASR/校对")
            _edit_task_store[edit_job_id]["progress"] = 85

        # ── 端到端单次 render ──
        business_card_text = req.business_card_text if req.business_card_text.strip() else ""
        bgm_volume = max(0.0, min(float(req.bgm_volume), 1.0)) if enable_bgm else 0.0
        bgm_dir = _resolve_bgm_dir(req.bgm_dir) if enable_bgm else None

        # ── 图片幻灯片预处理：base64 → 临时 PNG 文件 ──
        if req.slide_images_base64:
            for idx, img_b64 in enumerate(req.slide_images_base64):
                if not img_b64.strip():
                    continue
                try:
                    slide_temp_paths.append(
                        await _base64_to_temp_file(img_b64, f"_slide{idx}.png")
                    )
                except HTTPException:
                    raise
                except Exception as e:
                    logging.warning(f"[edit:{edit_job_id}] 第 {idx+1} 张幻灯片图片解码失败: {e}")
            if slide_temp_paths:
                _edit_task_store[edit_job_id]["progress"] = min(
                    _edit_task_store[edit_job_id].get("progress", 85) + 3, 95
                )

        result = await asyncio.to_thread(
            render_video_with_template,
            task_id=task_id,
            output_dir=output_dir,
            script=req.subtitle_text,
            business_card_text=business_card_text,
            bgm_dir=bgm_dir,
            bgm_volume=bgm_volume,
            input_video_path=input_path,
            subtitle_file_path=asr_subtitle_path,
            slide_image_paths=slide_temp_paths or None,
            enable_bgm=enable_bgm,
            enable_subtitles=enable_subtitles,
        )

        if result.ok and result.output_path:
            rel_path = os.path.relpath(result.output_path, POST_PROCESS_ROOT).replace(os.sep, "/")
            base = (base_url or "").rstrip("/")
            public_url = (
                f"{base}/static/video-postprocess/{rel_path}"
                if base
                else f"/static/video-postprocess/{rel_path}"
            )
            _edit_task_store[edit_job_id] = {
                **_edit_task_store.get(edit_job_id, {}),
                "status": "success",
                "progress": 100,
                "output_video_url": public_url,
                "error": "",
            }
            return
        _edit_task_store[edit_job_id] = {
            **_edit_task_store.get(edit_job_id, {}),
            "status": "failed",
            "progress": 0,
            "output_video_url": "",
            "error": _sanitize_ffmpeg_error(result.error) or "剪辑失败",
        }
    except Exception as e:
        _edit_task_store[edit_job_id] = {
            **_edit_task_store.get(edit_job_id, {}),
            "status": "failed",
            "progress": 0,
            "output_video_url": "",
            "error": str(e),
        }
    finally:
        _cleanup_generated_video_cache(cache_input_path, should_cleanup_cache)
        _cleanup_temp(*slide_temp_paths)


@app.post("/api/video/edit", response_model=EditTaskStatusResponse)
async def video_edit(req: EditVideoRequest, request: Request):
    user = require_user(request)
    # subtitle_text 可选：为空时后端会自动执行 ASR 语音识别生成字幕
    # 但至少需要提供一个视频来源
    if not req.video_url.strip() and not req.video_base64.strip() and not req.upload_id.strip():
        raise HTTPException(status_code=400, detail="缺少必填参数: video_url、upload_id 或 video_base64")
    if req.video_base64.strip():
        check_base64_size(req.video_base64, max_mb=500, name="video_base64")
    if req.slide_images_base64:
        for idx, img_b64 in enumerate(req.slide_images_base64):
            if img_b64:
                check_base64_size(img_b64, max_mb=10, name=f"slide_images_base64[{idx}]")

    edit_job_id = _new_edit_job_id()
    task_id = req.task_id or edit_job_id
    _edit_task_store[edit_job_id] = {
        "edit_job_id": edit_job_id,
        "task_id": task_id,
        "user_id": user.id,
        "status": "queued",
        "progress": 0,
        "preset": req.preset,
        "source": req.source,
        "output_video_url": "",
        "error": "",
    }
    edit_base_url = str(request.base_url).rstrip("/") if request is not None else ""
    edit_task = asyncio.create_task(_run_edit_job(edit_job_id, req, edit_base_url, user_id=user.id))
    _edit_tasks[edit_job_id] = edit_task
    return EditTaskStatusResponse(**_edit_task_store[edit_job_id])


@app.get("/api/video/edit/status", response_model=EditTaskStatusResponse)
async def video_edit_status(editJobId: str, request: Request):
    user = require_user(request)
    if not editJobId:
        raise HTTPException(status_code=400, detail="缺少 editJobId 参数")
    stored = _edit_task_store.get(editJobId)
    if not stored:
        raise HTTPException(status_code=404, detail="剪辑任务不存在")
    assert_task_owner(stored, user, task_id=editJobId)
    return EditTaskStatusResponse(**stored)


@app.post("/api/video/manual-edit")
async def video_manual_edit(req: ManualEditRequest, request: Request):
    require_user(request)
    return await video_edit(
        EditVideoRequest(
            task_id="",
            video_url="",
            upload_id=req.upload_id,
            video_base64="",
            preset="default",
            subtitle_text=req.script,
            business_card_text=req.business_card_text,
            bgm_dir=req.bgm_dir,
            bgm_volume=req.bgm_volume,
            source="manual",
            slide_images_base64=req.slide_images_base64,
        ),
        request,
    )


@app.post("/api/video/cover")
async def video_cover(req: CoverGenerateRequest, request: Request):
    """独立提交封面图生成任务"""
    user = require_user(request)
    task_id = (req.task_id or "").strip()
    if not task_id:
        raise HTTPException(status_code=400, detail="缺少 task_id")

    stored = _task_store.get(task_id)
    if not stored:
        raise HTTPException(status_code=404, detail="视频任务不存在")
    assert_task_owner(stored, user, task_id=task_id)

    try:
        image_url = (stored.get("image_url") or req.image_url or "").strip()
        gender = (stored.get("gender") or req.gender or "female").strip() or "female"
        cover_url = await _run_cover_generation(task_id, image_url=image_url, gender=gender)
        return {"cover_url": cover_url, "task_id": task_id, "status": "success"}
    except RunningHubError as e:
        if task_id in _task_store:
            _task_store[task_id] = {
                **_task_store.get(task_id, {}),
                "cover_status": "failed",
                "cover_error": str(e),
            }
        raise HTTPException(status_code=e.status_code or 502, detail=str(e))


# ── POST /api/video/clone-voice ───────────────────────────────


@app.post("/api/video/clone-voice")
async def video_clone_voice(req: VoiceCloneRequest, request: Request):
    """仅音色克隆（不生成视频）"""
    user = require_user(request)
    if not req.audio_base64 or not req.script.strip():
        raise HTTPException(status_code=400, detail="缺少必填参数: audio_base64, script")
    if len(req.script) > 5000:
        raise HTTPException(status_code=400, detail={"code": "SCRIPT_TOO_LONG", "message": "脚本超过 5000 字"})
    check_base64_size(req.audio_base64, max_mb=50, name="audio_base64")

    clone_ref = f"vc_{int(time.time() * 1000)}_{os.urandom(3).hex()}"
    consume_voice_clone(user_id=user.id, ref_id=clone_ref, note="独立音色克隆")

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
            "ref_id": clone_ref,
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


# ── 图文视频 / 视频混剪 异步管线 ─────────────────────────────────


def _normalize_b64_payload(s: str) -> str:
    s = (s or "").strip()
    if not s:
        return s
    if "," in s and s.lower().startswith("data:"):
        s = s.split(",", 1)[1]
    s = s.replace("\n", "").replace("\r", "").replace(" ", "")
    pad = len(s) % 4
    if pad:
        s += "=" * (4 - pad)
    return s


async def _decode_b64_file(b64: str, dest_path: str) -> None:
    try:
        raw = base64.b64decode(_normalize_b64_payload(b64))
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Base64 解码失败: {e}")
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with open(dest_path, "wb") as f:
        f.write(raw)


def _validate_cloned_audio(voice_local_path: str) -> None:
    duration = probe_audio_duration(voice_local_path)
    if duration <= 0:
        raise ValueError("配音下载异常，可能为错误页面或损坏文件，请重试")


def _clip_public_video_url(public_base: str, output_path: str) -> str:
    rel_path = os.path.relpath(output_path, POST_PROCESS_ROOT).replace(os.sep, "/")
    return f"{public_base.rstrip('/')}/static/video-postprocess/{rel_path}"


def _is_iv_cancelled(task_id: str) -> bool:
    stored = _image_task_store.get(task_id) or {}
    return stored.get("stage") == STAGE_IV_CANCELLED or stored.get("status") == "cancelled"


def _is_mv_cancelled(task_id: str) -> bool:
    stored = _mashup_task_store.get(task_id) or {}
    return stored.get("stage") == STAGE_MV_CANCELLED or stored.get("status") == "cancelled"


async def _tick_iv_render_progress(task_id: str, started_at: float) -> None:
    while True:
        await asyncio.sleep(15)
        stored = _image_task_store.get(task_id) or {}
        if stored.get("stage") != STAGE_IV_RENDERING:
            return
        elapsed = time.time() - started_at
        progress = min(95, int(elapsed / 600.0 * 95))
        _set_iv_stage(task_id, STAGE_IV_RENDERING, progress=progress, status="processing")


async def _tick_mv_render_progress(task_id: str, started_at: float) -> None:
    while True:
        await asyncio.sleep(15)
        stored = _mashup_task_store.get(task_id) or {}
        if stored.get("stage") != STAGE_MV_RENDERING:
            return
        elapsed = time.time() - started_at
        progress = min(95, int(elapsed / 900.0 * 95))
        _set_mv_stage(task_id, STAGE_MV_RENDERING, progress=progress, status="processing")


async def _run_iv_pipeline(task_id: str) -> None:
    stored = _image_task_store.get(task_id) or {}
    public_base = stored.get("public_base_url") or ""
    image_paths = list(stored.get("image_paths") or [])
    audio_path = stored.get("audio_path") or ""
    script = stored.get("script") or ""
    enable_bgm = bool(stored.get("enable_bgm", True))
    enable_subtitles = bool(stored.get("enable_subtitles", True))
    bgm_volume = float(stored.get("bgm_volume") or 0.32) if enable_bgm else 0.0
    output_dir = stored.get("output_dir") or os.path.join(POST_PROCESS_ROOT, task_id)
    try:
        if _is_iv_cancelled(task_id):
            return
        rh = _get_rh_client()
        _set_iv_stage(task_id, STAGE_IV_UPLOADING_AUDIO, status="processing", progress=5)
        audio_url = await rh.upload_file(audio_path)
        if _is_iv_cancelled(task_id):
            return
        _set_iv_stage(task_id, STAGE_IV_SUBMITTING_CLONE, progress=15)
        audio_clone_task_id = await rh.submit_audio_clone(audio_url, audio_url, script)
        _image_task_store[task_id]["rh_clone_task_id"] = audio_clone_task_id
        if _is_iv_cancelled(task_id):
            return
        _set_iv_stage(task_id, STAGE_IV_WAITING_CLONE, progress=25)
        audio_result = await rh.wait_for_completion(audio_clone_task_id, max_wait=600)
        audio_clone_url = _pick_first_result_url(audio_result)
        if not audio_clone_url:
            raise RunningHubError("音频克隆完成但未返回结果 URL")
        if _is_iv_cancelled(task_id):
            return
        _set_iv_stage(task_id, STAGE_IV_DOWNLOADING_CLONE, progress=55)
        voice_local_path = os.path.join(output_dir, f"{task_id}_voice.mp3")
        await download_to_path(audio_clone_url, voice_local_path, max_bytes=MAX_REMOTE_AUDIO_BYTES, timeout=180.0)
        await asyncio.to_thread(_validate_cloned_audio, voice_local_path)
        if _is_iv_cancelled(task_id):
            return
        subtitle_file_path = ""
        if enable_subtitles:
            _set_iv_stage(task_id, STAGE_IV_ASR_SUBTITLE, progress=58)
            try:
                subtitle_file_path = await build_asr_ass_from_audio(
                    voice_local_path,
                    output_dir,
                    f"asr_{task_id}",
                    video_width=1080,
                    video_height=1440,
                    script=script,
                )
            except Exception as asr_err:
                logging.warning(f"[iv:{task_id}] ASR 字幕失败，回退字符比例模式: {asr_err}")
        if _is_iv_cancelled(task_id):
            return
        render_started = time.time()
        _set_iv_stage(task_id, STAGE_IV_RENDERING, progress=60)
        progress_task = asyncio.create_task(_tick_iv_render_progress(task_id, render_started))
        try:
            result = await asyncio.to_thread(
                image_video_render,
                task_id=task_id,
                output_dir=output_dir,
                image_paths=image_paths,
                script=script,
                voice_audio_path=voice_local_path,
                bgm_dir=_resolve_bgm_dir("") if enable_bgm else None,
                bgm_volume=bgm_volume,
                subtitle_file_path=subtitle_file_path,
                enable_bgm=enable_bgm,
                enable_subtitles=enable_subtitles,
            )
        finally:
            progress_task.cancel()
            try:
                await progress_task
            except asyncio.CancelledError:
                pass
        if _is_iv_cancelled(task_id):
            return
        if result.ok and result.output_path and os.path.isfile(result.output_path):
            file_size = os.path.getsize(result.output_path)
            if file_size < 1024:
                raise ValueError(f"ffmpeg 产物过小 ({file_size} bytes)，疑似损坏")
            public_url = _clip_public_video_url(public_base, result.output_path)
            _set_iv_stage(task_id, STAGE_IV_COMPLETED, status="completed", progress=100, video_url=public_url, audio_url=audio_clone_url, error="")
        else:
            raise ValueError(_sanitize_ffmpeg_error(result.error) or "ffmpeg 合成失败")
    except asyncio.CancelledError:
        _set_iv_stage(task_id, STAGE_IV_CANCELLED, status="cancelled", error="用户已停止生成（中断任务不会返还积分）")
        raise
    except RunningHubError as e:
        _set_iv_stage(task_id, STAGE_IV_FAILED, status="failed", error=str(e))
    except Exception as e:
        _set_iv_stage(task_id, STAGE_IV_FAILED, status="failed", error=str(e) or "图文视频生成流程异常")
    finally:
        _image_pipeline_tasks.pop(task_id, None)


async def _run_mv_pipeline(task_id: str) -> None:
    stored = _mashup_task_store.get(task_id) or {}
    public_base = stored.get("public_base_url") or ""
    video_paths = list(stored.get("video_paths") or [])
    audio_path = stored.get("audio_path") or ""
    script = stored.get("script") or ""
    enable_bgm = bool(stored.get("enable_bgm", True))
    enable_subtitles = bool(stored.get("enable_subtitles", True))
    bgm_volume = float(stored.get("bgm_volume") or 0.32) if enable_bgm else 0.0
    output_dir = stored.get("output_dir") or os.path.join(POST_PROCESS_ROOT, task_id)
    try:
        if _is_mv_cancelled(task_id):
            return
        rh = _get_rh_client()
        _set_mv_stage(task_id, STAGE_MV_UPLOADING_AUDIO, status="processing", progress=5)
        audio_url = await rh.upload_file(audio_path)
        if _is_mv_cancelled(task_id):
            return
        _set_mv_stage(task_id, STAGE_MV_SUBMITTING_CLONE, progress=15)
        audio_clone_task_id = await rh.submit_audio_clone(audio_url, audio_url, script)
        _mashup_task_store[task_id]["rh_clone_task_id"] = audio_clone_task_id
        if _is_mv_cancelled(task_id):
            return
        _set_mv_stage(task_id, STAGE_MV_WAITING_CLONE, progress=25)
        audio_result = await rh.wait_for_completion(audio_clone_task_id, max_wait=600)
        audio_clone_url = _pick_first_result_url(audio_result)
        if not audio_clone_url:
            raise RunningHubError("音频克隆完成但未返回结果 URL")
        if _is_mv_cancelled(task_id):
            return
        _set_mv_stage(task_id, STAGE_MV_DOWNLOADING_CLONE, progress=55)
        voice_local_path = os.path.join(output_dir, f"{task_id}_voice.mp3")
        await download_to_path(audio_clone_url, voice_local_path, max_bytes=MAX_REMOTE_AUDIO_BYTES, timeout=180.0)
        await asyncio.to_thread(_validate_cloned_audio, voice_local_path)
        if _is_mv_cancelled(task_id):
            return
        subtitle_file_path = ""
        if enable_subtitles:
            _set_mv_stage(task_id, STAGE_MV_ASR_SUBTITLE, progress=58)
            try:
                subtitle_file_path = await build_asr_ass_from_audio(
                    voice_local_path,
                    output_dir,
                    f"asr_{task_id}",
                    video_width=1080,
                    video_height=1440,
                    script=script,
                )
            except Exception as asr_err:
                logging.warning(f"[mv:{task_id}] ASR 字幕失败，回退字符比例模式: {asr_err}")
        if _is_mv_cancelled(task_id):
            return
        render_started = time.time()
        _set_mv_stage(task_id, STAGE_MV_RENDERING, progress=60)
        progress_task = asyncio.create_task(_tick_mv_render_progress(task_id, render_started))
        try:
            result = await asyncio.to_thread(
                mashup_video_render,
                task_id=task_id,
                output_dir=output_dir,
                video_paths=video_paths,
                script=script,
                voice_audio_path=voice_local_path,
                bgm_dir=_resolve_bgm_dir("") if enable_bgm else None,
                bgm_volume=bgm_volume,
                subtitle_file_path=subtitle_file_path,
                enable_bgm=enable_bgm,
                enable_subtitles=enable_subtitles,
            )
        finally:
            progress_task.cancel()
            try:
                await progress_task
            except asyncio.CancelledError:
                pass
        if _is_mv_cancelled(task_id):
            return
        if result.ok and result.output_path and os.path.isfile(result.output_path):
            file_size = os.path.getsize(result.output_path)
            if file_size < 1024:
                raise ValueError(f"ffmpeg 产物过小 ({file_size} bytes)，疑似损坏")
            public_url = _clip_public_video_url(public_base, result.output_path)
            _set_mv_stage(task_id, STAGE_MV_COMPLETED, status="completed", progress=100, video_url=public_url, audio_url=audio_clone_url, error="")
        else:
            raise ValueError(_sanitize_ffmpeg_error(result.error) or "ffmpeg 混剪失败")
    except asyncio.CancelledError:
        _set_mv_stage(task_id, STAGE_MV_CANCELLED, status="cancelled", error="用户已停止生成（中断任务不会返还积分）")
        raise
    except RunningHubError as e:
        _set_mv_stage(task_id, STAGE_MV_FAILED, status="failed", error=str(e))
    except Exception as e:
        _set_mv_stage(task_id, STAGE_MV_FAILED, status="failed", error=str(e) or "视频混剪流程异常")
    finally:
        _mashup_pipeline_tasks.pop(task_id, None)


def _clip_status_from_store(stored: dict) -> ClipTaskStatusResponse:
    return ClipTaskStatusResponse(
        task_id=stored.get("task_id", ""),
        status=stored.get("status", ""),
        progress=int(stored.get("progress") or 0),
        video_url=stored.get("video_url", ""),
        audio_url=stored.get("audio_url", ""),
        error=stored.get("error", ""),
        stage=stored.get("stage", ""),
        stage_label=stored.get("stage_label", ""),
        stage_history=list(stored.get("stage_history") or []),
        stage_updated_at=float(stored.get("stage_updated_at") or 0),
    )


@app.post("/api/video/image-to-video", response_model=ImageToVideoResponse)
async def video_image_to_video(req: ImageToVideoRequest, request: Request):
    """图文视频创作（异步）：解码素材后返回 task_id，后台克隆 + ffmpeg。"""
    user = require_user(request)
    _check_request_size(request)
    if len(req.images_base64) < 7:
        raise HTTPException(status_code=400, detail="至少需要上传 7 张图片")
    if len(req.images_base64) > 30:
        raise HTTPException(status_code=400, detail="图片数量不能超过 30 张")
    if not req.audio_base64 or not req.script.strip():
        raise HTTPException(status_code=400, detail="缺少必填参数: audio_base64, script")
    if len(req.script) > 5000:
        raise HTTPException(status_code=400, detail={"code": "SCRIPT_TOO_LONG", "message": "脚本超过 5000 字"})
    check_base64_size(req.audio_base64, max_mb=50, name="audio_base64")
    for idx, img_b64 in enumerate(req.images_base64):
        check_base64_size(img_b64, max_mb=10, name=f"images_base64[{idx}]")

    task_id = f"img2vid_{int(time.time() * 1000)}_{os.urandom(3).hex()}"
    consume_with_idempotency(user_id=user.id, scene="video_image_to_video", ref_id=task_id, note="图文视频创作")

    output_dir = os.path.join(POST_PROCESS_ROOT, task_id)
    inputs_dir = os.path.join(output_dir, "inputs")
    public_base = str(request.base_url).rstrip("/")

    _image_task_store[task_id] = {
        "task_id": task_id,
        "user_id": user.id,
        "status": "queued",
        "progress": 0,
        "stage": STAGE_IV_DECODING_IMAGES,
        "stage_label": IV_STAGE_LABELS[STAGE_IV_DECODING_IMAGES],
        "stage_history": [STAGE_IV_DECODING_IMAGES],
        "stage_updated_at": time.time(),
        "video_url": "",
        "audio_url": "",
        "error": "",
        "script": req.script.strip(),
        "bgm_volume": max(0.0, min(float(req.bgm_volume), 1.0)),
        "enable_bgm": bool(req.enable_bgm),
        "enable_subtitles": bool(req.enable_subtitles),
        "image_paths": [],
        "audio_path": "",
        "output_dir": output_dir,
        "public_base_url": public_base,
        "rh_clone_task_id": "",
    }

    try:
        image_paths: list[str] = []
        for idx, img_b64 in enumerate(req.images_base64):
            img_path = os.path.join(inputs_dir, f"img_{idx}.png")
            await _decode_b64_file(img_b64, img_path)
            image_paths.append(img_path)
        _set_iv_stage(task_id, STAGE_IV_DECODING_AUDIO, progress=3)
        audio_path = os.path.join(inputs_dir, "audio_sample.mp3")
        await _decode_b64_file(req.audio_base64, audio_path)
        _image_task_store[task_id]["image_paths"] = image_paths
        _image_task_store[task_id]["audio_path"] = audio_path
        pipeline = asyncio.create_task(_run_iv_pipeline(task_id))
        _image_pipeline_tasks[task_id] = pipeline
        return ImageToVideoResponse(task_id=task_id, status="queued")
    except HTTPException:
        _image_task_store.pop(task_id, None)
        raise
    except Exception as e:
        _image_task_store.pop(task_id, None)
        raise HTTPException(status_code=500, detail=f"图文视频任务初始化失败: {e}")


@app.get("/api/video/image-to-video/status", response_model=ClipTaskStatusResponse)
async def image_to_video_status(taskId: str, request: Request):
    user = require_user(request)
    if not taskId:
        raise HTTPException(status_code=400, detail="缺少 taskId 参数")
    stored = _image_task_store.get(taskId)
    if not stored:
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": "任务不存在或已过期"})
    assert_task_owner(stored, user, task_id=taskId)
    return _clip_status_from_store(stored)


@app.post("/api/video/image-to-video/cancel")
async def image_to_video_cancel(req: CancelClipTaskRequest, request: Request):
    user = require_user(request)
    task_id = (req.task_id or "").strip()
    if not task_id:
        raise HTTPException(status_code=400, detail="缺少 task_id 参数")
    stored = _image_task_store.get(task_id, {})
    if not stored:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    assert_task_owner(stored, user, task_id=task_id)
    pipeline = _image_pipeline_tasks.pop(task_id, None)
    if pipeline is not None:
        pipeline.cancel()
    _set_iv_stage(task_id, STAGE_IV_CANCELLED, status="cancelled", progress=0, video_url="", error="用户已停止生成（中断任务不会返还积分）")
    return {"ok": True, "task_id": task_id}


# ── POST /api/video/mashup ──────────────────────────────────────


@app.post("/api/video/mashup", response_model=MashupVideoResponse)
async def video_mashup(req: MashupVideoRequest, request: Request):
    """视频混剪创作（异步）：解码素材后返回 task_id，后台克隆 + ffmpeg。"""
    user = require_user(request)
    _check_request_size(request)
    if len(req.videos_base64) < 5:
        raise HTTPException(status_code=400, detail="至少需要上传 5 段视频素材")
    if len(req.videos_base64) > 20:
        raise HTTPException(status_code=400, detail="视频素材数量不能超过 20 段")
    if not req.audio_base64 or not req.script.strip():
        raise HTTPException(status_code=400, detail="缺少必填参数: audio_base64, script")
    if len(req.script) > 5000:
        raise HTTPException(status_code=400, detail={"code": "SCRIPT_TOO_LONG", "message": "脚本超过 5000 字"})
    check_base64_size(req.audio_base64, max_mb=50, name="audio_base64")
    for idx, vid_b64 in enumerate(req.videos_base64):
        check_base64_size(vid_b64, max_mb=200, name=f"videos_base64[{idx}]")

    task_id = f"mashup_{int(time.time() * 1000)}_{os.urandom(3).hex()}"
    consume_with_idempotency(user_id=user.id, scene="video_mashup", ref_id=task_id, note="视频素材混剪")

    output_dir = os.path.join(POST_PROCESS_ROOT, task_id)
    inputs_dir = os.path.join(output_dir, "inputs")
    public_base = str(request.base_url).rstrip("/")

    _mashup_task_store[task_id] = {
        "task_id": task_id,
        "user_id": user.id,
        "status": "queued",
        "progress": 0,
        "stage": STAGE_MV_DECODING_VIDEOS,
        "stage_label": MV_STAGE_LABELS[STAGE_MV_DECODING_VIDEOS],
        "stage_history": [STAGE_MV_DECODING_VIDEOS],
        "stage_updated_at": time.time(),
        "video_url": "",
        "audio_url": "",
        "error": "",
        "script": req.script.strip(),
        "bgm_volume": max(0.0, min(float(req.bgm_volume), 1.0)),
        "enable_bgm": bool(req.enable_bgm),
        "enable_subtitles": bool(req.enable_subtitles),
        "video_paths": [],
        "audio_path": "",
        "output_dir": output_dir,
        "public_base_url": public_base,
        "rh_clone_task_id": "",
    }

    try:
        video_paths: list[str] = []
        for idx, vid_b64 in enumerate(req.videos_base64):
            vid_path = os.path.join(inputs_dir, f"vid_{idx}.mp4")
            await _decode_b64_file(vid_b64, vid_path)
            video_paths.append(vid_path)
        _set_mv_stage(task_id, STAGE_MV_DECODING_AUDIO, progress=3)
        audio_path = os.path.join(inputs_dir, "audio_sample.mp3")
        await _decode_b64_file(req.audio_base64, audio_path)
        _mashup_task_store[task_id]["video_paths"] = video_paths
        _mashup_task_store[task_id]["audio_path"] = audio_path
        pipeline = asyncio.create_task(_run_mv_pipeline(task_id))
        _mashup_pipeline_tasks[task_id] = pipeline
        return MashupVideoResponse(task_id=task_id, status="queued")
    except HTTPException:
        _mashup_task_store.pop(task_id, None)
        raise
    except Exception as e:
        _mashup_task_store.pop(task_id, None)
        raise HTTPException(status_code=500, detail=f"视频混剪任务初始化失败: {e}")


@app.get("/api/video/mashup/status", response_model=ClipTaskStatusResponse)
async def mashup_status(taskId: str, request: Request):
    user = require_user(request)
    if not taskId:
        raise HTTPException(status_code=400, detail="缺少 taskId 参数")
    stored = _mashup_task_store.get(taskId)
    if not stored:
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": "任务不存在或已过期"})
    assert_task_owner(stored, user, task_id=taskId)
    return _clip_status_from_store(stored)


@app.post("/api/video/mashup/cancel")
async def mashup_cancel(req: CancelClipTaskRequest, request: Request):
    user = require_user(request)
    task_id = (req.task_id or "").strip()
    if not task_id:
        raise HTTPException(status_code=400, detail="缺少 task_id 参数")
    stored = _mashup_task_store.get(task_id, {})
    if not stored:
        raise HTTPException(status_code=404, detail="任务不存在或已过期")
    assert_task_owner(stored, user, task_id=task_id)
    pipeline = _mashup_pipeline_tasks.pop(task_id, None)
    if pipeline is not None:
        pipeline.cancel()
    _set_mv_stage(task_id, STAGE_MV_CANCELLED, status="cancelled", progress=0, video_url="", error="用户已停止生成（中断任务不会返还积分）")
    return {"ok": True, "task_id": task_id}


# ════════════════════════════════════════════════════════════════════════
#  一键分享 API
# ════════════════════════════════════════════════════════════════════════

import json as _json, secrets, time as _time
import hmac
import html

_share_store: dict[str, dict] = {}  # token → { videoUrl, title, description, tags, created_at }

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
    for token, data in list(_share_store.items()):
        created_at = 0.0
        try:
            created_at = float((data or {}).get("created_at", 0) or 0)
        except Exception:
            created_at = 0.0
        if t - created_at > SHARE_TTL:
            expired.append(token)
    for token in expired:
        _share_store.pop(token, None)
    return len(expired)


def _enforce_share_store_capacity(max_size: int = SHARE_STORE_MAX) -> int:
    removed = 0
    if max_size <= 0:
        _share_store.clear()
        return 0
    while len(_share_store) > max_size:
        oldest = next(iter(_share_store), None)
        if oldest is None:
            break
        _share_store.pop(oldest, None)
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
    while token in _share_store:
        token = _make_share_token()
    _share_store[token] = {
        "videoUrl": video_url,
        "title": title,
        "description": description,
        "tags": _clean_share_tags(req.tags),
        "created_at": now,
    }
    _enforce_share_store_capacity(SHARE_STORE_MAX)
    base = base_from_env or SHARE_BASE_URL or str(request.base_url).rstrip("/")
    share_url = f"{base}/api/share/{token}"
    return {"share_token": token, "share_url": share_url}


@app.get("/api/share/{token}")
async def share_redirect(token: str):
    """分享落地页"""
    if not re.fullmatch(r"[0-9a-f]{32}", token or ""):
        raise HTTPException(status_code=404, detail="Not Found")
    data = _share_store.get(token)
    if not data:
        raise HTTPException(status_code=410, detail="分享链接已过期或不存在")
    if _time.time() - data["created_at"] > SHARE_TTL:
        del _share_store[token]
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


def _public_base(request: Request) -> str:
    """获取公网访问地址，用于邮件中链接拼接。"""
    env_base = (os.getenv("APP_PUBLIC_BASE") or "").strip().rstrip("/")
    if env_base:
        return env_base
    # fallback: 用 host header 推断
    host = request.headers.get("host", "")
    if host:
        scheme = request.url.scheme
        return f"{scheme}://{host}"
    return ""


class SendLinkRequest(BaseModel):
    email: str


class RegisterRequest(BaseModel):
    login_name: str
    password: str
    confirm_password: str


class PasswordLoginRequest(BaseModel):
    login_name: str
    password: str


@app.post("/api/auth/register")
async def auth_register(req: RegisterRequest, request: Request, response: Response):
    login_name = normalize_login_name(req.login_name)
    password = req.password or ""
    confirm_password = req.confirm_password or ""
    login_name_error = validate_login_name(login_name)
    if login_name_error:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": login_name_error})
    password_error = validate_password(password)
    if password_error:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": password_error})
    if password != confirm_password:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": "两次输入的密码不一致"})
    try:
        user_id = create_password_user(login_name, password)
    except ValueError as e:
        raise HTTPException(status_code=400, detail={"code": "REGISTER_FAILED", "message": str(e)}) from e
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
    user = get_user_identity(user_id) or {
        "id": user_id,
        "email_masked": login_name,
        "login_name": login_name,
    }
    return {"user": user, "balance": acct.balance}


@app.post("/api/auth/login")
async def auth_login(req: PasswordLoginRequest, request: Request, response: Response):
    login_name = normalize_login_name(req.login_name)
    password = req.password or ""
    login_name_error = validate_login_name(login_name)
    if login_name_error:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": login_name_error})
    password_error = validate_password(password)
    if password_error:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": password_error})
    ip = request.client.host if request.client else ""
    user_id = verify_password_login(login_name, password, ip)
    if not user_id:
        raise HTTPException(status_code=401, detail={"code": "INVALID_CREDENTIALS", "message": "账号或密码错误"})
    ua = request.headers.get("user-agent", "")
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
    user = get_user_identity(user_id) or {
        "id": user_id,
        "email_masked": login_name,
        "login_name": login_name,
    }
    return {"user": user, "balance": acct.balance}


@app.post("/api/auth/send-link")
async def auth_send_link(req: SendLinkRequest, request: Request):
    """发送登录链接。永远返回 ok=True，不告诉前端是限频了还是 email 错了。"""
    email = (req.email or "").strip()
    if not email or not _EMAIL_RE.match(email) or len(email) > 254:
        return {"ok": True}
    email_h = hash_email(email)
    ok, _ = check_email(email_h)
    if not ok:
        return {"ok": True}
    ip = request.client.host if request.client else ""
    ok, _ = check_ip(ip)
    if not ok:
        return {"ok": True}
    token = generate_token()
    save_email_token(email, token)
    base = _public_base(request)
    link = f"{base}/auth/verify?token={token}"
    send_login_link(email, link)
    try:
        rate_record("email", email_h)
        if ip:
            rate_record("ip", ip)
    except Exception:
        logger.exception("rate_record failed")
    return {"ok": True}


class VerifyTokenRequest(BaseModel):
    token: str


@app.post("/api/auth/verify-token")
async def auth_verify_token(req: VerifyTokenRequest, request: Request, response: Response):
    """验证 token 并登录。"""
    token = (req.token or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": "token 不能为空"})
    info = consume_email_token(token)
    if not info:
        raise HTTPException(status_code=401, detail={"code": "INVALID_TOKEN", "message": "链接无效或已过期"})
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
            "login_name": user.login_name,
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


@app.post("/api/credit/consume")
async def credit_consume(req: CreditConsumeRequest, request: Request):
    """服务端定价 + 幂等扣费。

    安全要点：
    - 完全忽略 req.cost（之前未被覆盖的场景任由客户端指定金额 → 可以传 0 白嫖）
    - scene 必须命中 SCENE_COST_TABLE，否则 400
    - ai_llm 计量场景禁止走本接口（须 consume-metered + 服务端密钥）
    - ref_id 必须由客户端提供且唯一；重复扣费走幂等返回，不再次扣
    """
    user = require_user(request)
    scene = (req.scene or "").strip()
    if not scene:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_INPUT", "message": "scene 不能为空"},
        )
    if scene == "ai_llm":
        raise HTTPException(
            status_code=400,
            detail={
                "code": "METERED_ONLY",
                "message": "ai_llm 须走计量扣费接口",
            },
        )
    if scene not in SCENE_COST_TABLE:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_SCENE", "message": f"不支持的消费场景: {scene}"},
        )
    ref_id = (req.ref_id or "").strip() or scene
    note = (req.note or scene)[:200]
    new_balance = consume_with_idempotency(
        user_id=user.id,
        scene=scene,
        ref_id=ref_id,
        note=note,
        cost=req.cost,
    )
    resolved_cost = req.cost if req.cost is not None else SCENE_COST_TABLE[scene]
    return {
        "balance": new_balance,
        "cost": resolved_cost,
        "scene": scene,
        "ref_id": ref_id,
    }


@app.post("/api/credit/consume-billing")
async def credit_consume_billing(req: CreditBillingRequest, request: Request):
    """定价注册表解析 + 幂等扣费。客户端只传 billing_key + params，不传 cost。"""
    from lib.api_auth import consume_billing_event
    from lib.credit import CreditError

    user = require_user(request)
    billing_key = (req.billing_key or "").strip()
    ref_id = (req.ref_id or "").strip()
    if not billing_key:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_INPUT", "message": "billing_key 不能为空"},
        )
    if not ref_id:
        raise HTTPException(
            status_code=400,
            detail={"code": "MISSING_REF_ID", "message": "缺少幂等键 ref_id"},
        )
    try:
        balance, cost, scene = consume_billing_event(
            user_id=user.id,
            billing_key=billing_key,
            params=req.params or {},
            ref_id=ref_id,
        )
    except CreditError as e:
        raise HTTPException(status_code=e.status_code, detail=e.detail) from e
    return {
        "balance": balance,
        "cost": cost,
        "scene": scene,
        "ref_id": ref_id,
        "billing_key": billing_key,
    }


class CreditMeteredRequest(BaseModel):
    user_id: int
    scene: str = "ai_llm"
    ref_id: str = ""
    cost: int
    note: str = ""


def _require_metered_key(request: Request) -> None:
    import hmac

    expected = (os.getenv("CREDIT_METERED_KEY") or "").strip()
    if not expected:
        raise HTTPException(
            status_code=503,
            detail={"code": "METERED_KEY_MISSING", "message": "未配置 CREDIT_METERED_KEY"},
        )
    got = (request.headers.get("X-Metered-Key") or "").strip()
    if not got or not hmac.compare_digest(got, expected):
        raise HTTPException(
            status_code=401,
            detail={"code": "UNAUTHORIZED", "message": "计量扣费密钥无效"},
        )


@app.post("/api/credit/consume-metered")
async def credit_consume_metered(req: CreditMeteredRequest, request: Request):
    """Sonetto 等变价场景：仅持有 CREDIT_METERED_KEY 的 Next 服务端可调。"""
    from lib.api_auth import consume_ai_llm

    _require_metered_key(request)
    scene = (req.scene or "ai_llm").strip()
    if scene != "ai_llm":
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_SCENE", "message": "计量接口仅支持 ai_llm"},
        )
    ref_id = (req.ref_id or "").strip()
    if not ref_id:
        raise HTTPException(
            status_code=400,
            detail={"code": "MISSING_REF_ID", "message": "缺少幂等键 ref_id"},
        )
    if not isinstance(req.user_id, int) or req.user_id < 1:
        raise HTTPException(
            status_code=400,
            detail={"code": "INVALID_INPUT", "message": "user_id 无效"},
        )
    note = (req.note or "AI 模型计量")[:200]
    new_balance = consume_ai_llm(
        user_id=req.user_id,
        ref_id=ref_id,
        cost=req.cost,
        note=note,
    )
    return {
        "balance": new_balance,
        "cost": req.cost,
        "scene": scene,
        "ref_id": ref_id,
    }


@app.get("/api/credit/redeem-codes")
async def credit_redeem_codes_admin(request: Request):
    _require_admin_key(request)
    return {"amounts": list(REDEEM_CODE_AMOUNTS), "batches": list_redeem_code_batches()}


@app.get("/api/credit/redeem-codes/items")
async def credit_redeem_codes_items(request: Request, batch_id: str = ""):
    _require_admin_key(request)
    if not batch_id.strip():
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": "batch_id 不能为空"})
    return {"items": list_redeem_codes_by_batch(batch_id.strip())}


@app.post("/api/credit/redeem-codes/generate")
async def credit_redeem_codes_generate(req: RedeemGenerateRequest, request: Request):
    _require_admin_key(request)
    user = get_current_user(request)
    created_by = user.id if user else None
    items = generate_redeem_codes(
        req.amount,
        req.count,
        created_by_user_id=created_by,
        batch_id=req.batch_id,
        note=req.note,
    )
    return {"items": items, "count": len(items)}


class AdminAdjustRequest(BaseModel):
    user_id: int
    delta: int
    note: str = ""


@app.get("/api/credit/admin/users")
async def credit_admin_list_users(
    request: Request,
    page: int = 1,
    limit: int = 20,
    search: str = "",
):
    _require_admin_key(request)
    return admin_list_users(page=page, limit=limit, search=search)


@app.post("/api/credit/admin/adjust")
async def credit_admin_adjust(req: AdminAdjustRequest, request: Request):
    _require_admin_key(request)
    if not isinstance(req.user_id, int) or req.user_id < 1:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": "user_id 无效"})
    new_balance = admin_adjust_balance(req.user_id, req.delta, req.note)
    return {"user_id": req.user_id, "balance": new_balance, "delta": req.delta}


@app.post("/api/credit/redeem")
async def credit_redeem(req: RedeemCodeRequest, request: Request):
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    result = redeem_code(user.id, req.code)
    acct = get_account(user.id)
    return {"result": result, "balance": acct.balance}


# ════════════════════════════════════════════════════════════════════════
#  账号绑定 API
# ════════════════════════════════════════════════════════════════════════

import sqlite3, uuid as _uuid
from lib.crypto_utils import encrypt_cookie, decrypt_cookie

# 与 lib/db.py:DB_PATH 共用同一物理文件：优先读 CREDIT_DB_OVERRIDE 环境变量，
# 否则用 <project>/data/accounts.db（开发期默认）。
# 生产机部署：通过 DATA_DIR + CREDIT_DB_OVERRIDE 把 DB 移到 Volume 挂载点。
_ACCOUNTS_DB = (
    (os.getenv("CREDIT_DB_OVERRIDE") or "").strip()
    or os.path.join(os.path.dirname(__file__), "data", "accounts.db")
)


_SUPPORTED_ACCOUNT_PLATFORMS = ("douyin", "shipinhao", "xiaohongshu")


def _init_accounts_db():
    """初始化账号数据库（首次调用时自动创建）。

    user_id 列在旧库上通过 ADD COLUMN 兼容迁移；旧数据 user_id 留空，
    管理员可在 admin 后台清理或转移。
    """
    os.makedirs(os.path.dirname(_ACCOUNTS_DB), exist_ok=True)
    conn = sqlite3.connect(_ACCOUNTS_DB)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL DEFAULT 0,
                platform TEXT NOT NULL,
                nickname TEXT DEFAULT '',
                cookie_encrypted TEXT NOT NULL,
                cookie_iv TEXT NOT NULL,
                login_status TEXT DEFAULT 'unknown',
                created_at REAL NOT NULL,
                updated_at REAL NOT NULL
            )
        """)
        cols = {row[1] for row in conn.execute("PRAGMA table_info(accounts)").fetchall()}
        if "user_id" not in cols:
            conn.execute("ALTER TABLE accounts ADD COLUMN user_id INTEGER NOT NULL DEFAULT 0")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_accounts_user_platform ON accounts(user_id, platform)"
        )
        conn.commit()
    finally:
        conn.close()


class AccountBindRequest(BaseModel):
    platform: str
    cookieJson: str
    nickname: str = ""


@app.post("/api/accounts/bind")
async def account_bind(req: AccountBindRequest, request: Request):
    """绑定平台账号 Cookie（按用户隔离）"""
    user = require_user(request)
    _init_accounts_db()
    platform = req.platform.strip()
    if platform not in _SUPPORTED_ACCOUNT_PLATFORMS:
        raise HTTPException(status_code=400, detail="不支持的平台")
    if not req.cookieJson.strip():
        raise HTTPException(status_code=400, detail="Cookie 不能为空")
    if len(req.cookieJson) > 65536:
        raise HTTPException(status_code=413, detail="Cookie 过大")

    encrypted, iv = encrypt_cookie(req.cookieJson.strip())
    now = _time.time()
    account_id = str(_uuid.uuid4())[:8]
    nickname = (req.nickname or "").strip()[:64]

    conn = sqlite3.connect(_ACCOUNTS_DB)
    try:
        # 仅清掉当前用户在该平台的旧绑定，绝不动其他用户的记录
        conn.execute(
            "DELETE FROM accounts WHERE user_id = ? AND platform = ?",
            (user.id, platform),
        )
        conn.execute(
            "INSERT INTO accounts (id, user_id, platform, nickname, cookie_encrypted, cookie_iv, login_status, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (account_id, user.id, platform, nickname, encrypted, iv, "valid", now, now),
        )
        conn.commit()
    finally:
        conn.close()
    return {"id": account_id, "platform": platform, "nickname": nickname, "message": "绑定成功"}


@app.get("/api/accounts/list")
async def accounts_list(request: Request):
    """列出当前用户已绑定的账号"""
    user = require_user(request)
    _init_accounts_db()
    conn = sqlite3.connect(_ACCOUNTS_DB)
    try:
        rows = conn.execute(
            "SELECT id, platform, nickname, login_status, created_at FROM accounts "
            "WHERE user_id = ? ORDER BY created_at DESC",
            (user.id,),
        ).fetchall()
    finally:
        conn.close()
    return [
        {"id": r[0], "platform": r[1], "nickname": r[2], "login_status": r[3], "created_at": r[4]}
        for r in rows
    ]


@app.delete("/api/accounts/bind")
async def account_unbind(request: Request, id: str = ""):
    """解绑平台账号（仅允许删除当前用户名下的记录）"""
    user = require_user(request)
    target_id = (id or "").strip()
    if not target_id:
        raise HTTPException(status_code=400, detail="缺少账号 id")
    _init_accounts_db()
    conn = sqlite3.connect(_ACCOUNTS_DB)
    try:
        cur = conn.execute(
            "DELETE FROM accounts WHERE id = ? AND user_id = ?",
            (target_id, user.id),
        )
        affected = cur.rowcount
        conn.commit()
    finally:
        conn.close()
    if affected <= 0:
        raise HTTPException(
            status_code=404,
            detail={"code": "ACCOUNT_NOT_FOUND", "message": "账号不存在或不属于当前用户"},
        )
    return {"message": "已解绑", "id": target_id}


# ════════════════════════════════════════════════════════════════════════
#  文案提取 API — 从视频链接提取口播文案
# ════════════════════════════════════════════════════════════════════════


# 文案提取任务归属映射（main.py 进程内）。重启即失，与 _extract_tasks 一致。
_extract_task_owners: dict[str, int] = {}

# 允许文案提取的来源域名白名单（含主域 + 短链域）。
# 拒绝任意域名可有效防 SSRF，并避免给攻击者提供 yt-dlp 的内网探测面。
_COPYWRITING_HOSTS: frozenset[str] = frozenset({
    "www.douyin.com", "douyin.com", "v.douyin.com", "iesdouyin.com",
    "www.kuaishou.com", "kuaishou.com", "v.kuaishou.com",
    "www.bilibili.com", "bilibili.com", "b23.tv", "m.bilibili.com",
    "channels.weixin.qq.com",
    "www.xiaohongshu.com", "xiaohongshu.com", "xhslink.com",
    "www.youtube.com", "youtube.com", "youtu.be",
})


# 从分享口令 / 混杂文案中抠出 http(s) 链接（抖音等平台复制的整段分享文本）
_SHARE_URL_RE = re.compile(r"https?://[^\s<>\"'`（）()【】\[\]《》\u3000]+", re.IGNORECASE)
# 链接末尾常粘上中英文标点或平台提示语残留
_SHARE_URL_TRAIL_RE = re.compile(r"[，。！？、；：,.!?;:]+$")


def _pick_url_from_share_text(raw: str) -> str | None:
    """从分享口令中提取第一条白名单平台视频链接；纯链接原样返回。"""
    text = (raw or "").strip()
    if not text:
        return None

    from urllib.parse import urlparse

    candidates: list[str] = []
    for match in _SHARE_URL_RE.finditer(text):
        candidate = match.group(0)
        candidate = _SHARE_URL_TRAIL_RE.sub("", candidate)
        while candidate and candidate[-1] in "，。！？、；：,.!?;:）)」』】\"'":
            candidate = candidate[:-1]
        if not candidate:
            continue
        try:
            host = (urlparse(candidate).hostname or "").lower()
        except Exception:
            continue
        if host in _COPYWRITING_HOSTS:
            candidates.append(candidate)

    if candidates:
        return candidates[0]

    # 整段本身就是纯链接时走原逻辑
    if text.startswith("http://") or text.startswith("https://"):
        return text.split()[0]

    return None


def _validate_extract_url(url: str) -> str:
    """对用户传入的视频链接做协议 + 主机白名单 + 内网拦截校验。

    支持抖音等平台「分享口令」整段粘贴：自动从文案中抠出视频链接。
    """
    from urllib.parse import urlparse
    import ipaddress

    cleaned = _pick_url_from_share_text(url or "")
    if not cleaned:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "NO_VIDEO_URL",
                "message": "未识别到视频链接，请粘贴分享口令或单条视频链接",
            },
        )
    parsed = urlparse(cleaned)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(
            status_code=400,
            detail={"code": "BAD_URL_SCHEME", "message": "仅支持 http(s) 链接"},
        )
    host = (parsed.hostname or "").lower()
    if not host:
        raise HTTPException(
            status_code=400,
            detail={"code": "BAD_URL_HOST", "message": "无法解析视频域名"},
        )
    # 拒绝直接以 IP 访问，进一步防 SSRF / 内网探测
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved:
            raise HTTPException(
                status_code=400,
                detail={"code": "URL_PRIVATE_IP", "message": "禁止访问内网地址"},
            )
        # 允许 IP 形式但要求是已知 CDN —— 默认全部拒绝
        raise HTTPException(
            status_code=400,
            detail={"code": "URL_BARE_IP", "message": "请使用平台域名链接"},
        )
    except ValueError:
        pass
    if host not in _COPYWRITING_HOSTS:
        raise HTTPException(
            status_code=400,
            detail={
                "code": "URL_HOST_NOT_ALLOWED",
                "message": "仅支持抖音 / 快手 / B 站 / 视频号 / 小红书 / YouTube 链接",
                "host": host,
            },
        )
    # 搜索页 / 列表页不是单条视频，智凌与 yt-dlp 都无法提取口播文案
    path = (parsed.path or "").lower()
    if any(seg in path for seg in ("/search", "/discover", "/channel/", "/user/")):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "URL_NOT_VIDEO",
                "message": "请粘贴单条视频链接（打开视频后复制分享链接），不要用搜索页或主页链接",
            },
        )
    return cleaned


@app.post("/api/copywriting/extract", response_model=CopyExtractResponse)
async def copywriting_extract(req: CopyExtractRequest, request: Request):
    """
    提交文案提取任务

    流程：校验来源域名 → 创建任务 → 异步执行（字幕优先 → ASR） → 轮询状态
    """
    user = require_user(request)
    safe_url = _validate_extract_url(req.url or "")

    ref_id = f"copy-extract:{_uuid.uuid4().hex}"
    try:
        consume_with_idempotency(
            user_id=user.id,
            scene="copy_extract",
            ref_id=ref_id,
            note="文案提取",
        )
    except Exception as e:
        from lib.credit import CreditError
        if isinstance(e, CreditError):
            raise HTTPException(status_code=e.status_code, detail=e.detail) from e
        raise

    try:
        task = create_extract_task(safe_url)
        _extract_task_owners[task.task_id] = user.id
        import asyncio
        asyncio.create_task(run_extraction(task.task_id, safe_url))

        return CopyExtractResponse(task_id=task.task_id, status="queued")
    except HTTPException:
        raise
    except Exception:
        logger.exception("create copywriting extract task failed")
        raise HTTPException(
            status_code=500,
            detail={"code": "CREATE_TASK_FAILED", "message": "创建提取任务失败，请稍后重试"},
        )


@app.get("/api/copywriting/extract/status", response_model=CopyExtractStatusResponse)
async def copywriting_extract_status(task_id: str, request: Request):
    """查询文案提取任务状态（仅本人）"""
    user = require_user(request)
    tid = (task_id or "").strip()
    if not tid:
        raise HTTPException(status_code=400, detail="缺少 task_id 参数")

    owner = _extract_task_owners.get(tid)
    if owner is None or int(owner) != int(user.id):
        # 不区分"不存在"与"不属于你"，避免枚举
        raise HTTPException(
            status_code=404,
            detail={"code": "TASK_NOT_FOUND", "message": "未找到该提取任务"},
        )

    stored = get_extract_task(tid)
    if not stored:
        raise HTTPException(status_code=404, detail="未找到该提取任务，可能已过期或 task_id 不正确")

    return CopyExtractStatusResponse(
        task_id=stored.task_id,
        status=stored.status,
        step=stored.step,
        progress=stored.progress,
        text=stored.text,
        title=stored.title,
        duration=stored.duration,
        source=stored.source,
        error=stored.error,
    )


# ════════════════════════════════════════════════════════════════════════
#  自动字幕生成 API — ASR 识别 → 生成 SRT/ASS 字幕
# ════════════════════════════════════════════════════════════════════════

# 自动字幕任务内存存储
_auto_subtitle_tasks: dict[str, dict] = {}


def _new_auto_subtitle_task_id() -> str:
    import uuid as _uuid
    return f"asr_{int(time.time() * 1000)}_{_uuid.uuid4().hex[:6]}"


async def _run_auto_subtitle(task_id: str, req: AutoSubtitleRequest) -> None:
    """后台执行自动字幕生成"""
    task = _auto_subtitle_tasks.get(task_id)
    if not task:
        return

    try:
        task["status"] = "processing"
        task["progress"] = 10

        # 1) 获取音频
        with tempfile.TemporaryDirectory(prefix="auto_subtitle_") as tmpdir:
            if req.source == "url" and req.video_url.strip():
                from lib.video_extract import download_audio_sync
                wav_path, info = download_audio_sync(req.video_url.strip(), tmpdir)
                task["progress"] = 40
            elif req.source == "local" and req.video_path.strip():
                video_path = req.video_path.strip()
                if not os.path.isfile(video_path):
                    raise RuntimeError(f"视频文件不存在: {video_path}")
                wav_path = extract_audio_from_local_video(video_path, tmpdir)
                task["progress"] = 40
            else:
                raise RuntimeError("请提供视频链接或本地文件路径")

            logger.info(f"[auto_subtitle:{task_id}] 音频已提取: {wav_path}")

            # 2) FlashRecognizer 极速版识别（同步返回，包含句子级时间轴）
            task["progress"] = 50
            result = await transcribe_audio_with_timestamps(
                wav_path,
                sentence_max_length=22,  # 每行最多 22 字
            )

            if not result.sentences:
                raise RuntimeError(
                    "ASR 未返回句子级时间戳，无法生成字幕。"
                    "请确认 NLS 项目已启用「识音石V1」模型且已开通商用版"
                )

            task["progress"] = 75
            task["sentence_count"] = len(result.sentences)

            # 3) 校对工序：有原文案则对齐；否则纯 ASR
            script_text = (req.script or "").strip()
            subtitle_path = try_build_aligned_subtitle(
                script_text,
                result.sentences,
                tmpdir,
                filename_prefix=f"aligned_{task_id}",
                format=req.subtitle_format,
            )
            if subtitle_path:
                cues = split_script_cues(script_text)
                preview_text = "".join(cues)
                task["sentence_count"] = len(cues)
                align_mode = "aligned"
            else:
                subtitle_path = timed_sentences_to_subtitle(
                    sentences=result.sentences,
                    output_dir=tmpdir,
                    filename_prefix=f"asr_{task_id}",
                    format=req.subtitle_format,
                )
                preview_text = result.text
                align_mode = "asr"

            # 4) 将字幕文件复制到持久化目录
            import shutil
            dest_dir = os.path.join(POST_PROCESS_ROOT, "subtitles")
            os.makedirs(dest_dir, exist_ok=True)
            dest_path = os.path.join(dest_dir, os.path.basename(subtitle_path))
            shutil.copy2(subtitle_path, dest_path)

            task["status"] = "completed"
            task["progress"] = 100
            # 仅在内部存绝对路径供 ffmpeg 使用，对外只暴露相对 URL
            task["subtitle_path"] = dest_path
            task["subtitle_url"] = _to_subtitle_public_url(dest_path)
            task["subtitle_text"] = preview_text

            logger.info(
                f"[auto_subtitle:{task_id}] 字幕生成完成 ({align_mode}): {dest_path} "
                f"(FlashRecognizer: {len(result.sentences)} 句, "
                f"耗时 {result.latency_ms}ms, "
                f"文本 {len(preview_text)} 字)"
            )

    except Exception as e:
        task["status"] = "failed"
        task["error"] = str(e)
        logger.error(f"[auto_subtitle:{task_id}] 失败: {e}")


@app.post("/api/video/auto-subtitle", response_model=AutoSubtitleResponse)
async def video_auto_subtitle(req: AutoSubtitleRequest, request: Request):
    """
    自动字幕生成：从视频提取音频 → ASR 识别（词级时间戳） → 生成 SRT/ASS 字幕

    支持两种输入模式：
      - source=local: 提供本地视频文件路径（video_path）—— 必须落在 POST_PROCESS_ROOT 内
      - source=url:   提供在线视频链接（video_url）
    """
    user = require_user(request)
    if req.source == "local" and not req.video_path.strip():
        raise HTTPException(status_code=400, detail="请提供本地视频文件路径")
    if req.source == "url" and not req.video_url.strip():
        raise HTTPException(status_code=400, detail="请提供视频链接")
    if req.subtitle_format not in ("ass", "srt"):
        raise HTTPException(status_code=400, detail="字幕格式仅支持 ass 或 srt")

    if req.source == "local":
        # 强校验：必须落在 POST_PROCESS_ROOT / MANUAL_UPLOAD_ROOT / GENERATED_VIDEO_CACHE_ROOT 内
        _ensure_path_in_trusted_root(req.video_path, field="video_path")

    task_id = _new_auto_subtitle_task_id()
    _auto_subtitle_tasks[task_id] = {
        "task_id": task_id,
        "user_id": user.id,
        "status": "queued",
        "progress": 0,
        "subtitle_path": "",
        "subtitle_url": "",
        "subtitle_text": "",
        "sentence_count": 0,
        "error": "",
    }

    import asyncio
    asyncio.create_task(_run_auto_subtitle(task_id, req))

    return AutoSubtitleResponse(task_id=task_id, status="queued")


@app.get("/api/video/auto-subtitle/status", response_model=AutoSubtitleResponse)
async def video_auto_subtitle_status(task_id: str, request: Request):
    """查询自动字幕生成任务状态"""
    user = require_user(request)
    tid = (task_id or "").strip()
    if not tid:
        raise HTTPException(status_code=400, detail="缺少 task_id 参数")

    task = _auto_subtitle_tasks.get(tid)
    if not task:
        raise HTTPException(status_code=404, detail="未找到该字幕任务")
    assert_task_owner(task, user, task_id=tid)

    # 对外只返回 URL 化的字幕地址；绝对磁盘路径仅供本进程内 ffmpeg 调用使用，
    # 直接暴露会泄露 POST_PROCESS_ROOT 实际部署位置（例如 /data/...）。
    return AutoSubtitleResponse(
        task_id=task["task_id"],
        status=task["status"],
        subtitle_path=task.get("subtitle_url", "") or task.get("subtitle_path", ""),
        subtitle_text=task.get("subtitle_text", ""),
        sentence_count=task.get("sentence_count", 0),
        error=task.get("error", ""),
    )


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


# ════════════════════════════════════════════════════════════════════════
#  中央激活服务（Electron 桌面打包）
#  详见 docs/superpowers/specs/2026-06-24-central-activation-design.md
# ════════════════════════════════════════════════════════════════════════

import json as _json
import secrets
import string as _string
import sqlite3 as _sqlite3

_CODE_ALPHABET = _string.ascii_uppercase + _string.digits


def _gen_activation_code() -> str:
    """生成 ZT-XXXX-XXXX-XXXX 格式激活码"""
    raw = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(12))
    return f"ZT-{raw[0:4]}-{raw[4:8]}-{raw[8:12]}"


def _init_central_db():
    """初始化中央激活服务 DB 表（幂等）"""
    os.makedirs(os.path.dirname(_ACCOUNTS_DB), exist_ok=True)
    conn = _sqlite3.connect(_ACCOUNTS_DB)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS central_activation_codes (
            code       TEXT PRIMARY KEY,
            plan       TEXT NOT NULL DEFAULT 'standard',
            machine_limit INTEGER NOT NULL DEFAULT 1,
            expires_at REAL NOT NULL,
            status     TEXT NOT NULL DEFAULT 'active',
            note       TEXT DEFAULT '',
            created_at REAL NOT NULL,
            created_by TEXT DEFAULT 'admin'
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS central_activations (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            code           TEXT NOT NULL,
            machine_id     TEXT NOT NULL,
            client_version TEXT,
            first_seen_at  REAL NOT NULL,
            last_seen_at   REAL NOT NULL,
            UNIQUE(code, machine_id)
        )
    """)
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_central_activations_machine "
        "ON central_activations(machine_id)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_central_activations_code "
        "ON central_activations(code)"
    )
    conn.commit()
    conn.close()


def _load_key_pool() -> dict:
    """从环境变量 CENTRAL_KEY_POOL_JSON 读取密钥池"""
    raw = (os.getenv("CENTRAL_KEY_POOL_JSON") or "").strip()
    if not raw:
        return {}
    try:
        return _json.loads(raw)
    except _json.JSONDecodeError:
        return {}


# 模块加载时初始化 DB
try:
    _init_central_db()
except Exception:
    pass


# ── 请求/响应模型 ──────────────────────────────────────────────────────


class ActivateRequest(BaseModel):
    machine_id: str
    code: str
    client_version: str = "0.1.0"


class ActivateResponse(BaseModel):
    ok: bool = True
    plan: str = "standard"
    expires_at: float = 0.0
    keys: dict = {}
    server_time: float = 0.0
    signature: str = ""
    key_id: str = "v1"


class HeartbeatRequest(BaseModel):
    machine_id: str
    code: str
    client_version: str = "0.1.0"
    ts: float = 0.0


class HeartbeatResponse(BaseModel):
    ok: bool = True
    server_time: float = 0.0
    revoked: bool = False


class ManifestResponse(BaseModel):
    latest_version: str = "0.1.0"
    min_supported_version: str = "0.0.1"
    update_url: str = ""
    force_update: bool = False
    release_notes: str = ""


class CreateCodesRequest(BaseModel):
    plan: str = "standard"
    machine_limit: int = 1
    expires_in_days: int = 365
    count: int = 1
    note: str = ""


# ── 路由 ────────────────────────────────────────────────────────────────


@app.post("/api/central/activate")
def central_activate(req: ActivateRequest, request: Request):
    """激活码校验 + 密钥下发"""
    ip = request.client.host if request.client else ""
    ok, msg = check_scoped("central_activate", ip, CENTRAL_ACTIVATE_IP_LIMITS)
    if not ok:
        raise HTTPException(status_code=429, detail={"code": "RATE_LIMITED", "message": msg})

    now = time.time()
    conn = _sqlite3.connect(_ACCOUNTS_DB)
    try:
        row = conn.execute(
            "SELECT plan, machine_limit, expires_at, status "
            "FROM central_activation_codes WHERE code=?",
            (req.code,),
        ).fetchone()

        if not row:
            raise HTTPException(400, {"code": "CODE_NOT_FOUND", "message": "激活码无效"})

        plan, machine_limit, expires_at, status = row

        if status == "disabled":
            raise HTTPException(403, {"code": "CODE_DISABLED", "message": "激活码已停用"})
        if time.time() > expires_at:
            raise HTTPException(400, {"code": "CODE_EXPIRED", "message": "激活码已过期"})

        # 检查机器数
        used = conn.execute(
            "SELECT COUNT(DISTINCT machine_id) FROM central_activations WHERE code=?",
            (req.code,),
        ).fetchone()[0]
        already = conn.execute(
            "SELECT 1 FROM central_activations WHERE code=? AND machine_id=?",
            (req.code, req.machine_id),
        ).fetchone()

        if used >= machine_limit and not already:
            raise HTTPException(403, {"code": "MACHINE_LIMIT_REACHED", "message": "已达激活机器数上限"})

        # upsert 激活记录
        if already:
            conn.execute(
                "UPDATE central_activations SET last_seen_at=?, client_version=? WHERE code=? AND machine_id=?",
                (now, req.client_version, req.code, req.machine_id),
            )
        else:
            conn.execute(
                "INSERT INTO central_activations (code, machine_id, client_version, first_seen_at, last_seen_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (req.code, req.machine_id, req.client_version, now, now),
            )
        conn.commit()

        # 密钥下发
        pool = _load_key_pool()
        keys = pool.get(plan, pool.get("standard", {}))
        keys = {str(k): str(v) for k, v in (keys or {}).items()}

        signature, key_id = sign_activate_response(
            plan=plan,
            expires_at=float(expires_at),
            keys=keys,
            server_time=now,
        )
        rate_record("central_activate", ip)

        return ActivateResponse(
            plan=plan,
            expires_at=expires_at,
            keys=keys,
            server_time=now,
            signature=signature,
            key_id=key_id,
        )
    finally:
        conn.close()


@app.get("/api/central/public-key")
def central_public_key():
    """导出 Ed25519 公钥 PEM（供桌面客户端验签配置）"""
    pem = get_public_key_pem()
    if not pem:
        raise HTTPException(status_code=503, detail="未配置 CENTRAL_SIGNING_PRIVATE_KEY")
    return {"key_id": (os.getenv("CENTRAL_SIGNING_KEY_ID") or "v1").strip() or "v1", "public_key_pem": pem}


@app.get("/api/central/manifest")
def central_manifest(client_version: str = "0.0.0"):
    """版本检查"""
    latest = (os.getenv("CENTRAL_LATEST_VERSION") or "0.1.0").strip()
    min_ver = (os.getenv("CENTRAL_FORCE_UPDATE_BELOW") or "0.0.1").strip()
    update_url = (os.getenv("CENTRAL_UPDATE_URL") or "").strip()

    def _ver_tuple(v: str) -> tuple:
        try:
            return tuple(int(x) for x in v.split("."))
        except Exception:
            return (0,)

    force = _ver_tuple(client_version) < _ver_tuple(min_ver)

    return ManifestResponse(
        latest_version=latest,
        min_supported_version=min_ver,
        update_url=update_url,
        force_update=force,
    )


@app.post("/api/central/heartbeat")
def central_heartbeat(req: HeartbeatRequest):
    """心跳 + 注销检测"""
    now = time.time()
    conn = _sqlite3.connect(_ACCOUNTS_DB)
    try:
        # 检查该激活码是否被禁用
        status_row = conn.execute(
            "SELECT status FROM central_activation_codes WHERE code=?", (req.code,)
        ).fetchone()
        revoked = not status_row or status_row[0] == "disabled"

        # 更新 last_seen_at
        if not revoked:
            conn.execute(
                "UPDATE central_activations SET last_seen_at=?, client_version=? WHERE code=? AND machine_id=?",
                (now, req.client_version, req.code, req.machine_id),
            )
            conn.commit()

        return HeartbeatResponse(server_time=now, revoked=revoked)
    finally:
        conn.close()


@app.get("/api/central/admin/codes")
def central_admin_list_codes(request: Request):
    """管理后台 - 列激活码"""
    _require_admin_key(request)
    conn = _sqlite3.connect(_ACCOUNTS_DB)
    try:
        rows = conn.execute("""
            SELECT c.code, c.plan, c.machine_limit, c.expires_at, c.status,
                   COUNT(a.id) AS used_count, c.created_at, c.note
            FROM central_activation_codes c
            LEFT JOIN central_activations a ON a.code = c.code
            GROUP BY c.code
            ORDER BY c.created_at DESC
        """).fetchall()
        return [
            {
                "code": r[0],
                "plan": r[1],
                "machine_limit": r[2],
                "expires_at": r[3],
                "status": r[4],
                "used_count": r[5],
                "created_at": r[6],
                "note": r[7] or "",
            }
            for r in rows
        ]
    finally:
        conn.close()


@app.post("/api/central/admin/codes")
def central_admin_create_codes(req: CreateCodesRequest, request: Request):
    """管理后台 - 创建激活码"""
    _require_admin_key(request)
    now = time.time()
    expires = now + req.expires_in_days * 86400

    conn = _sqlite3.connect(_ACCOUNTS_DB)
    try:
        created = []
        for _ in range(req.count):
            code = _gen_activation_code()
            conn.execute(
                "INSERT INTO central_activation_codes (code, plan, machine_limit, expires_at, status, note, created_at, created_by) "
                "VALUES (?, ?, ?, ?, 'active', ?, ?, 'admin')",
                (code, req.plan, req.machine_limit, expires, req.note, now),
            )
            created.append(code)
        conn.commit()
        return {"created": created}
    finally:
        conn.close()


# ── Promo video（宣传视频）────────────────────────────────────────

from lib.promo_video_service import (
    calculate_promo_video_cost,
    concatenate_videos_ffmpeg,
    crop_storyboard_grid,
    download_crop_results,
    download_file,
    generate_video_prompt,
    get_grid_dims,
    pick_all_urls,
    pick_first_valid_url,
    plan_promo_video_segments,
    query_runninghub_task,
    render_promo_segment_via_aicost,
    resolve_frame_paths,
    resolve_promo_audios_base64,
    submit_grid_crop_to_rh,
    submit_storyboard_to_rh,
    upload_to_runninghub,
    wait_for_runninghub_task,
)

_promo_video_task_store: dict = {}
_PROMO_FRAME_COUNT_RH = {9: "1", 16: "2", 25: "3"}


class PromoStoryboardRequest(BaseModel):
    product_prompt: str = ""
    promo_script: str = ""
    audio_base64: str = ""
    product_name: str = ""
    product_image: str = ""
    selling_points: list[str] = []
    target_audience: str = ""
    style: str = "科技感"
    duration: int = 15
    frame_count: int = 9
    ratio: str = "adaptive"
    channel: str = "Third-party"
    resolution: str = "2k"
    image_mode: str = "2"
    instance_type: str = "default"


class PromoStoryboardStatusResponse(BaseModel):
    task_id: str
    status: str = ""
    frame_urls: list[str] = []
    storyboard_grid_url: str = ""
    creative_prompt: str = ""
    progress: int = 0
    error: str = ""
    stage: str = ""
    stage_label: str = ""
    rh_task_id: str = ""
    rh_crop_task_id: str = ""
    frame_count: int = 0
    failed_stage: str = ""


def _set_promo_stage(task_id: str, stage: str, **extras) -> None:
    _set_generic_stage(_promo_video_task_store, PV_STAGE_LABELS, task_id, stage, **extras)


def _promo_patch_task(task_id: str, **fields) -> None:
    stored = _promo_video_task_store.get(task_id) or {}
    _promo_video_task_store[task_id] = {**stored, **fields}


def _promo_fail(task_id: str, error: str, failed_stage: str | None = None) -> None:
    task = _promo_video_task_store.get(task_id)
    if not task:
        return
    stage = failed_stage or task.get("stage") or STAGE_PV_FAILED
    msg = (error or "").strip()
    if not msg:
        msg = f"分镜失败（阶段: {task.get('stage_label') or PV_STAGE_LABELS.get(stage, stage)}）"
    _set_promo_stage(
        task_id,
        STAGE_PV_FAILED,
        status="storyboard_failed",
        error=msg,
        failed_stage=stage,
        progress=0,
    )


class PromoAutoPromptRequest(BaseModel):
    storyboard_task_id: str
    selected_count: int = 1


class PromoVideoGenerateRequest(BaseModel):
    storyboard_task_id: str
    selected_indices: list[int] = []
    video_prompt: str = ""
    duration: int = 0
    promo_script: str = ""
    video_resolution: str = "720p"
    real_person_mode: bool = True
    instance_type: str = "default"
    ratio: str = ""


class PromoVideoStatusResponse(BaseModel):
    task_id: str
    status: str = ""
    video_url: str = ""
    progress: int = 0
    error: str = ""
    rh_video_task_ids: list[str] = []
    segment_count: int = 0
    segments_completed: int = 0


def _new_promo_video_task_id() -> str:
    return f"pv_{int(time.time() * 1000)}_{os.urandom(3).hex()}"


def _promo_public_url(public_base: str, abs_path: str) -> str:
    rel = os.path.relpath(abs_path, POST_PROCESS_ROOT).replace(os.sep, "/")
    return f"/static/video-postprocess/{rel}"


async def _promo_crop_frames_from_grid(
    task_id: str,
    grid_path: str,
    grid_data: bytes | None,
    frame_count: int,
    output_dir: str,
    public_base: str,
    rh_key: str,
    instance_type: str,
) -> tuple[list[str], list[str]]:
    """Crop storyboard grid into frames; RH crop by default, Pillow when PROMO_CROP_BACKEND=pillow."""
    cols, rows = get_grid_dims(frame_count)
    expected_frames = frame_count
    frames_dir = os.path.join(output_dir, "frames")
    crop_backend = (os.getenv("PROMO_CROP_BACKEND") or "rh").strip().lower()

    if crop_backend == "pillow":
        _set_promo_stage(task_id, STAGE_PV_CROP_DOWNLOAD, progress=75)
        if grid_data is None:
            with open(grid_path, "rb") as f:
                grid_data = f.read()
        frame_paths = crop_storyboard_grid(grid_data, cols, rows, frames_dir)
    else:
        try:
            failed_stage = STAGE_PV_RH_CROP_SUBMIT
            _set_promo_stage(task_id, STAGE_PV_RH_CROP_SUBMIT, progress=70)
            grid_rh_url = await upload_to_runninghub(rh_key, grid_path)
            crop_task_id = await submit_grid_crop_to_rh(
                rh_key,
                grid_rh_url,
                rows,
                cols,
                save_all=True,
                instance_type=instance_type,
                output_dir=output_dir,
            )
            _set_promo_stage(
                task_id,
                STAGE_PV_RH_CROP_SUBMIT,
                rh_crop_task_id=crop_task_id,
                progress=72,
            )

            failed_stage = STAGE_PV_RH_CROP_POLL
            _set_promo_stage(
                task_id,
                STAGE_PV_RH_CROP_POLL,
                rh_crop_task_id=crop_task_id,
                progress=75,
            )

            def _on_crop_poll(result: dict, elapsed: float, rh_status: str = "") -> None:
                _promo_patch_task(
                    task_id,
                    rh_crop_status=rh_status or (result.get("status") or ""),
                    progress=min(90, 75 + int(min(elapsed / 120.0, 1.0) * 15)),
                )
                try:
                    with open(
                        os.path.join(output_dir, "rh_crop_poll_last.json"),
                        "w",
                        encoding="utf-8",
                    ) as f:
                        json.dump(result, f, ensure_ascii=False, indent=2)
                except Exception:
                    pass

            crop_result = await wait_for_runninghub_task(
                rh_key,
                crop_task_id,
                max_wait=600,
                on_poll=_on_crop_poll,
                min_urls=expected_frames,
                task_label="裁切",
            )

            failed_stage = STAGE_PV_CROP_DOWNLOAD
            _set_promo_stage(
                task_id,
                STAGE_PV_CROP_DOWNLOAD,
                rh_crop_task_id=crop_task_id,
                progress=92,
            )
            frame_paths = await download_crop_results(
                rh_key,
                crop_result,
                output_dir,
                expected_frames,
            )
        except Exception as rh_crop_err:
            logger.warning(
                "promo %s RH grid crop failed (%s), falling back to Pillow",
                task_id,
                rh_crop_err,
            )
            failed_stage = STAGE_PV_CROP_DOWNLOAD
            _set_promo_stage(task_id, STAGE_PV_CROP_DOWNLOAD, progress=75)
            if grid_data is None:
                with open(grid_path, "rb") as f:
                    grid_data = f.read()
            frame_paths = crop_storyboard_grid(grid_data, cols, rows, frames_dir)

    if len(frame_paths) != expected_frames:
        raise RuntimeError(
            f"裁切得到 {len(frame_paths)} 张，期望 {expected_frames} 张"
        )
    frame_urls = [_promo_public_url(public_base, fp) for fp in frame_paths]
    if len(frame_urls) != expected_frames:
        raise RuntimeError(
            f"发布 URL 数量 {len(frame_urls)} 不等于期望 {expected_frames}"
        )
    return frame_paths, frame_urls


async def _run_promo_storyboard(task_id: str, req: PromoStoryboardRequest) -> None:
    task = _promo_video_task_store.get(task_id)
    if not task:
        return
    public_base = task.get("public_base_url") or ""
    output_dir = os.path.join(POST_PROCESS_ROOT, task_id)
    os.makedirs(output_dir, exist_ok=True)
    failed_stage = STAGE_PV_DECODE
    try:
        _set_promo_stage(task_id, STAGE_PV_DECODE, status="storyboard_processing", progress=5)

        product_prompt = (req.product_prompt or "").strip()
        if not product_prompt:
            raise RuntimeError("产品提示词不能为空")
        promo_script = (req.promo_script or "").strip()
        if not promo_script and req.selling_points:
            promo_script = "\n".join(req.selling_points)
        if not promo_script:
            raise RuntimeError("宣传文案不能为空")
        task["product_prompt"] = product_prompt
        task["promo_script"] = promo_script
        task["creative_prompt"] = product_prompt
        if (req.audio_base64 or "").strip():
            task["audio_base64"] = req.audio_base64.strip()
        task["progress"] = 10

        rh_key = (os.getenv("RUNNINGHUB_API_KEY") or "").strip()
        if not rh_key:
            raise RuntimeError("未配置 RUNNINGHUB_API_KEY")

        image_mode = (req.image_mode or "2").strip()
        product_url = None
        if image_mode == "2":
            if not (req.product_image or "").strip():
                raise RuntimeError("图生图模式需要上传产品图片")
            product_path = os.path.join(output_dir, "product.png")
            await _decode_b64_file(req.product_image, product_path)
            failed_stage = STAGE_PV_UPLOAD_PRODUCT
            _set_promo_stage(task_id, STAGE_PV_UPLOAD_PRODUCT, progress=15)
            product_url = await upload_to_runninghub(rh_key, product_path)
            task["progress"] = 20

        failed_stage = STAGE_PV_RH_SUBMIT
        _set_promo_stage(task_id, STAGE_PV_RH_SUBMIT, progress=25)
        fc_val = _PROMO_FRAME_COUNT_RH.get(req.frame_count, "1")
        rh_task = await submit_storyboard_to_rh(
            rh_key,
            product_prompt,
            fc_val,
            resolution=(req.resolution or "2k").strip(),
            channel=(req.channel or "Third-party").strip(),
            image_mode=image_mode,
            product_image_url=product_url,
            instance_type=(req.instance_type or "default").strip(),
            output_dir=output_dir,
        )
        _set_promo_stage(task_id, STAGE_PV_RH_SUBMIT, rh_task_id=rh_task, progress=30)

        if not rh_task:
            raise RuntimeError("RH 提交未返回 taskId，无法轮询")

        failed_stage = STAGE_PV_RH_POLL
        _set_promo_stage(task_id, STAGE_PV_RH_POLL, rh_task_id=rh_task, progress=30)

        def _on_rh_poll(result: dict, elapsed: float, rh_status: str = "") -> None:
            task["rh_status"] = rh_status or (result.get("status") or "")
            try:
                with open(os.path.join(output_dir, "rh_poll_last.json"), "w", encoding="utf-8") as f:
                    json.dump(result, f, ensure_ascii=False, indent=2)
            except Exception:
                pass
            task["progress"] = min(55, 30 + int(min(elapsed / 180.0, 1.0) * 25))

        result = await wait_for_runninghub_task(
            rh_key, rh_task, max_wait=600, on_poll=_on_rh_poll
        )
        grid_url = pick_first_valid_url(result.get("results"))
        if not grid_url:
            raise RuntimeError("分镜工作流无有效输出 URL")
        task["storyboard_grid_url"] = grid_url
        task["progress"] = 60

        failed_stage = STAGE_PV_DOWNLOAD
        _set_promo_stage(task_id, STAGE_PV_DOWNLOAD, progress=60)
        grid_path = await download_file(
            grid_url,
            output_dir,
            "storyboard_grid",
            validate_as_image=True,
            api_key=rh_key,
        )
        with open(grid_path, "rb") as f:
            grid_data = f.read()

        frame_paths, frame_urls = await _promo_crop_frames_from_grid(
            task_id,
            grid_path,
            grid_data,
            req.frame_count,
            output_dir,
            public_base,
            rh_key,
            (req.instance_type or "default").strip(),
        )

        if len(frame_urls) != req.frame_count:
            raise RuntimeError(
                f"分镜帧数量 {len(frame_urls)} 不等于期望 {req.frame_count}"
            )
        _set_promo_stage(
            task_id,
            STAGE_PV_COMPLETED,
            status="storyboard_ready",
            progress=100,
            frame_paths=frame_paths,
            frame_urls=frame_urls,
            frame_count=req.frame_count,
            error="",
            failed_stage="",
        )
    except HTTPException as e:
        detail = e.detail
        err = detail if isinstance(detail, str) else str(detail)
        t = _promo_video_task_store.get(task_id) or {}
        _promo_fail(task_id, err, t.get("stage") or failed_stage)
    except Exception as e:
        t = _promo_video_task_store.get(task_id) or {}
        err = (str(e) or "").strip() or type(e).__name__
        _promo_fail(task_id, err or "分镜生成失败", t.get("stage") or failed_stage)


async def _run_promo_retry_crop(task_id: str) -> None:
    """Re-download and crop storyboard grid without re-submitting to RH."""
    task = _promo_video_task_store.get(task_id)
    if not task:
        return
    output_dir = os.path.join(POST_PROCESS_ROOT, task_id)
    frame_count = int(task.get("frame_count") or 9)
    expected_frames = frame_count
    failed_stage = STAGE_PV_DOWNLOAD
    rh_key = (os.getenv("RUNNINGHUB_API_KEY") or "").strip()
    try:
        _set_promo_stage(task_id, STAGE_PV_DOWNLOAD, status="storyboard_processing", progress=60)

        grid_path: str | None = None
        for name in os.listdir(output_dir) if os.path.isdir(output_dir) else []:
            if name.startswith("storyboard_grid."):
                candidate = os.path.join(output_dir, name)
                if os.path.isfile(candidate) and os.path.getsize(candidate) > 0:
                    grid_path = candidate
                    break

        grid_url = (task.get("storyboard_grid_url") or "").strip()
        if not grid_path:
            if not grid_url:
                raise RuntimeError("无本地九宫格图且无 grid URL，无法重试裁切")
            grid_path = await download_file(
                grid_url,
                output_dir,
                "storyboard_grid",
                validate_as_image=True,
                api_key=rh_key or None,
            )

        with open(grid_path, "rb") as f:
            grid_data = f.read()

        if not rh_key:
            raise RuntimeError("未配置 RUNNINGHUB_API_KEY")

        public_base = task.get("public_base_url") or ""
        instance_type = (task.get("instance_type") or "default").strip()

        existing_crop_id = (task.get("rh_crop_task_id") or "").strip()
        frame_paths: list[str] = []
        frame_urls: list[str] = []
        reused_crop = False
        if existing_crop_id:
            crop_result = await query_runninghub_task(rh_key, existing_crop_id)
            rh_status = (crop_result.get("status") or "").strip()
            if rh_status == "SUCCESS":
                urls = pick_all_urls(crop_result.get("results"))
                if len(urls) >= expected_frames:
                    failed_stage = STAGE_PV_CROP_DOWNLOAD
                    _set_promo_stage(
                        task_id,
                        STAGE_PV_CROP_DOWNLOAD,
                        rh_crop_task_id=existing_crop_id,
                        progress=92,
                    )
                    frame_paths = await download_crop_results(
                        rh_key,
                        crop_result,
                        output_dir,
                        expected_frames,
                    )
                    frame_urls = [_promo_public_url(public_base, fp) for fp in frame_paths]
                    reused_crop = True

        if not reused_crop:
            frame_paths, frame_urls = await _promo_crop_frames_from_grid(
                task_id,
                grid_path,
                grid_data,
                frame_count,
                output_dir,
                public_base,
                rh_key,
                instance_type,
            )

        if len(frame_urls) != expected_frames:
            raise RuntimeError(
                f"分镜帧数量 {len(frame_urls)} 不等于期望 {expected_frames}"
            )
        _set_promo_stage(
            task_id,
            STAGE_PV_COMPLETED,
            status="storyboard_ready",
            progress=100,
            frame_paths=frame_paths,
            frame_urls=frame_urls,
            frame_count=frame_count,
            error="",
            failed_stage="",
        )
    except Exception as e:
        t = _promo_video_task_store.get(task_id) or {}
        _promo_fail(task_id, str(e) or "裁切重试失败", t.get("stage") or failed_stage)


async def _run_promo_video(task_id: str, gen_req: PromoVideoGenerateRequest) -> None:
    task = _promo_video_task_store.get(task_id)
    if not task:
        return
    story = _promo_video_task_store.get(gen_req.storyboard_task_id)
    if not story:
        _promo_patch_task(task_id, status="video_failed", error="分镜任务不存在")
        return
    public_base = task.get("public_base_url") or story.get("public_base_url") or ""
    output_dir = os.path.join(POST_PROCESS_ROOT, task_id)
    os.makedirs(output_dir, exist_ok=True)
    ffmpeg_bin = os.environ.get("FFMPEG_EXE") or (
        _local_ff
        if (_local_ff := os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools", "ffmpeg", "bin", "ffmpeg.exe"))
        and os.path.isfile(_local_ff)
        else "ffmpeg"
    )
    segments_completed = 0
    segment_count = 0
    rh_ids: list[str] = []

    try:
        _promo_patch_task(task_id, status="video_processing", progress=5, error="")
        seedance_key = (os.getenv("SEEDANCE_API_KEY") or os.getenv("AICOST_API_KEY") or "").strip()
        if not seedance_key:
            raise RuntimeError("SEEDANCE_API_KEY 未配置（宣传视频成片走 aicost Seedance 2.0）")

        selected_paths = resolve_frame_paths(
            story,
            gen_req.selected_indices,
            POST_PROCESS_ROOT,
        )
        if not selected_paths:
            raise RuntimeError("未选中有效分镜（本地帧文件不存在）")

        duration = int(gen_req.duration or story.get("duration") or 15)
        ratio = (gen_req.ratio or "").strip() or story.get("ratio") or "adaptive"
        video_resolution = (gen_req.video_resolution or "720p").strip()
        if video_resolution != "720p":
            logger.warning(
                "promo video %s: aicost Seedance 仅支持 720p，已按 720p 提交（UI 选择 %s）",
                task_id,
                video_resolution,
            )
        promo_script = (story.get("promo_script") or "").strip()
        audios_base64 = resolve_promo_audios_base64(story)

        segment_plans = plan_promo_video_segments(
            selected_paths=selected_paths,
            total_duration=duration,
            video_prompt=gen_req.video_prompt.strip(),
            promo_script=promo_script,
            has_audio=bool(audios_base64),
        )
        segment_count = len(segment_plans)
        _promo_patch_task(
            task_id,
            segment_count=segment_count,
            segments_completed=0,
            rh_video_task_ids=[],
            progress=10,
        )

        completed_lock = asyncio.Lock()

        async def _render_segment(plan) -> tuple[int, str, str]:
            nonlocal segments_completed
            seg_idx = plan.segment_index
            seg_path = os.path.join(output_dir, f"segment_{seg_idx}.mp4")

            upstream_id = await render_promo_segment_via_aicost(
                plan=plan,
                aspect_ratio=ratio,
                audios_base64=audios_base64,
                dest_path=seg_path,
                client_task_id=f"{task_id}:seg{seg_idx}",
                media_refs_dir=os.path.join(output_dir, "refs"),
            )
            rh_ids.append(upstream_id)
            _promo_patch_task(
                task_id,
                rh_video_task_ids=list(rh_ids),
                progress=15 + int((seg_idx / max(segment_count, 1)) * 10),
            )

            async with completed_lock:
                segments_completed += 1
                _promo_patch_task(
                    task_id,
                    segments_completed=segments_completed,
                    rh_video_task_ids=list(rh_ids),
                    progress=15 + int((segments_completed / max(segment_count, 1)) * 70),
                )
            return seg_idx, upstream_id, seg_path

        segment_results = await asyncio.gather(
            *[_render_segment(plan) for plan in segment_plans]
        )
        segment_results.sort(key=lambda x: x[0])
        segment_paths = [r[2] for r in segment_results]
        _promo_patch_task(task_id, progress=85, rh_video_task_ids=[r[1] for r in segment_results])

        final_path = os.path.join(output_dir, "final.mp4")
        concatenate_videos_ffmpeg(segment_paths, final_path, ffmpeg_path=ffmpeg_bin)
        _promo_patch_task(
            task_id,
            video_url=_promo_public_url(public_base, final_path),
            rh_video_task_ids=[r[1] for r in segment_results],
            rh_task_ids=[r[1] for r in segment_results],
            status="video_completed",
            progress=100,
            segments_completed=segment_count,
            segment_count=segment_count,
            error="",
        )
    except Exception as e:
        err = str(e) or "视频生成失败"
        if "1007" in err or "Could not decode image" in err:
            err = "分镜图未正确上传，请重试生成视频"
        _promo_patch_task(
            task_id,
            status="video_failed",
            error=err,
            rh_video_task_ids=rh_ids,
            segment_count=segment_count,
            segments_completed=segments_completed,
            failed_segment=segments_completed + 1 if segment_count else None,
        )


from routes.promo_video_routes import router as promo_video_router
from routes.geo_matrix_routes import router as geo_matrix_router
from routes.dh_video_v2_routes import router as dh_video_v2_router

app.include_router(promo_video_router)
app.include_router(geo_matrix_router)
app.include_router(dh_video_v2_router)


# ── 全局 404 handler：API 路径返回 JSON，避免返回 HTML 错误页导致前端下载到 .htm ──
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    from starlette.exceptions import HTTPException as StarletteHTTPException

    # 路由内 raise HTTPException(404, detail=...) 须保留原始 detail，勿覆盖为 not_found
    if isinstance(exc, StarletteHTTPException) and exc.detail is not None:
        return JSONResponse(status_code=404, content={"detail": exc.detail})

    path = str(request.url.path)
    if path.startswith("/api/"):
        return JSONResponse(
            status_code=404,
            content={"detail": "not_found", "path": path, "message": "接口不存在"},
        )
    from fastapi import HTTPException as _HTTPException
    raise _HTTPException(status_code=404, detail="Not Found")

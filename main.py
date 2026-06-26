import os
import re
import base64
import tempfile
import logging
import asyncio
import time

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from lib.runninghub_client import RunningHubClient, RunningHubError, build_motion_prompt, build_cover_prompt
from lib.video_postprocess import render_video_with_template
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
    VIDEO_CREATION_COST,
    consume,
    ensure_credit_schema,
    generate_redeem_codes,
    get_account,
    list_ledger,
    list_redeem_code_batches,
    redeem_code,
)
from lib.rate_limit import check_ip, check_email, record as rate_record
from lib.api_auth import (
    require_user,
    assert_task_owner,
    check_base64_size,
)
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
app.mount("/static/video-postprocess", StaticFiles(directory=POST_PROCESS_ROOT, html=False), name="video-postprocess")


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


# —— 视频生成管线 stage 常量 ——
STAGE_UPLOADING_IMAGE = "uploading_image"
STAGE_UPLOADING_AUDIO = "uploading_audio"
STAGE_SUBMITTING_CLONE = "submitting_audio_clone"
STAGE_WAITING_CLONE = "waiting_audio_clone"
STAGE_SUBMITTING_VIDEO = "submitting_video"
STAGE_QUEUED = "queued"
STAGE_POLLING_VIDEO = "polling_video"
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
    STAGE_POST_PROCESSING: "后期剪辑处理中",
    STAGE_COVER_GENERATING: "生成封面图中",
    STAGE_COMPLETED: "全部完成",
    STAGE_FAILED: "失败",
    STAGE_CANCELLED: "已停止",
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


class MashupVideoResponse(BaseModel):
    task_id: str
    status: str
    video_url: str = ""
    audio_url: str = ""
    error: str = ""


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
_edit_task_store: dict[str, dict] = {}
_edit_tasks: dict[str, object] = {}
_manual_upload_store: dict[str, dict] = {}
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


async def _download_video_to_project_cache(video_url: str, task_id: str, timeout: float = 180.0) -> str:
    os.makedirs(GENERATED_VIDEO_CACHE_ROOT, exist_ok=True)
    safe_name = _safe_cache_name(task_id, f"video_{int(time.time())}")
    input_path = os.path.join(GENERATED_VIDEO_CACHE_ROOT, f"{safe_name}_input.mp4")
    tmp_path = f"{input_path}.download"
    async with httpx.AsyncClient(timeout=timeout, follow_redirects=True) as client:
        resp = await client.get(video_url)
        resp.raise_for_status()
        with open(tmp_path, "wb") as f:
            f.write(resp.content)
    os.replace(tmp_path, input_path)
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
    if cleaned.startswith("/static/video-postprocess/"):
        rel = cleaned[len("/static/video-postprocess/"):].replace("/", os.sep)
        candidate = os.path.abspath(os.path.join(POST_PROCESS_ROOT, rel))
        post_root = os.path.abspath(POST_PROCESS_ROOT)
        if candidate.startswith(post_root + os.sep) and os.path.exists(candidate):
            return candidate, False
    if cleaned.startswith("/"):
        return _resolve_project_public_path(cleaned), False
    if os.path.isabs(cleaned) and os.path.exists(cleaned):
        return cleaned, False
    input_path = os.path.join(output_dir, "input.mp4")
    return input_path, False


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

    流程: 解码 Base64 → 上传文件到 RunningHub → 音频克隆 → 视频生成 → 轮询返回结果
    """
    user = require_user(request)
    if not req.image_base64 or not req.audio_base64 or not req.script.strip():
        raise HTTPException(status_code=400, detail="缺少必填参数: image_base64, audio_base64, script")
    if len(req.script) > 5000:
        raise HTTPException(status_code=400, detail={"code": "SCRIPT_TOO_LONG", "message": "脚本超过 5000 字"})
    check_base64_size(req.image_base64, max_mb=10, name="image_base64")
    check_base64_size(req.audio_base64, max_mb=50, name="audio_base64")

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
        prompt_mode = _normalize_video_prompt_mode(req.video_prompt_mode)
        raw_video_prompt = req.video_prompt or ""
        motion_prompt = build_motion_prompt(req.gender, raw_video_prompt)
        final_prompt_mode = prompt_mode if raw_video_prompt.strip() else "natural"
        video_task_id = await rh.submit_video(image_url, audio_clone_url, motion_prompt)

        # 6. 存储任务状态供后续轮询
        _task_store[video_task_id] = {
            "task_id": video_task_id,
            "user_id": user.id,
            "status": "queued",
            "progress": 0,
            "video_url": "",
            "post_video_url": "",
            "post_stage": "",
            "post_progress": 0,
            "post_error": "",
            "audio_url": audio_clone_url,
            "script": req.script,
            "video_prompt": motion_prompt,
            "video_prompt_mode": final_prompt_mode,
            "image_url": image_url,       # 用于封面图生成
            "gender": req.gender,          # 用于封面图 prompt
            "cover_url": "",               # 封面图 URL（异步填充）
            "cover_status": "idle",
            "cover_error": "",
            "cover_task_id": "",
            "preset": "default",
            "bgm_dir": "",
            "bgm_volume": 0.32,
            "business_card_text": "",
            "error": "",
            "estimated_minutes": 30,
        }

        # 7. 启动后台轮询
        import asyncio
        poll_task = asyncio.create_task(_poll_video_task(video_task_id))
        _poll_tasks[video_task_id] = poll_task

        return TaskStatusResponse(
            task_id=video_task_id,
            status="queued",
            progress=0,
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


async def _run_post_process(task_id: str, video_url: str):
    stored = _task_store.get(task_id, {})
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
                "post_error": result.error,
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

        # ── 自动字幕：未提供预生成字幕文件时，自动执行 ASR 语音识别 ──
        asr_subtitle_path = (req.subtitle_file_path or "").strip()
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
                _edit_task_store[edit_job_id]["progress"] = 75

                # 3) 生成 ASS 字幕文件（带精确时间轴）
                asr_subtitle_path = timed_sentences_to_subtitle(
                    sentences=asr_result.sentences,
                    output_dir=output_dir,
                    filename_prefix=f"asr_{edit_job_id}",
                    format="ass",
                )
                _edit_task_store[edit_job_id]["progress"] = 85

                logging.info(
                    f"[edit:{edit_job_id}] ASR 字幕生成完成: "
                    f"{len(asr_result.sentences)} 句, "
                    f"文本 {len(asr_result.text)} 字, "
                    f"耗时 {asr_result.latency_ms}ms"
                )
            except Exception as asr_err:
                # ASR 失败不阻塞剪辑，回退到按字数均分时间轴的传统方案
                logging.warning(
                    f"[edit:{edit_job_id}] ASR 自动字幕失败，回退到字符比例模式: {asr_err}"
                )
                asr_subtitle_path = ""

        # ── 端到端单次 render ──
        business_card_text = req.business_card_text if req.business_card_text.strip() else ""
        bgm_volume = max(0.0, min(float(req.bgm_volume), 1.0))

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
            bgm_dir=_resolve_bgm_dir(req.bgm_dir),
            bgm_volume=bgm_volume,
            input_video_path=input_path,
            subtitle_file_path=asr_subtitle_path or req.subtitle_file_path,
            slide_image_paths=slide_temp_paths or None,
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
            "error": result.error or "剪辑失败",
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
    require_user(request)
    if not req.audio_base64 or not req.script.strip():
        raise HTTPException(status_code=400, detail="缺少必填参数: audio_base64, script")
    if len(req.script) > 5000:
        raise HTTPException(status_code=400, detail={"code": "SCRIPT_TOO_LONG", "message": "脚本超过 5000 字"})
    check_base64_size(req.audio_base64, max_mb=50, name="audio_base64")

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


# ── POST /api/video/image-to-video ──────────────────────────────


@app.post("/api/video/image-to-video", response_model=ImageToVideoResponse)
async def video_image_to_video(req: ImageToVideoRequest, request: Request):
    """
    图文视频创作任务

    流程: 多图片 + 音色样本上传 → 声音克隆（RunningHub）→ ffmpeg 合成（图片+字幕+转场+BGM）
    """
    require_user(request)
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

    rh = _get_rh_client()
    audio_path = None
    image_temp_paths: list[str] = []
    task_id = f"img2vid_{int(time.time() * 1000)}_{os.urandom(3).hex()}"

    try:
        # 1. 解码所有图片 base64 → 临时文件
        for idx, img_b64 in enumerate(req.images_base64):
            img_path = await _base64_to_temp_file(img_b64, f"_img{idx}.png")
            image_temp_paths.append(img_path)

        # 2. 解码音色样本
        audio_path = await _base64_to_temp_file(req.audio_base64, ".mp3")

        # 3. 上传音色到 RunningHub
        print(f"[image-to-video/{task_id}] Uploading voice sample: {audio_path}")
        audio_url = await rh.upload_file(audio_path)

        # 4. 声音克隆（直接用全文生成完整配音）
        print(f"[image-to-video/{task_id}] Submitting audio clone")
        audio_clone_task_id = await rh.submit_audio_clone(audio_url, audio_url, req.script)

        # 5. 等待克隆完成
        print(f"[image-to-video/{task_id}] Waiting for audio clone: {audio_clone_task_id}")
        audio_result = await rh.wait_for_completion(audio_clone_task_id, max_wait=600)
        audio_clone_url = audio_result.get("results", [{}])[0].get("url", "")
        if not audio_clone_url:
            raise HTTPException(status_code=502, detail="音频克隆完成但未返回结果 URL")

        # 6. 下载克隆音频到本地
        print(f"[image-to-video/{task_id}] Downloading cloned audio: {audio_clone_url}")
        output_dir = os.path.join(POST_PROCESS_ROOT, task_id)
        os.makedirs(output_dir, exist_ok=True)
        voice_local_path = os.path.join(output_dir, f"{task_id}_voice.mp3")
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.get(audio_clone_url)
            resp.raise_for_status()
            with open(voice_local_path, "wb") as f:
                f.write(resp.content)

        # 7. 调用 ffmpeg 图文视频合成
        print(f"[image-to-video/{task_id}] Starting ffmpeg image-video render")
        bgm_dir = _resolve_bgm_dir("")
        bgm_volume = max(0.0, min(float(req.bgm_volume), 1.0))
        result = await asyncio.to_thread(
            image_video_render,
            task_id=task_id,
            output_dir=output_dir,
            image_paths=image_temp_paths,
            script=req.script,
            voice_audio_path=voice_local_path,
            bgm_dir=bgm_dir,
            bgm_volume=bgm_volume,
        )

        if result.ok and result.output_path:
            # 产物文件存在性 + 大小校验（防止 ffmpeg 上报成功但产物异常导致返回 .htm）
            if not os.path.isfile(result.output_path):
                err_msg = f"ffmpeg 上报成功但产物文件不存在: {result.output_path}"
                print(f"[image-to-video/{task_id}] {err_msg}", flush=True)
                return ImageToVideoResponse(
                    task_id=task_id,
                    status="failed",
                    error=err_msg,
                )
            file_size = os.path.getsize(result.output_path)
            if file_size < 1024:
                err_msg = f"ffmpeg 产物过小 ({file_size} bytes)，疑似损坏: {result.output_path}"
                print(f"[image-to-video/{task_id}] {err_msg}", flush=True)
                return ImageToVideoResponse(
                    task_id=task_id,
                    status="failed",
                    error=err_msg,
                )
            rel_path = os.path.relpath(result.output_path, POST_PROCESS_ROOT).replace(os.sep, "/")
            # 返回绝对 URL（含 FastAPI base），避免 Next.js 反代未覆盖 /static/* 时 404
            public_url = f"{str(request.base_url).rstrip('/')}/static/video-postprocess/{rel_path}"
            print(f"[image-to-video/{task_id}] Done → {public_url} ({file_size} bytes)")
            return ImageToVideoResponse(
                task_id=task_id,
                status="success",
                video_url=public_url,
                audio_url=audio_clone_url,
            )
        else:
            return ImageToVideoResponse(
                task_id=task_id,
                status="failed",
                error=result.error,
            )

    except RunningHubError as e:
        raise HTTPException(status_code=e.status_code or 502, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"图文视频生成流程异常: {e}")
    finally:
        _cleanup_temp(*[p for p in ([audio_path] if audio_path else [])], *image_temp_paths)


# ── POST /api/video/mashup ──────────────────────────────────────


@app.post("/api/video/mashup", response_model=MashupVideoResponse)
async def video_mashup(req: MashupVideoRequest, request: Request):
    """
    视频混剪创作任务

    流程: 多视频 + 音色样本上传 → 声音克隆（RunningHub）→ ffmpeg 混剪（视频拼接+字幕+转场+BGM）
    """
    require_user(request)
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

    rh = _get_rh_client()
    audio_path = None
    video_temp_paths: list[str] = []
    task_id = f"mashup_{int(time.time() * 1000)}_{os.urandom(3).hex()}"

    try:
        # 1. 解码所有视频 base64 → 临时文件
        for idx, vid_b64 in enumerate(req.videos_base64):
            vid_path = await _base64_to_temp_file(vid_b64, f"_vid{idx}.mp4")
            video_temp_paths.append(vid_path)

        # 2. 解码音色样本
        audio_path = await _base64_to_temp_file(req.audio_base64, ".mp3")

        # 3. 上传音色到 RunningHub
        print(f"[mashup/{task_id}] Uploading voice sample")
        audio_url = await rh.upload_file(audio_path)

        # 4. 声音克隆
        print(f"[mashup/{task_id}] Submitting audio clone")
        audio_clone_task_id = await rh.submit_audio_clone(audio_url, audio_url, req.script)

        # 5. 等待克隆完成
        print(f"[mashup/{task_id}] Waiting for audio clone: {audio_clone_task_id}")
        audio_result = await rh.wait_for_completion(audio_clone_task_id, max_wait=600)
        audio_clone_url = audio_result.get("results", [{}])[0].get("url", "")
        if not audio_clone_url:
            raise HTTPException(status_code=502, detail="音频克隆完成但未返回结果 URL")

        # 6. 下载克隆音频
        print(f"[mashup/{task_id}] Downloading cloned audio")
        output_dir = os.path.join(POST_PROCESS_ROOT, task_id)
        os.makedirs(output_dir, exist_ok=True)
        voice_local_path = os.path.join(output_dir, f"{task_id}_voice.mp3")
        async with httpx.AsyncClient(timeout=120.0) as client:
            resp = await client.get(audio_clone_url)
            resp.raise_for_status()
            with open(voice_local_path, "wb") as f:
                f.write(resp.content)

        # 7. 调用 ffmpeg 视频混剪
        print(f"[mashup/{task_id}] Starting ffmpeg mashup render")
        bgm_dir = _resolve_bgm_dir("")
        bgm_volume = max(0.0, min(float(req.bgm_volume), 1.0))
        result = await asyncio.to_thread(
            mashup_video_render,
            task_id=task_id,
            output_dir=output_dir,
            video_paths=video_temp_paths,
            script=req.script,
            voice_audio_path=voice_local_path,
            bgm_dir=bgm_dir,
            bgm_volume=bgm_volume,
        )

        if result.ok and result.output_path:
            # 产物文件存在性 + 大小校验（防止 ffmpeg 上报成功但产物异常导致返回 .htm）
            if not os.path.isfile(result.output_path):
                err_msg = f"ffmpeg 上报成功但产物文件不存在: {result.output_path}"
                print(f"[mashup/{task_id}] {err_msg}", flush=True)
                return MashupVideoResponse(
                    task_id=task_id,
                    status="failed",
                    error=err_msg,
                )
            file_size = os.path.getsize(result.output_path)
            if file_size < 1024:
                err_msg = f"ffmpeg 产物过小 ({file_size} bytes)，疑似损坏: {result.output_path}"
                print(f"[mashup/{task_id}] {err_msg}", flush=True)
                return MashupVideoResponse(
                    task_id=task_id,
                    status="failed",
                    error=err_msg,
                )
            rel_path = os.path.relpath(result.output_path, POST_PROCESS_ROOT).replace(os.sep, "/")
            # 返回绝对 URL（含 FastAPI base），避免 Next.js 反代未覆盖 /static/* 时 404
            public_url = f"{str(request.base_url).rstrip('/')}/static/video-postprocess/{rel_path}"
            print(f"[mashup/{task_id}] Done → {public_url} ({file_size} bytes)")
            return MashupVideoResponse(
                task_id=task_id,
                status="success",
                video_url=public_url,
                audio_url=audio_clone_url,
            )
        else:
            return MashupVideoResponse(
                task_id=task_id,
                status="failed",
                error=result.error,
            )

    except RunningHubError as e:
        raise HTTPException(status_code=e.status_code or 502, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"视频混剪流程异常: {e}")
    finally:
        _cleanup_temp(*[p for p in ([audio_path] if audio_path else [])], *video_temp_paths)


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
    user = get_current_user(request)
    if not user:
        raise HTTPException(status_code=401, detail={"code": "NOT_LOGGED_IN", "message": "未登录"})
    scene = (req.scene or "").strip()
    if not scene:
        raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": "scene 不能为空"})
    if scene == "video_creation":
        cost = VIDEO_CREATION_COST
    elif scene == "ai_chat":
        cost = CHAT_COST
    else:
        cost = req.cost
        if cost is None:
            raise HTTPException(status_code=400, detail={"code": "INVALID_INPUT", "message": "缺少 cost"})
    new_balance = consume(user.id, cost, ref_id=req.ref_id or scene, note=req.note or scene)
    return {"balance": new_balance, "cost": cost, "scene": scene}


@app.get("/api/credit/redeem-codes")
async def credit_redeem_codes_admin(request: Request):
    _require_admin_key(request)
    return {"amounts": list(REDEEM_CODE_AMOUNTS), "batches": list_redeem_code_batches()}


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


def _validate_extract_url(url: str) -> str:
    """对用户传入的视频链接做协议 + 主机白名单 + 内网拦截校验。"""
    from urllib.parse import urlparse
    import ipaddress

    cleaned = (url or "").strip()
    if not cleaned:
        raise HTTPException(status_code=400, detail="请输入视频链接")
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
    return cleaned


@app.post("/api/copywriting/extract", response_model=CopyExtractResponse)
async def copywriting_extract(req: CopyExtractRequest, request: Request):
    """
    提交文案提取任务

    流程：校验来源域名 → 创建任务 → 异步执行（字幕优先 → ASR） → 轮询状态
    """
    user = require_user(request)
    safe_url = _validate_extract_url(req.url or "")

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

            task["progress"] = 85
            task["sentence_count"] = len(result.sentences)

            # 3) 生成字幕文件（直接使用 FlashRecognizer 的句子时间轴）
            subtitle_path = timed_sentences_to_subtitle(
                sentences=result.sentences,
                output_dir=tmpdir,
                filename_prefix=f"asr_{task_id}",
                format=req.subtitle_format,
            )

            # 4) 将字幕文件复制到持久化目录
            import shutil
            dest_dir = os.path.join(POST_PROCESS_ROOT, "subtitles")
            os.makedirs(dest_dir, exist_ok=True)
            dest_path = os.path.join(dest_dir, os.path.basename(subtitle_path))
            shutil.copy2(subtitle_path, dest_path)

            task["status"] = "completed"
            task["progress"] = 100
            task["subtitle_path"] = dest_path
            task["subtitle_text"] = result.text

            logger.info(
                f"[auto_subtitle:{task_id}] 字幕生成完成: {dest_path} "
                f"(FlashRecognizer: {len(result.sentences)} 句, "
                f"耗时 {result.latency_ms}ms, "
                f"文本 {len(result.text)} 字)"
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
        real_video = os.path.realpath(req.video_path.strip())
        allowed_roots = [os.path.realpath(POST_PROCESS_ROOT), os.path.realpath(MANUAL_UPLOAD_ROOT)]
        if not any(real_video == r or real_video.startswith(r + os.sep) for r in allowed_roots):
            raise HTTPException(
                status_code=400,
                detail={"code": "PATH_OUTSIDE_ALLOWED", "message": "video_path 必须在受信任目录内"},
            )

    task_id = _new_auto_subtitle_task_id()
    _auto_subtitle_tasks[task_id] = {
        "task_id": task_id,
        "user_id": user.id,
        "status": "queued",
        "progress": 0,
        "subtitle_path": "",
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

    return AutoSubtitleResponse(
        task_id=task["task_id"],
        status=task["status"],
        subtitle_path=task.get("subtitle_path", ""),
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
def central_activate(req: ActivateRequest):
    """激活码校验 + 密钥下发"""
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

        return ActivateResponse(
            plan=plan,
            expires_at=expires_at,
            keys=keys,
            server_time=now,
        )
    finally:
        conn.close()


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


# ── 全局 404 handler：API 路径返回 JSON，避免返回 HTML 错误页导致前端下载到 .htm ──
@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    path = str(request.url.path)
    # /api/* 路径返回 JSON；/static/* 由 StaticFiles 自己处理
    if path.startswith("/api/"):
        return JSONResponse(status_code=404, content={"detail": "not_found", "path": path})
    # 其他路径：抛出原始 404（由 FastAPI 默认处理）
    from fastapi import HTTPException as _HTTPException
    raise _HTTPException(status_code=404, detail="Not Found")
